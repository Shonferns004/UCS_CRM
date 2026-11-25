import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import '../widgets/app_toast.dart';
import 'package:flutter_tabler_icons/flutter_tabler_icons.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:image_picker/image_picker.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:liquid_pull_to_refresh/liquid_pull_to_refresh.dart';
import '../services/api_exception.dart';
import '../services/api_service.dart';
import '../services/location_service.dart';
import '../services/offline_punch_queue.dart';
import '../services/realtime_service.dart';
import '../services/remote_config_service.dart';
import '../widgets/skeleton_loader.dart';
import '../widgets/mini_calendar.dart';
import '../widgets/ui_motion.dart';
import '../theme/app_palette.dart';
import '../main.dart';
import '../utils/responsive.dart';

import 'scanner_page.dart';
import 'leave_page.dart';
import 'advance_page.dart';
import 'admin_attendance_page.dart';

class HomePage extends StatefulWidget {
  final int tabChangeVersion;
  final VoidCallback? onLogout;
  const HomePage({super.key, required this.tabChangeVersion, this.onLogout});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage>
    with TickerProviderStateMixin, WidgetsBindingObserver {
  static const Duration _minPunchOutDelay = Duration(minutes: 5);
  final ScrollController _scrollController = ScrollController();
  Timer? _refreshTimer;
  DateTime? _punchInTime;
  DateTime? _punchOutTime;
  bool _isPunchedIn = false;
  bool _isPunchedOut = false;
  // Guards the punch button while a scan/request is in flight: a double tap
  // used to open two scanners and could fire punch-in and punch-out for the
  // same physical action.
  bool _punchBusy = false;
  bool _loading = true;
  bool _isPressing = false;
  int _lateUsed = 0;
  String _workerName = '';
  String _workerId = '';
  String _workerRole = '';
  String _workerDepartment = '';
  int _pendingPunchCount = 0;
  // Frontend-only streak indicator: consecutive working days marked late.
  int _lateStreakDays = 0;
  DateTime? _lastStreakFetch;
  bool _backendUnreachable = false;
  String? _backendToastId;
  String _officeStartTime = '10:00';
  late final AnimationController _pulseCtrl;
  late final Animation<double> _pulseAnim;
  late final AnimationController _bellCtrl;
  late final Animation<double> _bellAnim;
  String _officeEndTime = '19:00';
  List<Map<String, dynamic>> _notifications = [];
  int _unreadCount = 0;
  List<dynamic> _pendingLoans = [];
  bool _isAdmin = false;
  List<dynamic> _absenceDays = [];
  Set<String> _readAbsenceDates = {};
  Set<String> _dismissedAbsenceDates = {};
  List<dynamic> _pendingAbsenceProofs = [];
  int _monthPresent = 0;
  int _monthAbsent = 0;
  int _monthLate = 0;
  int _monthLeave = 0;
  int _monthHalfDay = 0;
  int _monthLateMinutes = 0;
  double _monthLateDeductionDays = 0;
  Map<String, String> _monthStatusByDate = {};
  Map<String, Map<String, dynamic>> _monthHistoryByDate = {};
  Map<String, dynamic>? _lateThresholds;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _pulseCtrl = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 2),
    )..repeat();
    _pulseAnim = Tween<double>(
      begin: 0.0,
      end: 1.0,
    ).animate(CurvedAnimation(parent: _pulseCtrl, curve: Curves.easeOut));
    _bellCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 3000),
    );
    _bellAnim = TweenSequence<double>([
      TweenSequenceItem(
        tween: Tween(
          begin: 0.0,
          end: -0.18,
        ).chain(CurveTween(curve: Curves.easeOut)),
        weight: 1,
      ),
      TweenSequenceItem(tween: Tween(begin: -0.18, end: 0.18), weight: 1),
      TweenSequenceItem(tween: Tween(begin: 0.18, end: -0.12), weight: 1),
      TweenSequenceItem(tween: Tween(begin: -0.12, end: 0.06), weight: 1),
      TweenSequenceItem(tween: Tween(begin: 0.06, end: 0.0), weight: 1),
      TweenSequenceItem(tween: ConstantTween(0.0), weight: 6),
    ]).animate(_bellCtrl);
    _refreshTimer = Timer.periodic(const Duration(seconds: 30), (_) {
      _fetchStatus();
      _syncPendingPunches();
      _probeBackend();
    });
    _fetchStatus();
    _fetchMonthlySummary();
    _updatePendingBadge();
    _syncPendingPunches();
    _probeBackend();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _fetchStatus();
      _syncPendingPunches();
    }
  }

  @override
  void didUpdateWidget(covariant HomePage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.tabChangeVersion != oldWidget.tabChangeVersion) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_scrollController.hasClients) _scrollController.jumpTo(0);
      });
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    RealtimeService.instance.removeListener(_onRealtimeChange);
    _dismissBackendToast();
    _refreshTimer?.cancel();
    _scrollController.dispose();
    _pulseCtrl.dispose();
    _bellCtrl.dispose();
    super.dispose();
  }

  Duration? get _punchOutCountdown {
    if (!_isPunchedIn || _isPunchedOut || _punchInTime == null) return null;
    final remaining =
        _minPunchOutDelay - DateTime.now().difference(_punchInTime!);
    return remaining.isNegative ? null : remaining;
  }

  bool get _canPunchOut =>
      _isPunchedIn && !_isPunchedOut && _punchOutCountdown == null;

  String get _punchOutCountdownText {
    final remaining = _punchOutCountdown;
    if (remaining == null) return '';
    final total = remaining.inSeconds;
    final m = (total ~/ 60).toString().padLeft(2, '0');
    final s = (total % 60).toString().padLeft(2, '0');
    return '$m:$s';
  }

  Future<void> _fetchStatus() async {
    try {
      final worker = await ApiService.getWorkerData();
      _workerName = worker?['name'] ?? '';
      _workerId = worker?['id']?.toString() ?? '';
      _workerRole =
          worker?['role']?.toString() ??
          worker?['designation']?.toString() ??
          '';
      _workerDepartment = worker?['department']?.toString() ?? '';
      final isAdmin =
          (worker?['role']?.toString().toLowerCase() == 'admin' ||
          worker?['department']?.toString().toLowerCase() == 'ngo admin');
      _isAdmin = isAdmin;

      if (_workerId.isNotEmpty) {
        try {
          RealtimeService.instance.init(_workerId, isAdmin: isAdmin);
        } catch (_) {}
      }
      RealtimeService.instance.removeListener(_onRealtimeChange);
      RealtimeService.instance.addListener(_onRealtimeChange);

      try {
        final cachedStatus = await ApiService.getCachedTodayStatus();
        if (cachedStatus != null) _applyTodayStatus(cachedStatus);
      } catch (_) {}

      try {
        if (_workerId.isNotEmpty) {
          final cachedNotifs = await ApiService.getCachedNotifications(
            _workerId,
          );
          if (cachedNotifs != null) {
            setState(() {
              _notifications = cachedNotifs.cast<Map<String, dynamic>>();
              _unreadCount = _notifications
                  .where((n) => n['read_at'] == null)
                  .length;
            });
          }
        }
      } catch (_) {}

      try {
        await _loadAbsenceProofs();
      } catch (_) {}
    } catch (_) {}

    if (mounted) setState(() => _loading = false);

    try {
      final today = await ApiService.getTodayStatus();

      _officeStartTime = (today['officeStartTime'] ?? '10:00') as String;
      _officeEndTime = (today['officeEndTime'] ?? '19:00') as String;

      final att = today['attendance'];
      if (mounted) {
        setState(() {
          _lateUsed = today['lateUsed'] ?? 0;
          if (att != null) {
            _isPunchedIn = att['punch_in_time'] != null;
            _isPunchedOut = att['punch_out_time'] != null;
            _punchInTime = att['punch_in_time'] != null
                ? DateTime.tryParse(att['punch_in_time'].toString())
                : null;
            _punchOutTime = att['punch_out_time'] != null
                ? DateTime.tryParse(att['punch_out_time'].toString())
                : null;
          }
        });
      }
    } catch (_) {}

    try {
      if (_workerId.isNotEmpty) {
        final notifs = await ApiService.getNotifications(_workerId);
        if (mounted) {
          setState(() {
            _notifications = notifs.cast<Map<String, dynamic>>();
            _unreadCount = _notifications
                .where((n) => n['read_at'] == null)
                .length;
          });
        }
      }
    } catch (_) {}

    try {
      final loans = await ApiService.getMyLoans();
      if (mounted) {
        setState(() {
          _pendingLoans = loans
              .where(
                (l) => l['status'] == 'approved' || l['status'] == 'pending',
              )
              .toList();
        });
      }
    } catch (_) {}

    // Refreshed at most every 5 minutes — the history endpoint is heavier than
    // the status poll and the streak only changes once a day.
    if (_lastStreakFetch == null ||
        DateTime.now().difference(_lastStreakFetch!) >
            const Duration(minutes: 5)) {
      _lastStreakFetch = DateTime.now();
      _loadLateStreak();
    }
  }

  void _applyTodayStatus(Map<String, dynamic> today) {
    final att = today['attendance'];
    setState(() {
      _officeStartTime = (today['officeStartTime'] ?? '10:00') as String;
      _officeEndTime = (today['officeEndTime'] ?? '19:00') as String;
      _lateUsed = today['lateUsed'] ?? 0;
      if (att != null) {
        _isPunchedIn = att['punch_in_time'] != null;
        _isPunchedOut = att['punch_out_time'] != null;
        _punchInTime = att['punch_in_time'] != null
            ? DateTime.tryParse(att['punch_in_time'].toString())
            : null;
        _punchOutTime = att['punch_out_time'] != null
            ? DateTime.tryParse(att['punch_out_time'].toString())
            : null;
      }
    });
  }

  void _cacheTodayState(String? punchIn, String? punchOut) {
    final today = {
      'officeStartTime': _officeStartTime,
      'officeEndTime': _officeEndTime,
      'lateUsed': _lateUsed,
      'attendance': {'punch_in_time': punchIn, 'punch_out_time': punchOut},
    };
    ApiService.cacheTodayStatus(today);
  }

  Future<void> _updatePendingBadge() async {
    final count = await OfflinePunchQueue.pendingCount();
    if (mounted) setState(() => _pendingPunchCount = count);
  }

  // Counts the latest run of working days that are all marked "late".
  // Weekends/holidays have no rows and leave rows are skipped, so the streak
  // is measured in actual working days. UI-only: no payroll maths here.
  Future<void> _loadLateStreak() async {
    try {
      List<dynamic>? history;
      try {
        history = await ApiService.getHistory();
      } catch (_) {
        history = await ApiService.getCachedHistory();
      }
      if (history == null || !mounted) return;

      final working =
          history.where((r) {
            final s = r['status']?.toString();
            return s == 'present' ||
                s == 'late' ||
                s == 'half-day' ||
                s == 'absent';
          }).toList()..sort(
            (a, b) => (b['date']?.toString() ?? '').compareTo(
              a['date']?.toString() ?? '',
            ),
          );

      var streak = 0;
      for (final r in working) {
        if (r['status']?.toString() == 'late') {
          streak++;
        } else {
          break;
        }
      }
      if (mounted && streak != _lateStreakDays) {
        setState(() => _lateStreakDays = streak);
      }
    } catch (_) {}
  }

  /// Loads this month's attendance stats for the two home summary cards.
  Future<void> _fetchMonthlySummary() async {
    final now = DateTime.now();
    try {
      final results = await Future.wait([
        ApiService.getHistory(),
        ApiService.getMySalaryBreakdown(year: now.year, month: now.month),
      ]);
      final history = results[0] as List<dynamic>;
      final breakdown = results[1] as Map<String, dynamic>?;

      int present = 0, absent = 0, late = 0, leave = 0, halfDay = 0;
      int lateMinutes = 0;
      final statusMap = <String, String>{};
      final detailMap = <String, Map<String, dynamic>>{};

      for (final rec in history) {
        final date = rec['date']?.toString() ?? '';
        final dt = DateTime.tryParse(date);
        if (dt == null || dt.year != now.year || dt.month != now.month) {
          continue;
        }
        final status = rec['status']?.toString() ?? 'present';
        statusMap[date] = status;
        detailMap[date] = {
          'date': date,
          'status': status,
          'punch_in_time': rec['punch_in_time'],
          'punch_out_time': rec['punch_out_time'],
          'late_minutes': rec['late_minutes'],
        };
        lateMinutes += ((rec['late_minutes'] as num?) ?? 0).toInt();
        switch (status) {
          case 'present':
            present++;
            break;
          case 'late':
            late++;
            break;
          case 'absent':
            absent++;
            break;
          case 'leave':
            leave++;
            break;
          case 'half-day':
            halfDay++;
            break;
        }
      }

      final bdLate = breakdown?['totalLateMinutes'];
      if (bdLate is num) lateMinutes = bdLate.toInt();
      final bdDays = breakdown?['lateDeductionDays'];
      final lateDeductionDays = bdDays is num ? bdDays.toDouble() : 0.0;

      if (mounted) {
        setState(() {
          _monthPresent = present;
          _monthAbsent = absent;
          _monthLate = late;
          _monthLeave = leave;
          _monthHalfDay = halfDay;
          _monthLateMinutes = lateMinutes;
          _monthLateDeductionDays = lateDeductionDays;
          _monthStatusByDate = statusMap;
          _monthHistoryByDate = detailMap;
          _lateThresholds = breakdown?['lateThresholds'] is Map
              ? Map<String, dynamic>.from(breakdown!['lateThresholds'] as Map)
              : null;
        });
      }
    } catch (_) {}
  }

  int get _attendancePercent {
    final attended = _monthPresent + _monthLate + _monthHalfDay * 0.5;
    final total =
        _monthPresent + _monthLate + _monthAbsent + _monthLeave + _monthHalfDay;
    if (total <= 0) return 0;
    return ((attended / total) * 100).round().clamp(0, 100);
  }

  /// Makes an unreachable backend visible instead of failing silently.
  ///
  /// A stopped tunnel or a captive proxy does not throw — it answers
  /// HTTP 200 with an error page — so without this the worker's only symptom
  /// was a punch that quietly did not save.
  Future<void> _probeBackend() async {
    final reachable = await ApiService.checkConnectivity(
      timeout: const Duration(seconds: 5),
    );
    if (!mounted) return;
    if (!reachable) {
      if (!_backendUnreachable) {
        setState(() => _backendUnreachable = true);
        _showBackendToast();
      }
      return;
    }
    if (_backendUnreachable) {
      setState(() => _backendUnreachable = false);
    }
    _dismissBackendToast();
  }

  void _showBackendToast() {
    _dismissBackendToast();
    _backendToastId = AppToast.action(
      'Backend unreachable',
      description:
          'Punches may not save. Queued punches will sync automatically once it is back.',
      actionLabel: 'Retry',
      duration: const Duration(seconds: 12),
      onAction: _retryBackend,
    );
  }

  void _dismissBackendToast() {
    final id = _backendToastId;
    if (id != null) {
      AppToast.dismiss(id);
      _backendToastId = null;
    }
  }

  Future<void> _retryBackend() async {
    final reachable = await ApiService.checkConnectivity(
      timeout: const Duration(seconds: 4),
    );
    if (!mounted) return;
    if (reachable) {
      if (_backendUnreachable) setState(() => _backendUnreachable = false);
      _dismissBackendToast();
      _fetchStatus();
      _syncPendingPunches();
    } else {
      _showBackendToast();
    }
  }

  Future<void> _syncPendingPunches() async {
    final online = await ApiService.checkConnectivity();
    if (!online) return;
    final syncing = await OfflinePunchQueue.isSyncing();
    if (syncing) return;
    // Without an identity we cannot tell whose punch we would be replaying —
    // never post another account's queued punch with this session's token.
    var workerId = _workerId;
    if (workerId.isEmpty) {
      final worker = await ApiService.getWorkerData();
      workerId = worker?['id']?.toString() ?? '';
    }
    if (workerId.isEmpty) return;
    await OfflinePunchQueue.setSyncing(true);
    String? rejected;
    bool syncedAny = false;
    try {
      final pending = await OfflinePunchQueue.getPending(workerId: workerId);
      for (final record in pending) {
        try {
          // Replay with the time the punch actually happened — the server
          // stamps the record (and picks the day) from this, not from the sync
          // moment.
          final punchTime = DateTime.tryParse(
            record['timestamp']?.toString() ?? '',
          );
          if (record['action'] == 'punch_in') {
            await ApiService.punchIn(
              record['code'] ?? '',
              (record['latitude'] as num).toDouble(),
              (record['longitude'] as num).toDouble(),
              punchMethod: record['punch_method'] as String?,
              punchTime: punchTime,
            );
          } else if (record['action'] == 'punch_out') {
            await ApiService.punchOut(
              (record['latitude'] as num).toDouble(),
              (record['longitude'] as num).toDouble(),
              punchMethod: record['punch_method'] as String?,
              punchTime: punchTime,
            );
          }
          await OfflinePunchQueue.remove(record['local_id'] as String);
          syncedAny = true;
        } on ApiException catch (e) {
          if (e.kind != ApiErrorKind.business) {
            // Transient — leave it queued and retry on the next pass.
            break;
          }
          // The server rejected this punch outright ("Already punched in
          // today", "Outside range"). Retrying it forever would wedge every
          // punch queued behind it, so drop it and tell the worker instead.
          await OfflinePunchQueue.remove(record['local_id'] as String);
          rejected = e.message;
        } catch (_) {
          // Unrecognised failure — treat as transient rather than risk
          // discarding a punch that may still be valid.
          break;
        }
      }
    } finally {
      await OfflinePunchQueue.setSyncing(false);
      await _updatePendingBadge();
    }
    // Pull the server's version of today's record so the screen shows the real
    // punch times instead of the locally guessed ones.
    if (syncedAny) {
      await _fetchStatus();
    }
    if (rejected != null && mounted) {
      AppToast.error(
        'A queued punch was rejected',
        description: '$rejected',
        duration: const Duration(seconds: 5),
      );
    }
  }

  Future<void> _punchIn() async {
    if (_punchBusy) return;
    _punchBusy = true;
    try {
      final result = await Navigator.push<Map<String, dynamic>>(
        context,
        MaterialPageRoute(builder: (_) => const ScannerPage()),
      );
      if (result == null || !mounted) return;

      final online = await ApiService.checkConnectivity();
      final isOffline = !online;

      // The scan is the punch. Everything below (queue, offline replay) must
      // carry this instant, otherwise the server stamps the sync time.
      final punchTime = DateTime.now();
      final localId = 'in-${punchTime.microsecondsSinceEpoch}';

      final code = result['code'] ?? '';
      final lat = (result['lat'] as num).toDouble();
      final lng = (result['lng'] as num).toDouble();
      final punchMethod = result['punch_method'] as String?;

      if (isOffline) {
        // Queue for later sync
        await OfflinePunchQueue.enqueue({
          'local_id': localId,
          'action': 'punch_in',
          'code': code,
          'latitude': lat,
          'longitude': lng,
          'punch_method': punchMethod,
          'worker_id': _workerId,
          'timestamp': punchTime.toUtc().toIso8601String(),
        });
        setState(() {
          _isPunchedIn = true;
          _punchInTime = punchTime;
          _isPunchedOut = false;
          _punchOutTime = null;
        });
        _cacheTodayState(punchTime.toIso8601String(), null);
        if (mounted) {
          HapticFeedback.vibrate();
          AppToast.warning(
            'Punched in (offline)',
            description: 'Will sync automatically once you are back online.',
          );
        }
        _updatePendingBadge();
        return;
      }

      try {
        final data = await ApiService.punchIn(
          code,
          lat,
          lng,
          punchMethod: punchMethod,
          punchTime: punchTime,
        );
        final lm = (data['lateMinutes'] ?? 0) as int;
        setState(() {
          _isPunchedIn = true;
          _punchInTime = punchTime;
          _isPunchedOut = false;
          _punchOutTime = null;
          if (lm > 0) _lateUsed += lm;
        });
        _cacheTodayState(punchTime.toIso8601String(), null);
        if (mounted) {
          HapticFeedback.vibrate();
          AppToast.success('Punched in successfully');
        }
      } catch (e) {
        // If network failed mid-request, queue it
        if (ApiService.isRetryableError(e)) {
          await OfflinePunchQueue.enqueue({
            'local_id': localId,
            'action': 'punch_in',
            'code': code,
            'latitude': lat,
            'longitude': lng,
            'punch_method': punchMethod,
            'worker_id': _workerId,
            'timestamp': punchTime.toUtc().toIso8601String(),
          });
          setState(() {
            _isPunchedIn = true;
            _punchInTime = punchTime;
            _isPunchedOut = false;
            _punchOutTime = null;
          });
          _cacheTodayState(punchTime.toIso8601String(), null);
          if (mounted) {
            HapticFeedback.vibrate();
            AppToast.warning(
              'Punch saved offline',
              description: 'Will sync automatically once you are back online.',
            );
          }
          _updatePendingBadge();
        } else {
          if (mounted) {
            final msg = _friendlyNetworkError(e);
            AppToast.error(msg);
          }
        }
      }
    } finally {
      _punchBusy = false;
    }
  }

  Future<void> _punchOut() async {
    if (_punchBusy) return;
    _punchBusy = true;
    try {
      await _punchOutInner();
    } finally {
      _punchBusy = false;
    }
  }

  Future<void> _punchOutInner() async {
    if (_punchOutCountdown != null) {
      if (mounted) {
        AppToast.warning('Punch out available in $_punchOutCountdownText');
      }
      return;
    }

    final result = await Navigator.push<Map<String, dynamic>>(
      context,
      MaterialPageRoute(builder: (_) => const ScannerPage()),
    );
    if (result == null || !mounted) return;

    final online = await ApiService.checkConnectivity();
    final isOffline = !online;

    // The scan is the punch-out; keep that instant through the offline queue.
    final punchTime = DateTime.now();
    final localId = 'out-${punchTime.microsecondsSinceEpoch}';

    final lat = (result['lat'] as num).toDouble();
    final lng = (result['lng'] as num).toDouble();
    final punchMethod = result['punch_method'] as String?;

    if (isOffline) {
      await OfflinePunchQueue.enqueue({
        'local_id': localId,
        'action': 'punch_out',
        'latitude': lat,
        'longitude': lng,
        'punch_method': punchMethod,
        'worker_id': _workerId,
        'timestamp': punchTime.toUtc().toIso8601String(),
      });
      setState(() {
        _isPunchedOut = true;
        _punchOutTime = punchTime;
      });
      _cacheTodayState(
        _punchInTime?.toIso8601String(),
        punchTime.toIso8601String(),
      );
      if (mounted) {
        HapticFeedback.vibrate();
        AppToast.warning(
          'Punched out (offline)',
          description: 'Will sync automatically once you are back online.',
        );
      }
      _updatePendingBadge();
      return;
    }

    try {
      await ApiService.punchOut(
        lat,
        lng,
        punchMethod: punchMethod,
        punchTime: punchTime,
      );
      setState(() {
        _isPunchedOut = true;
        _punchOutTime = punchTime;
      });
      _cacheTodayState(
        _punchInTime?.toIso8601String(),
        punchTime.toIso8601String(),
      );
      if (mounted) {
        HapticFeedback.vibrate();
        AppToast.success('Punched out successfully');
      }
    } catch (e) {
      if (ApiService.isRetryableError(e)) {
        await OfflinePunchQueue.enqueue({
          'local_id': localId,
          'action': 'punch_out',
          'latitude': lat,
          'longitude': lng,
          'punch_method': punchMethod,
          'worker_id': _workerId,
          'timestamp': punchTime.toUtc().toIso8601String(),
        });
        setState(() {
          _isPunchedOut = true;
          _punchOutTime = punchTime;
        });
        _cacheTodayState(
          _punchInTime?.toIso8601String(),
          punchTime.toIso8601String(),
        );
        if (mounted) {
          HapticFeedback.vibrate();
          AppToast.warning(
            'Punch saved offline',
            description: 'Will sync automatically once you are back online.',
          );
        }
        _updatePendingBadge();
      } else {
        if (mounted) {
          final msg = _friendlyNetworkError(e);
          AppToast.error(msg);
        }
      }
    }
  }

  void _onRealtimeChange() {
    final event = RealtimeService.instance.lastEvent;
    if (event == null) return;
    switch (event) {
      case RealtimeEvent.attendance:
      case RealtimeEvent.notifications:
      case RealtimeEvent.corrections:
      case RealtimeEvent.loans:
        _fetchStatus();
        _fetchMonthlySummary();
      case RealtimeEvent.absenceProofs:
        _loadAbsenceProofs();
      default:
        break;
    }
  }

  String _absenceKeyOf(dynamic day) =>
      (day is Map ? day['date']?.toString() : null) ?? '';

  int get _unreadAbsenceCount => _absenceDays
      .where((d) => !_readAbsenceDates.contains(_absenceKeyOf(d)))
      .length;

  Future<void> _loadAbsenceProofs() async {
    try {
      final data = await ApiService.getAbsenceProofActionable();
      var dismissed = <String>{};
      var read = <String>{};
      if (_workerId.isNotEmpty) {
        dismissed = await ApiService.getDismissedAbsenceDates(_workerId);
        read = await ApiService.getReadAbsenceDates(_workerId);
      }
      if (!mounted) return;
      final all = (data['unauthorizedAbsences'] as List?) ?? [];
      setState(() {
        _dismissedAbsenceDates = dismissed;
        _readAbsenceDates = read;
        _absenceDays = all
            .where((d) => !dismissed.contains(_absenceKeyOf(d)))
            .toList();
      });
    } catch (_) {}
    if (_isAdmin) {
      try {
        final proofs = await ApiService.getPendingAbsenceProofs();
        if (!mounted) return;
        setState(() => _pendingAbsenceProofs = proofs);
      } catch (_) {}
    }
  }

  Widget _buildAdminProofCard(ColorScheme sc, AppColors colors) {
    return InkWell(
      onTap: _openProofReviewSheet,
      borderRadius: BorderRadius.circular(22),
      child: Container(
        padding: EdgeInsets.all(Responsive.pad(context, 16)),
        decoration: BoxDecoration(
          color: sc.surface,
          borderRadius: BorderRadius.circular(22),
          boxShadow: AppPalette.lift(0.5),
        ),
        child: Row(
          children: [
            Container(
              width: Responsive.sp(context, 48),
              height: Responsive.sp(context, 48),
              decoration: BoxDecoration(
                color: const Color(0xffd6eaf7),
                borderRadius: BorderRadius.circular(22),
              ),
              child: Icon(
                TablerIcons.file_search,
                size: Responsive.sp(context, 22),
                color: const Color(0xff174a7c),
              ),
            ),
            SizedBox(width: Responsive.pad(context, 16)),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Absence Proofs',
                    style: GoogleFonts.hankenGrotesk(
                      fontSize: Responsive.sp(context, 16),
                      fontWeight: FontWeight.w600,
                      color: sc.onSurface,
                    ),
                  ),
                  Text(
                    '${_pendingAbsenceProofs.length} awaiting review',
                    style: TextStyle(
                      fontSize: Responsive.sp(context, 12),
                      fontWeight: FontWeight.w500,
                      color: sc.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
            ),
            Icon(
              TablerIcons.chevron_right,
              size: Responsive.sp(context, 20),
              color: sc.outline,
            ),
          ],
        ),
      ),
    );
  }

  void _openProofUploadSheet(Map<String, dynamic> day) {
    showSpringSheet(
      context: context,
      builder: (_) => _ProofUploadSheet(
        date: day['date']?.toString() ?? '',
        leaveId: day['leaveId']?.toString(),
        onUploaded: _loadAbsenceProofs,
      ),
    );
  }

  void _openProofReviewSheet() {
    showSpringSheet(
      context: context,
      builder: (_) => _ProofReviewSheet(
        proofs: List<dynamic>.from(_pendingAbsenceProofs),
        onReviewed: (id) {
          setState(
            () => _pendingAbsenceProofs = _pendingAbsenceProofs
                .where((p) => p['id'] != id)
                .toList(),
          );
        },
      ),
    );
  }

  String _friendlyNetworkError(Object e) {
    final s = e.toString();
    if (s.contains('SocketException') ||
        s.contains('Connection refused') ||
        s.contains('No route to host')) {
      return 'Network unreachable. Please check your internet connection.';
    }
    if (s.contains('TimeoutException') || s.contains('timed out')) {
      return 'Request timed out. Please try again.';
    }
    if (s.contains('FormatException') || s.contains('json')) {
      return 'Server error. Please try again later.';
    }
    return s.replaceFirst('Exception: ', '').trim();
  }

  String _fmtTime(dynamic ts) {
    if (ts == null) return '—';
    if (ts is DateTime) return DateFormat('hh:mm a').format(ts.toLocal());
    String s = ts.toString();
    if (!s.endsWith('Z') && !RegExp(r'[+-]\d{2}:\d{2}$').hasMatch(s)) s += 'Z';
    final t = DateTime.tryParse(s);
    if (t == null) return '—';
    return DateFormat('hh:mm a').format(t.toLocal());
  }

  Widget _homeStatCard({
    required IconData icon,
    required String title,
    required String value,
    required Color color,
    required VoidCallback onTap,
    String? subtitle,
  }) {
    final radius = BorderRadius.circular(22);
    return Container(
      height: Responsive.pad(context, 90),
      decoration: BoxDecoration(
        color: AppPalette.white,
        borderRadius: radius,
        boxShadow: AppPalette.lift(0.6),
      ),
      child: Material(
        color: Colors.transparent,
        borderRadius: radius,
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: EdgeInsets.all(Responsive.pad(context, 15)),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: Responsive.sp(context, 11),
                          fontWeight: FontWeight.w700,
                          letterSpacing: 0.2,
                          color: AppPalette.muted,
                        ),
                      ),
                      SizedBox(height: Responsive.pad(context, 4)),
                      Text(
                        value,
                        style: GoogleFonts.hankenGrotesk(
                          fontSize: Responsive.sp(context, 21),
                          fontWeight: FontWeight.w800,
                          color: color,
                        ),
                      ),
                      if (subtitle != null) ...[
                        SizedBox(height: Responsive.pad(context, 3)),
                        Text(
                          subtitle,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: Responsive.sp(context, 9.5),
                            fontWeight: FontWeight.w600,
                            color: AppPalette.muted.withValues(alpha: 0.8),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                SizedBox(width: Responsive.pad(context, 6)),
                Container(
                  width: Responsive.sp(context, 36),
                  height: Responsive.sp(context, 36),
                  decoration: BoxDecoration(
                    color: color.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(
                    icon,
                    size: Responsive.sp(context, 18),
                    color: color,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  String _fmtDays(num v) {
    if (v == v.roundToDouble()) return '${v.toInt()}';
    return v.toStringAsFixed(1);
  }

  void _syncBellAnimation(int alertCount) {
    if (alertCount > 0) {
      if (!_bellCtrl.isAnimating) _bellCtrl.repeat();
    } else if (_bellCtrl.isAnimating) {
      _bellCtrl.stop();
      _bellCtrl.value = 0;
    }
  }

  void _openLateDeductionRules() {
    final grace = (_lateThresholds?['grace'] as num?)?.toInt() ?? 180;
    final half = (_lateThresholds?['half'] as num?)?.toInt() ?? 240;
    final full = (_lateThresholds?['full'] as num?)?.toInt() ?? 480;
    showSpringSheet(
      context: context,
      builder: (_) => _LateDeductionSheet(
        minutes: _monthLateMinutes,
        grace: grace,
        half: half,
        full: full,
      ),
    );
  }

  void _openAttendanceSheet() {
    final now = DateTime.now();
    showSpringSheet(
      context: context,
      builder: (_) => _AttendanceSheet(
        year: now.year,
        month: now.month,
        percent: _attendancePercent,
        present: _monthPresent,
        absent: _monthAbsent,
        late: _monthLate,
        leave: _monthLeave,
        halfDay: _monthHalfDay,
        lateDeductionDays: _monthLateDeductionDays,
        statusByDate: _monthStatusByDate,
        historyByDate: _monthHistoryByDate,
      ),
    );
  }

  void _openAccountSheet() {
    showSpringSheet(
      context: context,
      builder: (_) => _AccountSheet(
        name: _workerName,
        role: _workerRole,
        department: _workerDepartment,
        employeeId: _workerId,
        isAdmin: _isAdmin,
        onLogout: widget.onLogout,
      ),
    );
  }

  void _openRequestSheet([int initialTab = 0]) {
    showSpringSheet(
      context: context,
      builder: (_) => _RequestSheet(initialTab: initialTab),
    );
  }

  void _openHelpSheet() {
    showSpringSheet(context: context, builder: (_) => const _HelpSheet());
  }

  void _openNotificationSheet() {
    final scheme = Theme.of(context).colorScheme;
    final textTheme = Theme.of(context).textTheme;

    showSpringSheet(
      context: context,
      builder: (_) => _NotificationSheet(
        notifications: _notifications,
        absenceDays: _absenceDays,
        unreadCount: _unreadCount,
        readAbsenceDates: _readAbsenceDates,
        workerId: _workerId,
        scheme: scheme,
        textTheme: textTheme,
        onAddProof: (day) =>
            _openProofUploadSheet(Map<String, dynamic>.from(day as Map)),
        onMarkRead: (id) async {
          try {
            await ApiService.markNotificationRead(id);
            final idx = _notifications.indexWhere(
              (n) => n['id']?.toString() == id,
            );
            if (idx != -1) {
              setState(() {
                _notifications[idx]['read_at'] = DateTime.now()
                    .toIso8601String();
                _unreadCount = _notifications
                    .where((n) => n['read_at'] == null)
                    .length;
              });
            }
          } catch (_) {}
        },
        onDelete: (id) async {
          final idx = _notifications.indexWhere(
            (n) => n['id']?.toString() == id,
          );
          final wasUnread = idx != -1 && _notifications[idx]['read_at'] == null;
          try {
            await ApiService.deleteNotification(id, workerId: _workerId);
          } catch (e) {
            debugPrint('deleteNotification error: $e');
          }
          setState(() {
            _notifications.removeWhere((n) => n['id']?.toString() == id);
            if (wasUnread && _unreadCount > 0) _unreadCount -= 1;
          });
        },
        onAbsenceRead: (date) async {
          try {
            if (_workerId.isNotEmpty) {
              await ApiService.markAbsenceRead(_workerId, date);
            }
          } catch (_) {}
          if (mounted) setState(() => _readAbsenceDates.add(date));
        },
        onAbsenceDelete: (date) async {
          try {
            if (_workerId.isNotEmpty) {
              await ApiService.dismissAbsenceDate(_workerId, date);
            }
          } catch (_) {}
          if (mounted) {
            setState(() {
              _dismissedAbsenceDates.add(date);
              _absenceDays.removeWhere((d) => _absenceKeyOf(d) == date);
            });
          }
        },
        onRefresh: () async {
          if (_workerId.isNotEmpty) {
            try {
              final notifs = await ApiService.getNotifications(_workerId);
              setState(() {
                _notifications = notifs.cast<Map<String, dynamic>>();
                _unreadCount = _notifications
                    .where((n) => n['read_at'] == null)
                    .length;
              });
            } catch (_) {}
          }
        },
      ),
    );
  }

  Future<void> _refreshAll() async {
    await Future.wait([
      _fetchStatus(),
      _fetchMonthlySummary(),
      _syncPendingPunches(),
      _probeBackend(),
    ]);
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const HomeSkeleton();

    final sc = Theme.of(context).colorScheme;
    final colors = Theme.of(context).extension<AppColors>()!;

    final firstName = _workerName.split(' ').first;
    final displayName = firstName.isNotEmpty
        ? '${firstName[0].toUpperCase()}${firstName.substring(1).toLowerCase()}'
        : 'there';
    final alertCount = _unreadCount + _unreadAbsenceCount;
    _syncBellAnimation(alertCount);
    final initials = _workerName
        .trim()
        .split(RegExp(r'\s+'))
        .where((w) => w.isNotEmpty)
        .take(2)
        .map((w) => w[0].toUpperCase())
        .join();

    return Scaffold(
      backgroundColor: AppPalette.iceBlue,
      body: SafeArea(
        child: LiquidPullToRefresh(
          onRefresh: _refreshAll,
          color: AppPalette.ocean,
          backgroundColor: AppPalette.iceBlue,
          height: 96,
          showChildOpacityTransition: false,
          springAnimationDurationInMilliseconds: 700,
          child: CustomScrollView(
            controller: _scrollController,
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              SliverToBoxAdapter(
                child: StaggeredReveal(
                  index: 0,
                  child: Padding(
                    padding: EdgeInsets.fromLTRB(
                      Responsive.pad(context, 16),
                      Responsive.pad(context, 20),
                      Responsive.pad(context, 16),
                      Responsive.pad(context, 0),
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                RemoteConfigService.instance.uiText(
                                      'home_hello',
                                    ) ??
                                    'HELLO THERE',
                                style: TextStyle(
                                  fontSize: Responsive.sp(context, 12),
                                  fontWeight: FontWeight.w600,
                                  letterSpacing: 0.05,
                                  color: const Color(0xff174a7c),
                                ),
                              ),
                              SizedBox(height: Responsive.pad(context, 2)),
                              Text(
                                displayName,
                                style: GoogleFonts.hankenGrotesk(
                                  fontSize: Responsive.sp(context, 24),
                                  fontWeight: FontWeight.w700,
                                  height: 32 / 24,
                                  color: sc.onSurface,
                                ),
                              ),
                            ],
                          ),
                        ),
                        SizedBox(width: Responsive.pad(context, 8)),
                        Stack(
                          children: [
                            Container(
                              width: Responsive.sp(context, 48),
                              height: Responsive.sp(context, 48),
                              decoration: BoxDecoration(
                                color: AppPalette.white,
                                borderRadius: BorderRadius.circular(22),
                                boxShadow: AppPalette.lift(0.55),
                              ),
                              child: IconButton(
                                icon: AnimatedBuilder(
                                  animation: _bellAnim,
                                  builder: (context, child) => Transform.rotate(
                                    angle: _bellAnim.value,
                                    alignment: Alignment.topCenter,
                                    child: child,
                                  ),
                                  child: const Icon(TablerIcons.bell),
                                ),
                                iconSize: Responsive.sp(context, 22),
                                color: sc.onSurfaceVariant,
                                onPressed: _openNotificationSheet,
                              ),
                            ),
                            if (alertCount > 0)
                              Positioned(
                                top: 4,
                                right: 4,
                                child: Container(
                                  padding: EdgeInsets.all(
                                    Responsive.pad(context, 4),
                                  ),
                                  decoration: BoxDecoration(
                                    color: const Color(0xFFba1a1a),
                                    shape: BoxShape.circle,
                                  ),
                                  constraints: BoxConstraints(
                                    minWidth: Responsive.sp(context, 18),
                                    minHeight: Responsive.sp(context, 18),
                                  ),
                                  child: Text(
                                    '$alertCount',
                                    style: TextStyle(
                                      color: Colors.white,
                                      fontSize: Responsive.sp(context, 10),
                                      fontWeight: FontWeight.w700,
                                    ),
                                    textAlign: TextAlign.center,
                                  ),
                                ),
                              ),
                            SizedBox(height: Responsive.pad(context, 16)),
                          ],
                        ),
                        SizedBox(width: Responsive.pad(context, 8)),
                        GestureDetector(
                          onTap: _openAccountSheet,
                          child: Container(
                            width: Responsive.sp(context, 48),
                            height: Responsive.sp(context, 48),
                            alignment: Alignment.center,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              gradient: const LinearGradient(
                                begin: Alignment.topLeft,
                                end: Alignment.bottomRight,
                                colors: [
                                  AppPalette.ocean,
                                  AppPalette.oceanDeep,
                                ],
                              ),
                              boxShadow: AppPalette.lift(0.55),
                            ),
                            child: Text(
                              initials.isEmpty ? 'U' : initials,
                              style: GoogleFonts.hankenGrotesk(
                                fontSize: Responsive.sp(context, 14),
                                fontWeight: FontWeight.w800,
                                color: Colors.white,
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              if ((_isAdmin && _pendingAbsenceProofs.isNotEmpty) ||
                  _pendingPunchCount > 0)
                SliverToBoxAdapter(
                  child: StaggeredReveal(
                    index: 1,
                    child: Padding(
                      padding: EdgeInsets.fromLTRB(
                        Responsive.pad(context, 16),
                        Responsive.pad(context, 16),
                        Responsive.pad(context, 16),
                        Responsive.pad(context, 0),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          if (_pendingPunchCount > 0)
                            Container(
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(
                                color: Colors.orange.shade50,
                                borderRadius: BorderRadius.circular(22),
                                border: Border.all(
                                  color: Colors.orange.shade300,
                                ),
                              ),
                              child: Row(
                                children: [
                                  Icon(
                                    Icons.sync,
                                    color: Colors.orange.shade800,
                                    size: 20,
                                  ),
                                  const SizedBox(width: 8),
                                  Expanded(
                                    child: Text(
                                      '$_pendingPunchCount punch(es) saved offline — will sync when online',
                                      style: TextStyle(
                                        color: Colors.orange.shade900,
                                        fontWeight: FontWeight.w600,
                                        fontSize: 13,
                                      ),
                                    ),
                                  ),
                                  TextButton(
                                    onPressed: _syncPendingPunches,
                                    child: Text(
                                      'Sync Now',
                                      style: TextStyle(
                                        color: Colors.orange.shade900,
                                        fontWeight: FontWeight.bold,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          if (_isAdmin && _pendingAbsenceProofs.isNotEmpty)
                            _buildAdminProofCard(sc, colors),
                        ],
                      ),
                    ),
                  ),
                ),
              SliverToBoxAdapter(
                child: StaggeredReveal(
                  index: 2,
                  child: Padding(
                    padding: EdgeInsets.fromLTRB(
                      Responsive.pad(context, 16),
                      Responsive.pad(context, 0),
                      Responsive.pad(context, 16),
                      Responsive.pad(context, 0),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        SizedBox(height: Responsive.pad(context, 16)),
                        Container(
                          padding: EdgeInsets.symmetric(
                            horizontal: Responsive.pad(context, 12),
                            vertical: Responsive.pad(context, 8),
                          ),
                          decoration: BoxDecoration(
                            color: sc.surface,
                            borderRadius: BorderRadius.circular(22),
                            boxShadow: AppPalette.lift(0.5),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                'SHIFT',
                                style: TextStyle(
                                  fontSize: Responsive.sp(context, 11),
                                  fontWeight: FontWeight.w700,
                                  letterSpacing: 0.05,
                                  color: sc.outline,
                                ),
                              ),
                              SizedBox(width: Responsive.pad(context, 8)),
                              Text(
                                '$_officeStartTime – $_officeEndTime',
                                style: TextStyle(
                                  fontSize: Responsive.sp(context, 14),
                                  fontWeight: FontWeight.w600,
                                  color: sc.onSurface,
                                ),
                              ),
                            ],
                          ),
                        ),
                        SizedBox(height: Responsive.pad(context, 32)),
                        if (_isPunchedOut)
                          Column(
                            children: [
                              Icon(
                                TablerIcons.circle_check,
                                size: Responsive.sp(context, 72),
                                color: const Color(0xff174a7c),
                              ),
                              SizedBox(height: Responsive.pad(context, 12)),
                              Text(
                                'Today completed',
                                style: GoogleFonts.hankenGrotesk(
                                  fontSize: Responsive.sp(context, 18),
                                  fontWeight: FontWeight.w600,
                                  color: sc.onSurface,
                                ),
                              ),
                            ],
                          )
                        else
                          SizedBox(
                            width: 192,
                            height: 192,
                            child: Stack(
                              alignment: Alignment.center,
                              children: [
                                for (final i in [0, 1, 2])
                                  AnimatedBuilder(
                                    animation: _pulseAnim,
                                    builder: (context, child) {
                                      final phase = i * 0.33;
                                      final t =
                                          (_pulseAnim.value + phase) % 1.0;
                                      final scale = 1.0 + t * 0.6;
                                      final opacity = (1.0 - t) * 0.2;
                                      return Transform.scale(
                                        scale: scale,
                                        child: Container(
                                          width: 192,
                                          height: 192,
                                          decoration: BoxDecoration(
                                            shape: BoxShape.circle,
                                            border: Border.all(
                                              color:
                                                  (_isPunchedIn
                                                          ? AppPalette.aqua
                                                          : AppPalette.ocean)
                                                      .withValues(
                                                        alpha: opacity * 0.5,
                                                      ),
                                              width: 2,
                                            ),
                                          ),
                                        ),
                                      );
                                    },
                                  ),
                                AnimatedScale(
                                  scale: _isPressing ? 0.92 : 1.0,
                                  duration: const Duration(milliseconds: 100),
                                  child: GestureDetector(
                                    onTap: _punchBusy
                                        ? null
                                        : (_isPunchedIn
                                              ? (_canPunchOut
                                                    ? _punchOut
                                                    : null)
                                              : _punchIn),
                                    onTapDown: (_) =>
                                        setState(() => _isPressing = true),
                                    onTapUp: (_) =>
                                        setState(() => _isPressing = false),
                                    onTapCancel: () =>
                                        setState(() => _isPressing = false),
                                    child: Container(
                                      width: 192,
                                      height: 192,
                                      decoration: BoxDecoration(
                                        gradient: LinearGradient(
                                          begin: Alignment.topLeft,
                                          end: Alignment.bottomRight,
                                          colors: _isPunchedIn
                                              ? [
                                                  AppPalette.aqua,
                                                  AppPalette.aquaDeep,
                                                ]
                                              : [
                                                  AppPalette.ocean,
                                                  AppPalette.oceanDeep,
                                                ],
                                        ),
                                        shape: BoxShape.circle,
                                        boxShadow: [
                                          BoxShadow(
                                            color: _isPunchedIn
                                                ? AppPalette.aqua.withValues(
                                                    alpha: 0.45,
                                                  )
                                                : AppPalette.ocean.withValues(
                                                    alpha: 0.35,
                                                  ),
                                            blurRadius: 44,
                                            offset: const Offset(0, 20),
                                          ),
                                        ],
                                      ),
                                      child: Column(
                                        mainAxisAlignment:
                                            MainAxisAlignment.center,
                                        children: [
                                          Icon(
                                            _isPunchedIn
                                                ? (_canPunchOut
                                                      ? TablerIcons.power
                                                      : TablerIcons
                                                            .circle_check)
                                                : TablerIcons.scan,
                                            size: Responsive.sp(context, 48),
                                            color: _isPunchedIn
                                                ? AppPalette.ink
                                                : Colors.white,
                                          ),
                                          SizedBox(
                                            height: Responsive.pad(context, 8),
                                          ),
                                          Text(
                                            _isPunchedIn
                                                ? (_canPunchOut
                                                      ? 'Punch Out'
                                                      : 'Punched In')
                                                : 'Punch In',
                                            style: TextStyle(
                                              fontSize: Responsive.sp(
                                                context,
                                                12,
                                              ),
                                              fontWeight: FontWeight.w700,
                                              letterSpacing: 1.5,
                                              color: _isPunchedIn
                                                  ? AppPalette.ink
                                                  : Colors.white,
                                            ),
                                          ),
                                          if (_isPunchedIn &&
                                              !_isPunchedOut &&
                                              _punchInTime != null) ...[
                                            SizedBox(
                                              height: Responsive.pad(
                                                context,
                                                4,
                                              ),
                                            ),
                                            _PunchOutCountdownText(
                                              punchInTime: _punchInTime!,
                                              minDelay: _minPunchOutDelay,
                                              style: TextStyle(
                                                fontSize: Responsive.sp(
                                                  context,
                                                  10,
                                                ),
                                                fontWeight: FontWeight.w500,
                                                letterSpacing: 0.3,
                                                color: AppPalette.ink
                                                    .withValues(alpha: 0.7),
                                              ),
                                            ),
                                          ],
                                        ],
                                      ),
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        SizedBox(height: Responsive.pad(context, 40)),
                        Row(
                          children: [
                            Expanded(
                              child: Container(
                                padding: EdgeInsets.symmetric(
                                  vertical: Responsive.pad(context, 20),
                                  horizontal: Responsive.pad(context, 16),
                                ),
                                decoration: BoxDecoration(
                                  color: sc.surface,
                                  borderRadius: BorderRadius.circular(22),
                                  boxShadow: AppPalette.lift(0.5),
                                ),
                                child: Column(
                                  children: [
                                    Text(
                                      'IN',
                                      style: TextStyle(
                                        fontSize: Responsive.sp(context, 11),
                                        fontWeight: FontWeight.w700,
                                        letterSpacing: 1.0,
                                        color: sc.outline,
                                      ),
                                    ),
                                    SizedBox(
                                      height: Responsive.pad(context, 6),
                                    ),
                                    Text(
                                      _fmtTime(_punchInTime),
                                      style: GoogleFonts.hankenGrotesk(
                                        fontSize: Responsive.sp(context, 20),
                                        fontWeight: FontWeight.w700,
                                        color: sc.onSurface,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                            SizedBox(width: Responsive.pad(context, 12)),
                            Expanded(
                              child: Container(
                                padding: EdgeInsets.symmetric(
                                  vertical: Responsive.pad(context, 20),
                                  horizontal: Responsive.pad(context, 16),
                                ),
                                decoration: BoxDecoration(
                                  color: sc.surface,
                                  borderRadius: BorderRadius.circular(22),
                                  boxShadow: AppPalette.lift(0.5),
                                ),
                                child: Column(
                                  children: [
                                    Text(
                                      'OUT',
                                      style: TextStyle(
                                        fontSize: Responsive.sp(context, 11),
                                        fontWeight: FontWeight.w700,
                                        letterSpacing: 1.0,
                                        color: sc.outline,
                                      ),
                                    ),
                                    SizedBox(
                                      height: Responsive.pad(context, 6),
                                    ),
                                    Text(
                                      _fmtTime(_punchOutTime),
                                      style: GoogleFonts.hankenGrotesk(
                                        fontSize: Responsive.sp(context, 20),
                                        fontWeight: FontWeight.w700,
                                        color: sc.onSurface,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ],
                        ),
                        SizedBox(height: Responsive.pad(context, 16)),
                        Row(
                          children: [
                            Expanded(
                              child: _homeStatCard(
                                icon: TablerIcons.clock,
                                title: 'Late Deduction',
                                value: '$_monthLateMinutes min',
                                subtitle:
                                    '${_fmtDays(_monthLateDeductionDays)} day deducted',
                                color: const Color(0xFFB45309),
                                onTap: _openLateDeductionRules,
                              ),
                            ),
                            SizedBox(width: Responsive.pad(context, 12)),
                            Expanded(
                              child: _homeStatCard(
                                icon: TablerIcons.calendar_check,
                                title: 'Attendance',
                                value: '$_attendancePercent%',
                                subtitle: _monthLate == 1
                                    ? '1 late day'
                                    : '$_monthLate late days',
                                color: AppPalette.aquaDeep,
                                onTap: _openAttendanceSheet,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              if (_lateStreakDays >= 3)
                SliverToBoxAdapter(
                  child: StaggeredReveal(
                    index: 3,
                    child: Padding(
                      padding: EdgeInsets.fromLTRB(
                        Responsive.pad(context, 16),
                        Responsive.pad(context, 24),
                        Responsive.pad(context, 16),
                        0,
                      ),
                      child: Container(
                        padding: EdgeInsets.all(Responsive.pad(context, 14)),
                        decoration: BoxDecoration(
                          color: const Color(0xFFFFF3E0),
                          borderRadius: BorderRadius.circular(22),
                          border: Border.all(color: const Color(0xFFFFD59E)),
                        ),
                        child: Row(
                          children: [
                            Icon(
                              TablerIcons.alert_triangle,
                              size: Responsive.sp(context, 18),
                              color: const Color(0xFFB45309),
                            ),
                            SizedBox(width: Responsive.pad(context, 10)),
                            Expanded(
                              child: Text(
                                '$_lateStreakDays days continuous late - half day deducted',
                                style: TextStyle(
                                  fontSize: Responsive.sp(context, 12.5),
                                  fontWeight: FontWeight.w600,
                                  color: const Color(0xFF8A4B08),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              if (_pendingLoans.isNotEmpty &&
                  RemoteConfigService.instance.featureFlag(
                    'show_pending_loans',
                  ))
                SliverToBoxAdapter(
                  child: StaggeredReveal(
                    index: 4,
                    child: Padding(
                      padding: EdgeInsets.fromLTRB(
                        Responsive.pad(context, 16),
                        Responsive.pad(context, 24),
                        Responsive.pad(context, 16),
                        Responsive.pad(context, 0),
                      ),
                      child: Container(
                        padding: EdgeInsets.all(Responsive.pad(context, 16)),
                        decoration: BoxDecoration(
                          color: sc.surface,
                          borderRadius: BorderRadius.circular(22),
                          boxShadow: AppPalette.lift(0.5),
                        ),
                        child: Row(
                          children: [
                            Container(
                              width: Responsive.sp(context, 48),
                              height: Responsive.sp(context, 48),
                              decoration: BoxDecoration(
                                color: const Color(0xFFfff3cd),
                                borderRadius: BorderRadius.circular(22),
                              ),
                              child: Icon(
                                TablerIcons.wallet,
                                size: Responsive.sp(context, 22),
                                color: Color(0xFF856404),
                              ),
                            ),
                            SizedBox(width: Responsive.pad(context, 16)),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    'Pending Loans',
                                    style: GoogleFonts.hankenGrotesk(
                                      fontSize: Responsive.sp(context, 16),
                                      fontWeight: FontWeight.w600,
                                      color: sc.onSurface,
                                    ),
                                  ),
                                  Text(
                                    '${_pendingLoans.length} active \u00B7 \u20B9${_pendingLoans.fold<int>(0, (s, l) => s + ((l['remaining_amount'] ?? l['total_amount'] ?? 0) as int))}',
                                    style: TextStyle(
                                      fontSize: Responsive.sp(context, 12),
                                      fontWeight: FontWeight.w500,
                                      color: sc.onSurfaceVariant,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              if (RemoteConfigService.instance.featureFlag('show_requests'))
                SliverToBoxAdapter(
                  child: StaggeredReveal(
                    index: 5,
                    child: Padding(
                      padding: EdgeInsets.fromLTRB(
                        Responsive.pad(context, 16),
                        Responsive.pad(context, 24),
                        Responsive.pad(context, 16),
                        Responsive.pad(context, 12),
                      ),
                      child: SizedBox(
                        height: Responsive.pad(context, 128),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Expanded(
                              child: Column(
                                children: [
                                  Expanded(
                                    child: _QuickActionButton(
                                      icon: TablerIcons.calendar_event,
                                      label: 'Leave',
                                      background: AppPalette.white,
                                      foreground: AppPalette.ocean,
                                      iconBackground: AppPalette.iceDeep,
                                      onTap: () => _openRequestSheet(0),
                                    ),
                                  ),
                                  SizedBox(height: Responsive.pad(context, 10)),
                                  Expanded(
                                    child: _QuickActionButton(
                                      icon: TablerIcons.wallet,
                                      label: 'Advance',
                                      background: AppPalette.aqua,
                                      foreground: AppPalette.ink,
                                      iconBackground: AppPalette.white
                                          .withValues(alpha: 0.55),
                                      onTap: () => _openRequestSheet(1),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            SizedBox(width: Responsive.pad(context, 12)),
                            Expanded(
                              child: _HelpActionButton(onTap: _openHelpSheet),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              SliverToBoxAdapter(
                child: SizedBox(height: Responsive.pad(context, 24)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PunchOutCountdownText extends StatefulWidget {
  final DateTime punchInTime;
  final Duration minDelay;
  final TextStyle style;
  const _PunchOutCountdownText({
    required this.punchInTime,
    required this.minDelay,
    required this.style,
  });

  @override
  State<_PunchOutCountdownText> createState() => _PunchOutCountdownTextState();
}

class _PunchOutCountdownTextState extends State<_PunchOutCountdownText> {
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final remaining =
        widget.minDelay - DateTime.now().difference(widget.punchInTime);
    if (remaining.isNegative) return const SizedBox.shrink();
    final total = remaining.inSeconds;
    final m = (total ~/ 60).toString().padLeft(2, '0');
    final s = (total % 60).toString().padLeft(2, '0');
    return Text('Punch out in $m:$s', style: widget.style);
  }
}

class _HelpSheet extends StatefulWidget {
  const _HelpSheet();

  @override
  State<_HelpSheet> createState() => _HelpSheetState();
}

class _HelpSheetState extends State<_HelpSheet> {
  final _searchCtrl = TextEditingController();
  List<dynamic> _workers = [];
  Map<String, dynamic> _todayByWorker = {};
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final workers = await ApiService.getWorkersScopedAll();
      final todayList = await ApiService.getTodayAllAttendance();
      final map = <String, dynamic>{};
      for (final r in todayList) {
        if (r is Map && r['worker_id'] != null) {
          map[r['worker_id'].toString()] = r;
        }
      }
      if (mounted) {
        setState(() {
          _workers = workers;
          _todayByWorker = map;
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted)
        setState(() {
          _loading = false;
          _error = e.toString();
        });
    }
  }

  String _statusFor(Map<String, dynamic>? record) {
    if (record == null || record['punch_in_time'] == null)
      return 'punch_in_pending';
    if (record['punch_out_time'] == null) return 'punch_out_pending';
    return 'completed';
  }

  @override
  Widget build(BuildContext context) {
    final term = _searchCtrl.text.trim().toLowerCase();
    final filtered = term.isEmpty
        ? const <dynamic>[]
        : _workers.where((w) {
            final name = (w['name'] ?? '').toString().toLowerCase();
            final dept = (w['department'] ?? '').toString().toLowerCase();
            final phone = (w['phone'] ?? '').toString().toLowerCase();
            return name.contains(term) ||
                dept.contains(term) ||
                phone.contains(term);
          }).toList();

    return Container(
      height: MediaQuery.of(context).size.height * 0.6,
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(32)),
      ),
      child: Column(
        children: [
          const SizedBox(height: 16),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: TextField(
              controller: _searchCtrl,
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(
                hintText: 'Search employees...',
                prefixIcon: const Icon(Icons.search),
                filled: true,
                fillColor: const Color(0xffe6f0fa),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(18),
                  borderSide: BorderSide.none,
                ),
              ),
            ),
          ),
          const SizedBox(height: 8),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _error != null
                ? Center(
                    child: Text(
                      _error!,
                      style: const TextStyle(color: Color(0xFFba1a1a)),
                    ),
                  )
                : term.isEmpty
                ? const Center(child: Text('Type a name to search employees'))
                : filtered.isEmpty
                ? const Center(child: Text('No employees found'))
                : ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: filtered.length,
                    itemBuilder: (_, i) {
                      final w = filtered[i];
                      final record =
                          _todayByWorker[w['id']?.toString() ?? '']
                              as Map<String, dynamic>?;
                      final status = _statusFor(record);
                      final label = status == 'punch_in_pending'
                          ? 'Punch in pending'
                          : status == 'punch_out_pending'
                          ? 'Punch out pending'
                          : 'Punched in & out';
                      final color = status == 'punch_in_pending'
                          ? const Color(0xFFba1a1a)
                          : status == 'punch_out_pending'
                          ? const Color(0xFFd97706)
                          : const Color(0xff0f7a5a);
                      return InkWell(
                        onTap: () {
                          if (status == 'completed') {
                            AppToast.info(
                              'Attendance already completed for today',
                            );
                            return;
                          }
                          Navigator.pop(context);
                          showSpringSheet(
                            context: context,
                            builder: (_) => _SelfiePunchSheet(
                              worker: w,
                              action: status == 'punch_in_pending'
                                  ? 'punch_in'
                                  : 'punch_out',
                            ),
                          );
                        },
                        child: Container(
                          margin: const EdgeInsets.only(bottom: 10),
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: const Color(0xffe6f0fa),
                            borderRadius: BorderRadius.circular(22),
                          ),
                          child: Row(
                            children: [
                              CircleAvatar(
                                child: Text(
                                  (w['name'] ?? '?').toString().isNotEmpty
                                      ? w['name'].toString()[0].toUpperCase()
                                      : '?',
                                ),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      w['name']?.toString() ?? '',
                                      style: const TextStyle(
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                    if ((w['department'] ?? '')
                                        .toString()
                                        .isNotEmpty)
                                      Text(
                                        w['department'].toString(),
                                        style: const TextStyle(
                                          fontSize: 12,
                                          color: Color(0xff5e7e99),
                                        ),
                                      ),
                                  ],
                                ),
                              ),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 10,
                                  vertical: 4,
                                ),
                                decoration: BoxDecoration(
                                  color: color.withValues(alpha: 0.12),
                                  borderRadius: BorderRadius.circular(20),
                                ),
                                child: Text(
                                  label,
                                  style: TextStyle(
                                    color: color,
                                    fontWeight: FontWeight.w700,
                                    fontSize: 12,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}

class _QuickActionButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color background;
  final Color foreground;
  final Color iconBackground;
  final VoidCallback onTap;

  const _QuickActionButton({
    required this.icon,
    required this.label,
    required this.background,
    required this.foreground,
    required this.iconBackground,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final radius = BorderRadius.circular(18);
    return Container(
      decoration: BoxDecoration(
        borderRadius: radius,
        boxShadow: AppPalette.lift(0.5),
      ),
      child: Material(
        color: background,
        borderRadius: radius,
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: EdgeInsets.symmetric(
              horizontal: Responsive.pad(context, 14),
              vertical: Responsive.pad(context, 12),
            ),
            child: Row(
              children: [
                Container(
                  width: Responsive.sp(context, 34),
                  height: Responsive.sp(context, 34),
                  decoration: BoxDecoration(
                    color: iconBackground,
                    borderRadius: BorderRadius.circular(11),
                  ),
                  child: Icon(
                    icon,
                    size: Responsive.sp(context, 18),
                    color: foreground,
                  ),
                ),
                SizedBox(width: Responsive.pad(context, 10)),
                Expanded(
                  child: Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.hankenGrotesk(
                      fontSize: Responsive.sp(context, 14),
                      fontWeight: FontWeight.w700,
                      color: foreground,
                    ),
                  ),
                ),
                Icon(
                  TablerIcons.chevron_right,
                  size: Responsive.sp(context, 16),
                  color: foreground.withValues(alpha: 0.5),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _HelpActionButton extends StatelessWidget {
  final VoidCallback onTap;

  const _HelpActionButton({required this.onTap});

  @override
  Widget build(BuildContext context) {
    final radius = BorderRadius.circular(22);
    return Container(
      decoration: BoxDecoration(
        borderRadius: radius,
        boxShadow: AppPalette.lift(0.5),
      ),
      child: Material(
        color: AppPalette.white,
        borderRadius: radius,
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: EdgeInsets.all(Responsive.pad(context, 14)),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    Container(
                      width: Responsive.sp(context, 38),
                      height: Responsive.sp(context, 38),
                      decoration: BoxDecoration(
                        color: AppPalette.aquaSoft,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Icon(
                        TablerIcons.user_check,
                        size: Responsive.sp(context, 19),
                        color: AppPalette.ocean,
                      ),
                    ),
                    const Spacer(),
                    Icon(
                      TablerIcons.chevron_right,
                      size: Responsive.sp(context, 16),
                      color: AppPalette.muted.withValues(alpha: 0.6),
                    ),
                  ],
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Help an Employee',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.hankenGrotesk(
                        fontSize: Responsive.sp(context, 15),
                        fontWeight: FontWeight.w700,
                        color: AppPalette.ink,
                      ),
                    ),
                    SizedBox(height: Responsive.pad(context, 2)),
                    Text(
                      'Punch in/out for others',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: Responsive.sp(context, 11),
                        fontWeight: FontWeight.w500,
                        color: AppPalette.muted,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _RequestSheet extends StatelessWidget {
  final int initialTab;
  const _RequestSheet({this.initialTab = 0});

  @override
  Widget build(BuildContext context) {
    final sc = Theme.of(context).colorScheme;
    return SizedBox(
      height:
          MediaQuery.of(context).size.height * (initialTab == 1 ? 0.78 : 0.92),
      child: Material(
        type: MaterialType.transparency,
        child: Container(
          decoration: BoxDecoration(
            color: sc.surface,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(32)),
          ),
          clipBehavior: Clip.antiAlias,
          child: Column(
            children: [
              SizedBox(height: Responsive.pad(context, 12)),
              Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: sc.outlineVariant,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              SizedBox(height: Responsive.pad(context, 4)),
              Expanded(
                child: initialTab == 1
                    ? const AdvancePage()
                    : const LeavePage(),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

IconData _notifIcon(String? type) {
  switch (type) {
    case 'birthday':
      return TablerIcons.cake;
    case 'event':
      return TablerIcons.calendar;
    case 'notice':
      return TablerIcons.speakerphone;
    case 'achievement':
      return TablerIcons.trophy;
    default:
      return TablerIcons.bell;
  }
}

Color _notifColor(String? type, ColorScheme sc) {
  switch (type) {
    case 'birthday':
      return const Color(0xFFf43f5e);
    case 'event':
      return const Color(0xff174a7c);
    case 'notice':
      return const Color(0xff174a7c);
    case 'achievement':
      return const Color(0xFFf59e0b);
    default:
      return sc.onSurfaceVariant;
  }
}

class _NotificationSheet extends StatefulWidget {
  final List<Map<String, dynamic>> notifications;
  final List<dynamic> absenceDays;
  final int unreadCount;
  final Set<String> readAbsenceDates;
  final String workerId;
  final ColorScheme scheme;
  final TextTheme textTheme;
  final Function(String id) onMarkRead;
  final Function(String id) onDelete;
  final Function(dynamic day) onAddProof;
  final Future<void> Function(String date)? onAbsenceRead;
  final Future<void> Function(String date)? onAbsenceDelete;
  final VoidCallback? onRefresh;

  const _NotificationSheet({
    required this.notifications,
    required this.absenceDays,
    required this.unreadCount,
    required this.readAbsenceDates,
    required this.workerId,
    required this.scheme,
    required this.textTheme,
    required this.onMarkRead,
    required this.onDelete,
    required this.onAddProof,
    this.onAbsenceRead,
    this.onAbsenceDelete,
    this.onRefresh,
  });

  @override
  State<_NotificationSheet> createState() => _NotificationSheetState();
}

class _NotificationSheetState extends State<_NotificationSheet> {
  late List<Map<String, dynamic>> _items;
  late List<dynamic> _absenceDays;
  late Set<String> _readDates;

  @override
  void initState() {
    super.initState();
    _items = List.from(widget.notifications);
    _absenceDays = List<dynamic>.from(widget.absenceDays);
    _readDates = Set<String>.from(widget.readAbsenceDates);
  }

  String _absenceKey(dynamic day) =>
      (day is Map ? day['date']?.toString() : null) ?? '';

  @override
  Widget build(BuildContext context) {
    final sc = Theme.of(context).colorScheme;
    final colors = Theme.of(context).extension<AppColors>()!;
    final unreadAbsence = _absenceDays
        .where((d) => !_readDates.contains(_absenceKey(d)))
        .length;
    final unreadTotal = widget.unreadCount + unreadAbsence;
    return SizedBox(
      height: MediaQuery.of(context).size.height * 0.85,
      child: Container(
        decoration: BoxDecoration(
          color: sc.surface,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(32)),
        ),
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: EdgeInsets.fromLTRB(
            Responsive.pad(context, 16),
            Responsive.pad(context, 16),
            Responsive.pad(context, 16),
            Responsive.pad(context, 32),
          ),
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                margin: EdgeInsets.only(bottom: Responsive.pad(context, 24)),
                decoration: BoxDecoration(
                  color: const Color(0xffdceaf6),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            Row(
              children: [
                Container(
                  width: Responsive.sp(context, 44),
                  height: Responsive.sp(context, 44),
                  decoration: BoxDecoration(
                    color: const Color(0xffd6eaf7),
                    borderRadius: BorderRadius.circular(22),
                  ),
                  child: Icon(
                    TablerIcons.bell_ringing,
                    color: Color(0xff174a7c),
                    size: Responsive.sp(context, 22),
                  ),
                ),
                SizedBox(width: Responsive.pad(context, 16)),
                Text(
                  'Notifications',
                  style: GoogleFonts.hankenGrotesk(
                    fontSize: Responsive.sp(context, 20),
                    fontWeight: FontWeight.w600,
                    color: sc.onSurface,
                  ),
                ),
                const Spacer(),
                if (_items.isNotEmpty || _absenceDays.isNotEmpty)
                  Text(
                    '$unreadTotal unread',
                    style: TextStyle(
                      fontSize: Responsive.sp(context, 12),
                      fontWeight: FontWeight.w600,
                      color: sc.onSurfaceVariant,
                    ),
                  ),
              ],
            ),
            SizedBox(height: Responsive.pad(context, 8)),
            Text(
              'Swipe right to mark read · left to delete',
              style: TextStyle(
                fontSize: Responsive.sp(context, 10),
                fontWeight: FontWeight.w500,
                color: sc.outline.withValues(alpha: 0.7),
              ),
            ),
            SizedBox(height: Responsive.pad(context, 16)),
            if (_absenceDays.isNotEmpty) ...[
              Text(
                'ATTENDANCE ALERTS',
                style: TextStyle(
                  fontSize: Responsive.sp(context, 11),
                  fontWeight: FontWeight.w700,
                  letterSpacing: 1,
                  color: sc.onSurfaceVariant,
                ),
              ),
              SizedBox(height: Responsive.pad(context, 10)),
              Text(
                'Tap an alert to upload proof. Swipe right to mark read, left to delete.',
                style: TextStyle(
                  fontSize: Responsive.sp(context, 10),
                  height: 1.4,
                  color: sc.outline.withValues(alpha: 0.75),
                ),
              ),
              SizedBox(height: Responsive.pad(context, 10)),
              ..._absenceDays.map((day) {
                final key = _absenceKey(day);
                final read = _readDates.contains(key);
                return Padding(
                  padding: EdgeInsets.only(bottom: Responsive.pad(context, 10)),
                  child: Dismissible(
                    key: ValueKey('absence_$key'),
                    direction: DismissDirection.horizontal,
                    background: Container(
                      alignment: Alignment.centerLeft,
                      padding: EdgeInsets.only(
                        left: Responsive.pad(context, 16),
                      ),
                      decoration: BoxDecoration(
                        color: const Color(0xff174a7c),
                        borderRadius: BorderRadius.circular(18),
                      ),
                      child: Row(
                        children: [
                          Icon(
                            TablerIcons.checks,
                            color: Colors.white,
                            size: Responsive.sp(context, 20),
                          ),
                          SizedBox(width: Responsive.pad(context, 8)),
                          Text(
                            'Read',
                            style: TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w600,
                              fontSize: Responsive.sp(context, 13),
                            ),
                          ),
                        ],
                      ),
                    ),
                    secondaryBackground: Container(
                      alignment: Alignment.centerRight,
                      padding: EdgeInsets.only(
                        right: Responsive.pad(context, 16),
                      ),
                      decoration: BoxDecoration(
                        color: const Color(0xFFba1a1a),
                        borderRadius: BorderRadius.circular(18),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            'Delete',
                            style: TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w600,
                              fontSize: Responsive.sp(context, 13),
                            ),
                          ),
                          SizedBox(width: Responsive.pad(context, 8)),
                          Icon(
                            TablerIcons.trash,
                            color: Colors.white,
                            size: Responsive.sp(context, 20),
                          ),
                        ],
                      ),
                    ),
                    confirmDismiss: (direction) async {
                      if (direction == DismissDirection.startToEnd) {
                        setState(() => _readDates.add(key));
                        unawaited(
                          widget.onAbsenceRead?.call(key) ?? Future.value(),
                        );
                        return false;
                      }
                      return true;
                    },
                    onDismissed: (_) {
                      setState(
                        () => _absenceDays.removeWhere(
                          (d) => _absenceKey(d) == key,
                        ),
                      );
                      unawaited(
                        widget.onAbsenceDelete?.call(key) ?? Future.value(),
                      );
                    },
                    child: _absenceNotificationTile(context, day, read: read),
                  ),
                );
              }),
              if (_items.isNotEmpty) ...[
                SizedBox(height: Responsive.pad(context, 14)),
                Text(
                  'UPDATES',
                  style: TextStyle(
                    fontSize: Responsive.sp(context, 11),
                    fontWeight: FontWeight.w700,
                    letterSpacing: 1,
                    color: sc.onSurfaceVariant,
                  ),
                ),
                SizedBox(height: Responsive.pad(context, 10)),
              ],
            ],
            if (_items.isEmpty && _absenceDays.isEmpty)
              Padding(
                padding: EdgeInsets.only(top: Responsive.pad(context, 40)),
                child: Center(
                  child: Column(
                    children: [
                      Icon(
                        TablerIcons.bell_off,
                        size: Responsive.sp(context, 48),
                        color: sc.outline.withValues(alpha: 0.3),
                      ),
                      SizedBox(height: Responsive.pad(context, 12)),
                      Text(
                        'No notifications yet',
                        style: TextStyle(
                          fontSize: Responsive.sp(context, 14),
                          color: sc.outline.withValues(alpha: 0.6),
                        ),
                      ),
                    ],
                  ),
                ),
              )
            else
              ..._items.asMap().entries.map((entry) {
                final i = entry.key;
                final n = entry.value;
                final isLast = i == _items.length - 1;
                final isRead = n['read_at'] != null;
                return Column(
                  children: [
                    Dismissible(
                      key: ValueKey('notif_${n['id']}'),
                      direction: DismissDirection.horizontal,
                      background: Container(
                        alignment: Alignment.centerLeft,
                        padding: EdgeInsets.only(
                          left: Responsive.pad(context, 16),
                        ),
                        decoration: BoxDecoration(
                          color: const Color(0xff174a7c),
                          borderRadius: BorderRadius.circular(22),
                        ),
                        child: Row(
                          children: [
                            Icon(
                              TablerIcons.checks,
                              color: Colors.white,
                              size: Responsive.sp(context, 20),
                            ),
                            SizedBox(width: Responsive.pad(context, 8)),
                            Text(
                              'Read',
                              style: TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w600,
                                fontSize: Responsive.sp(context, 13),
                              ),
                            ),
                          ],
                        ),
                      ),
                      secondaryBackground: Container(
                        alignment: Alignment.centerRight,
                        padding: EdgeInsets.only(
                          right: Responsive.pad(context, 16),
                        ),
                        decoration: BoxDecoration(
                          color: const Color(0xFFba1a1a),
                          borderRadius: BorderRadius.circular(22),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              'Delete',
                              style: TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w600,
                                fontSize: Responsive.sp(context, 13),
                              ),
                            ),
                            SizedBox(width: Responsive.pad(context, 8)),
                            Icon(
                              TablerIcons.trash,
                              color: Colors.white,
                              size: Responsive.sp(context, 20),
                            ),
                          ],
                        ),
                      ),
                      confirmDismiss: (direction) async {
                        if (direction == DismissDirection.startToEnd) {
                          setState(
                            () =>
                                n['read_at'] = DateTime.now().toIso8601String(),
                          );
                          widget.onMarkRead(n['id'].toString());
                          return false;
                        }
                        return true;
                      },
                      onDismissed: (_) {
                        setState(
                          () => _items.removeWhere(
                            (item) => item['id'] == n['id'],
                          ),
                        );
                        widget.onDelete(n['id'].toString());
                      },
                      child: Opacity(
                        opacity: isRead ? 0.5 : 1,
                        child: Container(
                          padding: EdgeInsets.all(Responsive.pad(context, 16)),
                          decoration: BoxDecoration(
                            color: !isRead
                                ? colors.surfaceContainerHigh
                                : colors.surfaceContainerLow,
                            borderRadius: BorderRadius.circular(22),
                            border: !isRead
                                ? Border.all(
                                    color: colors.outline.withValues(
                                      alpha: 0.3,
                                    ),
                                  )
                                : null,
                          ),
                          child: Row(
                            children: [
                              Icon(
                                _notifIcon(n['type']?.toString()),
                                size: Responsive.sp(context, 20),
                                color: _notifColor(n['type']?.toString(), sc),
                              ),
                              SizedBox(width: Responsive.pad(context, 14)),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      n['title'] ?? '',
                                      style: TextStyle(
                                        fontSize: Responsive.sp(context, 14),
                                        fontWeight: FontWeight.w600,
                                        color: sc.onSurface,
                                      ),
                                    ),
                                    SizedBox(
                                      height: Responsive.pad(context, 2),
                                    ),
                                    Text(
                                      n['body'] ?? '',
                                      style: TextStyle(
                                        fontSize: Responsive.sp(context, 12),
                                        color: sc.outline,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                    if (!isLast) SizedBox(height: Responsive.pad(context, 12)),
                  ],
                );
              }),
          ],
        ),
      ),
    );
  }

  Widget _absenceNotificationTile(
    BuildContext context,
    dynamic raw, {
    bool read = false,
  }) {
    final day = Map<String, dynamic>.from(raw as Map);
    final dateStr = day['date']?.toString() ?? '';
    final trigger = day['trigger']?.toString() ?? 'no_leave';
    final needsProof = day['needsProof'] == true;
    final proofPending = day['proofPending'] == true;
    final proofStatus = day['proofStatus']?.toString();
    final canUpload = needsProof || (!proofPending && proofStatus == null);
    final triggerLabel = switch (trigger) {
      'rejected' => 'Leave rejected',
      'pending' => 'Leave pending',
      _ => 'No leave filed',
    };
    final date = DateTime.tryParse(dateStr);
    final dateLabel = date == null
        ? dateStr
        : DateFormat('d MMM yyyy').format(date);

    final String statusLabel;
    final Color statusFg;
    final Color statusBg;
    if (canUpload) {
      statusLabel = 'Action required';
      statusFg = const Color(0xFFB42318);
      statusBg = const Color(0xFFFDEAEA);
    } else if (proofPending) {
      statusLabel = 'Under review';
      statusFg = const Color(0xFF856404);
      statusBg = const Color(0xFFFFF3CD);
    } else if (proofStatus == 'approved') {
      statusLabel = 'Approved';
      statusFg = const Color(0xFF0F7A5A);
      statusBg = const Color(0xFFDDF8EE);
    } else if (proofStatus == 'rejected') {
      statusLabel = 'Rejected';
      statusFg = const Color(0xFFB42318);
      statusBg = const Color(0xFFFDEAEA);
    } else {
      statusLabel = 'Forfeited';
      statusFg = const Color(0xFFB42318);
      statusBg = const Color(0xFFFDEAEA);
    }

    return Opacity(
      opacity: read ? 0.55 : 1,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: canUpload
            ? () {
                Navigator.pop(context);
                widget.onAddProof(day);
              }
            : null,
        child: Container(
          padding: EdgeInsets.all(Responsive.pad(context, 14)),
          decoration: BoxDecoration(
            color: AppPalette.iceSoft,
            borderRadius: BorderRadius.circular(18),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: Responsive.sp(context, 40),
                height: Responsive.sp(context, 40),
                decoration: BoxDecoration(
                  color: const Color(0xFFFDEAEA),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(
                  TablerIcons.calendar_x,
                  size: Responsive.sp(context, 20),
                  color: const Color(0xFFB42318),
                ),
              ),
              SizedBox(width: Responsive.pad(context, 12)),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        Expanded(
                          child: Text(
                            'Unauthorized Absence',
                            style: GoogleFonts.hankenGrotesk(
                              fontSize: Responsive.sp(context, 14.5),
                              fontWeight: FontWeight.w700,
                              color: AppPalette.ink,
                            ),
                          ),
                        ),
                        SizedBox(width: Responsive.pad(context, 8)),
                        Container(
                          padding: EdgeInsets.symmetric(
                            horizontal: Responsive.pad(context, 8),
                            vertical: Responsive.pad(context, 3),
                          ),
                          decoration: BoxDecoration(
                            color: statusBg,
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: Text(
                            statusLabel,
                            style: TextStyle(
                              fontSize: Responsive.sp(context, 10),
                              fontWeight: FontWeight.w700,
                              color: statusFg,
                            ),
                          ),
                        ),
                      ],
                    ),
                    SizedBox(height: Responsive.pad(context, 3)),
                    Text(
                      '$dateLabel · $triggerLabel',
                      style: TextStyle(
                        fontSize: Responsive.sp(context, 11.5),
                        fontWeight: FontWeight.w500,
                        color: AppPalette.muted,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _AccountSheet extends StatelessWidget {
  final String name;
  final String role;
  final String department;
  final String employeeId;
  final bool isAdmin;
  final VoidCallback? onLogout;

  const _AccountSheet({
    required this.name,
    required this.role,
    required this.department,
    required this.employeeId,
    this.isAdmin = false,
    this.onLogout,
  });

  String get _initials {
    final parts = name.trim().split(RegExp(r'\s+')).where((w) => w.isNotEmpty);
    final letters = parts.take(2).map((w) => w[0].toUpperCase()).join();
    return letters.isEmpty ? 'U' : letters;
  }

  Future<void> _confirmLogout(BuildContext context) async {
    final confirmed = await showSpringDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        title: const Text('Logout'),
        content: const Text('Are you sure you want to logout?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppPalette.error),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Logout'),
          ),
        ],
      ),
    );
    if (confirmed == true) {
      Navigator.pop(context);
      onLogout?.call();
    }
  }

  @override
  Widget build(BuildContext context) {
    final subtitle = role.isNotEmpty
        ? role
        : (department.isNotEmpty ? department : 'Employee');
    return SafeArea(
      top: false,
      child: Container(
        decoration: const BoxDecoration(
          color: AppPalette.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(32)),
        ),
        padding: EdgeInsets.fromLTRB(
          Responsive.pad(context, 20),
          Responsive.pad(context, 12),
          Responsive.pad(context, 20),
          Responsive.pad(context, 24),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: AppPalette.iceDeep,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            SizedBox(height: Responsive.pad(context, 18)),
            Row(
              children: [
                Container(
                  width: Responsive.sp(context, 64),
                  height: Responsive.sp(context, 64),
                  alignment: Alignment.center,
                  decoration: const BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [AppPalette.ocean, AppPalette.oceanDeep],
                    ),
                  ),
                  child: Text(
                    _initials,
                    style: GoogleFonts.hankenGrotesk(
                      fontSize: Responsive.sp(context, 22),
                      fontWeight: FontWeight.w800,
                      color: Colors.white,
                    ),
                  ),
                ),
                SizedBox(width: Responsive.pad(context, 14)),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        name.isEmpty ? 'Employee' : name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: GoogleFonts.hankenGrotesk(
                          fontSize: Responsive.sp(context, 18),
                          fontWeight: FontWeight.w700,
                          color: AppPalette.ink,
                        ),
                      ),
                      SizedBox(height: Responsive.pad(context, 2)),
                      Text(
                        department.isNotEmpty && role.isNotEmpty
                            ? '$role · $department'
                            : subtitle,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: Responsive.sp(context, 12),
                          color: AppPalette.muted,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            SizedBox(height: Responsive.pad(context, 18)),
            Container(
              padding: EdgeInsets.all(Responsive.pad(context, 16)),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [AppPalette.ocean, AppPalette.oceanDeep],
                ),
                borderRadius: BorderRadius.circular(20),
                boxShadow: [
                  BoxShadow(
                    color: AppPalette.ocean.withValues(alpha: 0.24),
                    blurRadius: 20,
                    offset: const Offset(0, 10),
                  ),
                ],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text(
                        'EMPLOYEE ID CARD',
                        style: TextStyle(
                          fontSize: Responsive.sp(context, 9.5),
                          fontWeight: FontWeight.w700,
                          letterSpacing: 1.2,
                          color: Colors.white.withValues(alpha: 0.7),
                        ),
                      ),
                      const Spacer(),
                      const Icon(
                        TablerIcons.id_badge,
                        size: 18,
                        color: AppPalette.aqua,
                      ),
                    ],
                  ),
                  SizedBox(height: Responsive.pad(context, 14)),
                  Text(
                    name.isEmpty ? 'Employee' : name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.hankenGrotesk(
                      fontSize: Responsive.sp(context, 18),
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
                    ),
                  ),
                  SizedBox(height: Responsive.pad(context, 3)),
                  Row(
                    children: [
                      Text(
                        employeeId.isEmpty ? '—' : 'ID #$employeeId',
                        style: TextStyle(
                          fontSize: Responsive.sp(context, 12),
                          fontWeight: FontWeight.w600,
                          color: Colors.white.withValues(alpha: 0.72),
                        ),
                      ),
                      const Spacer(),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 3,
                        ),
                        decoration: BoxDecoration(
                          color: AppPalette.aqua.withValues(alpha: 0.2),
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: const Text(
                          'ACTIVE',
                          style: TextStyle(
                            fontSize: 9,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 0.6,
                            color: AppPalette.aqua,
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            SizedBox(height: Responsive.pad(context, 16)),
            if (isAdmin) ...[
              Material(
                color: AppPalette.iceSoft,
                borderRadius: BorderRadius.circular(16),
                clipBehavior: Clip.antiAlias,
                child: InkWell(
                  onTap: () {
                    Navigator.pop(context);
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => const AdminAttendancePage(),
                      ),
                    );
                  },
                  child: Padding(
                    padding: EdgeInsets.symmetric(
                      horizontal: Responsive.pad(context, 16),
                      vertical: Responsive.pad(context, 14),
                    ),
                    child: Row(
                      children: [
                        const Icon(
                          TablerIcons.users,
                          size: 19,
                          color: AppPalette.ocean,
                        ),
                        SizedBox(width: Responsive.pad(context, 10)),
                        const Expanded(
                          child: Text(
                            'Admin Attendance',
                            style: TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w700,
                              color: AppPalette.ink,
                            ),
                          ),
                        ),
                        Icon(
                          TablerIcons.chevron_right,
                          size: 17,
                          color: AppPalette.muted.withValues(alpha: 0.6),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              SizedBox(height: Responsive.pad(context, 10)),
            ],
            Material(
              color: const Color(0xFFFDEAEA),
              borderRadius: BorderRadius.circular(16),
              clipBehavior: Clip.antiAlias,
              child: InkWell(
                onTap: () => _confirmLogout(context),
                child: Padding(
                  padding: EdgeInsets.symmetric(
                    horizontal: Responsive.pad(context, 16),
                    vertical: Responsive.pad(context, 14),
                  ),
                  child: Row(
                    children: [
                      const Icon(
                        TablerIcons.logout,
                        size: 19,
                        color: AppPalette.error,
                      ),
                      SizedBox(width: Responsive.pad(context, 10)),
                      const Expanded(
                        child: Text(
                          'Logout',
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                            color: AppPalette.error,
                          ),
                        ),
                      ),
                      Icon(
                        TablerIcons.chevron_right,
                        size: 17,
                        color: AppPalette.error.withValues(alpha: 0.6),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _LateDeductionSheet extends StatelessWidget {
  final int minutes;
  final int grace;
  final int half;
  final int full;

  const _LateDeductionSheet({
    required this.minutes,
    required this.grace,
    required this.half,
    required this.full,
  });

  int get _tier {
    if (minutes <= grace) return 0;
    if (minutes <= half) return 1;
    if (minutes <= full) return 2;
    return 3;
  }

  @override
  Widget build(BuildContext context) {
    const colors = [
      Color(0xFF0F7A5A),
      Color(0xFFB45309),
      Color(0xFFC2410C),
      Color(0xFFB42318),
    ];
    final rules = [
      ('Grace period', 'Up to $grace min', 'No deduction'),
      ('Half day', 'Up to $half min', '0.5 day deducted'),
      ('Full day', 'Up to $full min', '1 day deducted'),
      ('Proportional', 'Beyond $full min', 'Pro-rated deduction'),
    ];

    return SafeArea(
      top: false,
      child: Container(
        decoration: const BoxDecoration(
          color: AppPalette.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(32)),
        ),
        padding: EdgeInsets.fromLTRB(
          Responsive.pad(context, 20),
          Responsive.pad(context, 12),
          Responsive.pad(context, 20),
          Responsive.pad(context, 24),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: AppPalette.iceDeep,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            SizedBox(height: Responsive.pad(context, 18)),
            Row(
              children: [
                Container(
                  width: Responsive.sp(context, 46),
                  height: Responsive.sp(context, 46),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFFF3E0),
                    borderRadius: BorderRadius.circular(15),
                  ),
                  child: Icon(
                    TablerIcons.clock,
                    size: Responsive.sp(context, 22),
                    color: const Color(0xFFB45309),
                  ),
                ),
                SizedBox(width: Responsive.pad(context, 12)),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Late Deduction',
                        style: GoogleFonts.hankenGrotesk(
                          fontSize: Responsive.sp(context, 17),
                          fontWeight: FontWeight.w700,
                          color: AppPalette.ink,
                        ),
                      ),
                      SizedBox(height: Responsive.pad(context, 2)),
                      Text(
                        'How this month\'s late minutes are charged',
                        style: TextStyle(
                          fontSize: Responsive.sp(context, 11.5),
                          color: AppPalette.muted,
                        ),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding: EdgeInsets.symmetric(
                    horizontal: Responsive.pad(context, 10),
                    vertical: Responsive.pad(context, 6),
                  ),
                  decoration: BoxDecoration(
                    color: colors[_tier].withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    '$minutes min',
                    style: TextStyle(
                      fontSize: Responsive.sp(context, 12),
                      fontWeight: FontWeight.w800,
                      color: colors[_tier],
                    ),
                  ),
                ),
              ],
            ),
            SizedBox(height: Responsive.pad(context, 18)),
            for (var i = 0; i < rules.length; i++)
              Padding(
                padding: EdgeInsets.only(bottom: Responsive.pad(context, 8)),
                child: Container(
                  padding: EdgeInsets.all(Responsive.pad(context, 12)),
                  decoration: BoxDecoration(
                    color: i == _tier
                        ? colors[i].withValues(alpha: 0.08)
                        : AppPalette.iceSoft,
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 10,
                        height: 10,
                        decoration: BoxDecoration(
                          color: colors[i],
                          shape: BoxShape.circle,
                        ),
                      ),
                      SizedBox(width: Responsive.pad(context, 10)),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              rules[i].$1,
                              style: TextStyle(
                                fontSize: Responsive.sp(context, 13),
                                fontWeight: FontWeight.w700,
                                color: AppPalette.ink,
                              ),
                            ),
                            Text(
                              '${rules[i].$2} · ${rules[i].$3}',
                              style: TextStyle(
                                fontSize: Responsive.sp(context, 11),
                                color: AppPalette.muted,
                              ),
                            ),
                          ],
                        ),
                      ),
                      if (i == _tier)
                        Icon(
                          TablerIcons.circle_check,
                          size: Responsive.sp(context, 18),
                          color: colors[i],
                        ),
                    ],
                  ),
                ),
              ),
            SizedBox(height: Responsive.pad(context, 8)),
            Text(
              'A full day is charged once the late minutes cross the grace and half-day limits. Continuous late days can also trigger a half-day deduction.',
              style: TextStyle(
                fontSize: Responsive.sp(context, 11),
                height: 1.45,
                color: AppPalette.muted,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _AttendanceSheet extends StatefulWidget {
  final int year;
  final int month;
  final int percent;
  final int present;
  final int absent;
  final int late;
  final int leave;
  final int halfDay;
  final double lateDeductionDays;
  final Map<String, String> statusByDate;
  final Map<String, Map<String, dynamic>> historyByDate;

  const _AttendanceSheet({
    required this.year,
    required this.month,
    required this.percent,
    required this.present,
    required this.absent,
    required this.late,
    required this.leave,
    required this.halfDay,
    required this.lateDeductionDays,
    required this.statusByDate,
    required this.historyByDate,
  });

  @override
  State<_AttendanceSheet> createState() => _AttendanceSheetState();
}

class _AttendanceSheetState extends State<_AttendanceSheet> {
  late int _year;
  late int _month;
  late int _percent;
  late int _present;
  late int _absent;
  late int _late;
  late int _leave;
  late int _halfDay;
  late double _lateDeductionDays;
  late Map<String, String> _statusByDate;
  late Map<String, Map<String, dynamic>> _historyByDate;
  String? _selectedDate;
  bool _loading = false;
  double _dragOffset = 0;
  bool _dragging = false;

  @override
  void initState() {
    super.initState();
    _year = widget.year;
    _month = widget.month;
    _percent = widget.percent;
    _present = widget.present;
    _absent = widget.absent;
    _late = widget.late;
    _leave = widget.leave;
    _halfDay = widget.halfDay;
    _lateDeductionDays = widget.lateDeductionDays;
    _statusByDate = widget.statusByDate;
    _historyByDate = widget.historyByDate;
  }

  bool get _atCurrentMonth {
    final now = DateTime.now();
    return _year == now.year && _month == now.month;
  }

  String _fmtTime(dynamic ts) {
    if (ts == null) return '—';
    if (ts is DateTime) return DateFormat('hh:mm a').format(ts.toLocal());
    String s = ts.toString();
    if (!s.endsWith('Z') && !RegExp(r'[+-]\d{2}:\d{2}$').hasMatch(s)) s += 'Z';
    final t = DateTime.tryParse(s);
    if (t == null) return '—';
    return DateFormat('hh:mm a').format(t.toLocal());
  }

  String _fmtDays(num v) {
    if (v == v.roundToDouble()) return '${v.toInt()}';
    return v.toStringAsFixed(1);
  }

  (Color, String) _statusMeta(String? status) {
    switch (status) {
      case 'present':
        return (AppPalette.aquaDeep, 'Present');
      case 'absent':
        return (const Color(0xFFB42318), 'Absent');
      case 'late':
        return (const Color(0xFFB45309), 'Late');
      case 'leave':
        return (AppPalette.ocean, 'Leave');
      case 'half-day':
        return (const Color(0xFF7E22CE), 'Half Day');
      default:
        return (AppPalette.muted, 'No record');
    }
  }

  Future<void> _loadMonth(int year, int month) async {
    setState(() {
      _year = year;
      _month = month;
      _selectedDate = null;
      _statusByDate = {};
      _historyByDate = {};
      _loading = true;
    });
    try {
      final results = await Future.wait([
        ApiService.getHistory(),
        ApiService.getMySalaryBreakdown(year: year, month: month),
      ]);
      final history = results[0] as List<dynamic>;
      final breakdown = results[1] as Map<String, dynamic>?;

      int present = 0, absent = 0, late = 0, leave = 0, halfDay = 0;
      final statusMap = <String, String>{};
      final detailMap = <String, Map<String, dynamic>>{};

      for (final rec in history) {
        final date = rec['date']?.toString() ?? '';
        final dt = DateTime.tryParse(date);
        if (dt == null || dt.year != year || dt.month != month) continue;
        final status = rec['status']?.toString() ?? 'present';
        statusMap[date] = status;
        detailMap[date] = {
          'date': date,
          'status': status,
          'punch_in_time': rec['punch_in_time'],
          'punch_out_time': rec['punch_out_time'],
          'late_minutes': rec['late_minutes'],
        };
        switch (status) {
          case 'present':
            present++;
            break;
          case 'late':
            late++;
            break;
          case 'absent':
            absent++;
            break;
          case 'leave':
            leave++;
            break;
          case 'half-day':
            halfDay++;
            break;
        }
      }

      final bdDays = breakdown?['lateDeductionDays'];
      final days = bdDays is num ? bdDays.toDouble() : 0.0;

      final attended = present + late + halfDay * 0.5;
      final total = present + late + absent + leave + halfDay;
      final percent = total > 0
          ? ((attended / total) * 100).round().clamp(0, 100).toInt()
          : 0;

      if (!mounted) return;
      setState(() {
        _present = present;
        _absent = absent;
        _late = late;
        _leave = leave;
        _halfDay = halfDay;
        _lateDeductionDays = days;
        _percent = percent;
        _statusByDate = statusMap;
        _historyByDate = detailMap;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  bool get _atOldestMonth {
    final now = DateTime.now();
    final oldest = DateTime(now.year, now.month - 1);
    return _year == oldest.year && _month == oldest.month;
  }

  void _goBackOneMonth() {
    if (_atOldestMonth) return;
    final prev = DateTime(_year, _month - 1);
    _loadMonth(prev.year, prev.month);
  }

  void _goForwardOneMonth() {
    if (_atCurrentMonth) return;
    final next = DateTime(_year, _month + 1);
    _loadMonth(next.year, next.month);
  }

  @override
  Widget build(BuildContext context) {
    final detail = _selectedDate == null ? null : _historyByDate[_selectedDate];

    return SafeArea(
      top: false,
      child: Container(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.of(context).size.height * 0.9,
        ),
        decoration: const BoxDecoration(
          color: AppPalette.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(32)),
        ),
        child: SingleChildScrollView(
          padding: EdgeInsets.fromLTRB(
            Responsive.pad(context, 20),
            Responsive.pad(context, 12),
            Responsive.pad(context, 20),
            Responsive.pad(context, 24),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: AppPalette.iceDeep,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              SizedBox(height: Responsive.pad(context, 16)),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      'Attendance',
                      style: GoogleFonts.hankenGrotesk(
                        fontSize: Responsive.sp(context, 20),
                        fontWeight: FontWeight.w700,
                        color: AppPalette.ink,
                      ),
                    ),
                  ),
                  Container(
                    padding: EdgeInsets.symmetric(
                      horizontal: Responsive.pad(context, 12),
                      vertical: Responsive.pad(context, 8),
                    ),
                    decoration: BoxDecoration(
                      color: AppPalette.aquaSoft,
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Text(
                      '$_percent%',
                      style: GoogleFonts.hankenGrotesk(
                        fontSize: Responsive.sp(context, 18),
                        fontWeight: FontWeight.w800,
                        color: AppPalette.aquaDeep,
                      ),
                    ),
                  ),
                ],
              ),
              SizedBox(height: Responsive.pad(context, 8)),
              Row(
                children: [
                  Text(
                    DateFormat('MMMM yyyy').format(DateTime(_year, _month)),
                    style: GoogleFonts.hankenGrotesk(
                      fontSize: Responsive.sp(context, 13.5),
                      fontWeight: FontWeight.w700,
                      color: AppPalette.ink,
                    ),
                  ),
                  const Spacer(),
                  Text(
                    'Swipe for previous month',
                    style: TextStyle(
                      fontSize: Responsive.sp(context, 10),
                      fontWeight: FontWeight.w600,
                      color: AppPalette.muted.withValues(alpha: 0.7),
                    ),
                  ),
                ],
              ),
              if (_loading)
                Padding(
                  padding: EdgeInsets.only(top: Responsive.pad(context, 8)),
                  child: LinearProgressIndicator(
                    minHeight: 2,
                    color: AppPalette.aqua,
                    backgroundColor: AppPalette.iceSoft,
                  ),
                ),
              SizedBox(height: Responsive.pad(context, 10)),
              Row(
                children: [
                  Expanded(
                    child: _statTile(
                      'Present',
                      '$_present',
                      AppPalette.aquaDeep,
                    ),
                  ),
                  SizedBox(width: Responsive.pad(context, 8)),
                  Expanded(
                    child: _statTile(
                      'Absent',
                      '$_absent',
                      const Color(0xFFB42318),
                    ),
                  ),
                  SizedBox(width: Responsive.pad(context, 8)),
                  Expanded(
                    child: _statTile('Late', '$_late', const Color(0xFFB45309)),
                  ),
                ],
              ),
              SizedBox(height: Responsive.pad(context, 8)),
              Row(
                children: [
                  Expanded(
                    child: _statTile('Leave', '$_leave', AppPalette.ocean),
                  ),
                  SizedBox(width: Responsive.pad(context, 8)),
                  Expanded(
                    child: _statTile(
                      'Half Day',
                      '$_halfDay',
                      const Color(0xFF7E22CE),
                    ),
                  ),
                  SizedBox(width: Responsive.pad(context, 8)),
                  Expanded(
                    child: _statTile(
                      'Late Deduct.',
                      '${_fmtDays(_lateDeductionDays)}d',
                      const Color(0xFFB45309),
                    ),
                  ),
                ],
              ),
              SizedBox(height: Responsive.pad(context, 12)),
              GestureDetector(
                behavior: HitTestBehavior.opaque,
                onHorizontalDragStart: (_) {
                  setState(() => _dragging = true);
                },
                onHorizontalDragUpdate: (details) {
                  final dx = details.delta.dx;
                  final canGoBack = !_atOldestMonth;
                  final canGoForward = !_atCurrentMonth;
                  final blocked =
                      (dx > 0 && !canGoBack) || (dx < 0 && !canGoForward);
                  setState(() {
                    _dragOffset += blocked ? dx * 0.25 : dx;
                  });
                },
                onHorizontalDragEnd: (details) {
                  final velocity = details.primaryVelocity ?? 0;
                  final shouldGoBack =
                      (_dragOffset > 48 || velocity > 220) && !_atOldestMonth;
                  final shouldGoForward =
                      (_dragOffset < -48 || velocity < -220) &&
                      !_atCurrentMonth;
                  setState(() {
                    _dragging = false;
                    _dragOffset = 0;
                  });
                  if (_loading) return;
                  if (shouldGoBack) {
                    _goBackOneMonth();
                  } else if (shouldGoForward) {
                    _goForwardOneMonth();
                  }
                },
                child: AnimatedContainer(
                  duration: _dragging
                      ? Duration.zero
                      : const Duration(milliseconds: 260),
                  curve: Curves.easeOutCubic,
                  transform: Matrix4.translationValues(_dragOffset, 0, 0),
                  child: AnimatedSwitcher(
                    duration: const Duration(milliseconds: 280),
                    switchInCurve: Curves.easeOutCubic,
                    switchOutCurve: Curves.easeInCubic,
                    transitionBuilder: (child, animation) {
                      final curved = CurvedAnimation(
                        parent: animation,
                        curve: Curves.easeOutCubic,
                      );
                      return FadeTransition(
                        opacity: curved,
                        child: SlideTransition(
                          position: Tween<Offset>(
                            begin: const Offset(0.04, 0),
                            end: Offset.zero,
                          ).animate(curved),
                          child: child,
                        ),
                      );
                    },
                    child: KeyedSubtree(
                      key: ValueKey('attendance-$_year-$_month'),
                      child: MiniCalendar(
                        year: _year,
                        month: _month,
                        statusByDate: _statusByDate,
                        selectedDate: _selectedDate,
                        onDateSelected: (key) {
                          setState(
                            () => _selectedDate = _selectedDate == key
                                ? null
                                : key,
                          );
                        },
                      ),
                    ),
                  ),
                ),
              ),
              if (detail != null) ...[
                SizedBox(height: Responsive.pad(context, 12)),
                Container(
                  padding: EdgeInsets.all(Responsive.pad(context, 12)),
                  decoration: BoxDecoration(
                    color: AppPalette.iceSoft,
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Row(
                    children: [
                      Icon(
                        TablerIcons.calendar_check,
                        size: Responsive.sp(context, 16),
                        color: _statusMeta(detail['status']?.toString()).$1,
                      ),
                      SizedBox(width: Responsive.pad(context, 8)),
                      Expanded(
                        child: Text(
                          '${_statusMeta(detail['status']?.toString()).$2}  ·  IN ${_fmtTime(detail['punch_in_time'])}  ·  OUT ${_fmtTime(detail['punch_out_time'])}',
                          style: TextStyle(
                            fontSize: Responsive.sp(context, 11.5),
                            fontWeight: FontWeight.w600,
                            color: AppPalette.ink,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _statTile(String label, String value, Color color) {
    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: Responsive.pad(context, 10),
        vertical: Responsive.pad(context, 9),
      ),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            value,
            style: GoogleFonts.hankenGrotesk(
              fontSize: Responsive.sp(context, 16),
              fontWeight: FontWeight.w800,
              color: color,
            ),
          ),
          SizedBox(height: Responsive.pad(context, 2)),
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: Responsive.sp(context, 10),
              fontWeight: FontWeight.w600,
              color: AppPalette.muted,
            ),
          ),
        ],
      ),
    );
  }
}

class _SelfiePunchSheet extends StatefulWidget {
  final Map<String, dynamic> worker;
  final String action;
  const _SelfiePunchSheet({required this.worker, required this.action});

  @override
  State<_SelfiePunchSheet> createState() => _SelfiePunchSheetState();
}

class _SelfiePunchSheetState extends State<_SelfiePunchSheet> {
  File? _selfie;
  double? _lat;
  double? _lng;
  String? _placeName;
  bool _locating = true;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _resolveLocation();
  }

  Future<void> _resolveLocation() async {
    setState(() => _locating = true);
    final pos = await LocationService.getCurrentLocation();
    String? place;
    if (pos != null) {
      place = await LocationService.getPlaceName(pos.latitude, pos.longitude);
    }
    if (mounted) {
      setState(() {
        _lat = pos?.latitude;
        _lng = pos?.longitude;
        _placeName = place;
        _locating = false;
      });
    }
  }

  Future<void> _capture() async {
    try {
      final picked = await ImagePicker().pickImage(
        source: ImageSource.camera,
        imageQuality: 70,
      );
      if (picked != null && mounted)
        setState(() => _selfie = File(picked.path));
    } catch (_) {
      if (mounted) {
        AppToast.error('Could not open camera');
      }
    }
  }

  Future<void> _submit() async {
    if (_selfie == null) {
      AppToast.warning('Capture a selfie first');
      return;
    }
    if (_lat == null || _lng == null) {
      AppToast.warning('Location not available. Enable GPS and retry.');
      return;
    }
    setState(() => _submitting = true);
    try {
      final bytes = await _selfie!.readAsBytes();
      await ApiService.hrSelfiePunch(
        workerId: (widget.worker['id'] ?? '').toString(),
        type: widget.action,
        selfieBase64: base64Encode(bytes),
        mimeType: 'image/jpeg',
        latitude: _lat!,
        longitude: _lng!,
      );
      if (!mounted) return;
      Navigator.pop(context);
      AppToast.success(
        widget.action == 'punch_in'
            ? 'Punch-in recorded'
            : 'Punch-out recorded',
      );
    } catch (e) {
      if (mounted) {
        AppToast.error(e.toString().replaceFirst('Exception: ', ''));
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isPunchIn = widget.action == 'punch_in';
    final name = (widget.worker['name'] ?? 'Employee').toString();
    return Container(
      height: MediaQuery.of(context).size.height * 0.85,
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(32)),
      ),
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              isPunchIn ? 'Punch In' : 'Punch Out',
              style: GoogleFonts.hankenGrotesk(
                fontSize: 20,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              name,
              style: const TextStyle(fontSize: 14, color: Color(0xff5e7e99)),
            ),
            const SizedBox(height: 16),
            if (_selfie != null)
              ClipRRect(
                borderRadius: BorderRadius.circular(22),
                child: AspectRatio(
                  aspectRatio: 4 / 3,
                  child: Image.file(_selfie!, fit: BoxFit.cover),
                ),
              )
            else
              Container(
                height: 200,
                decoration: BoxDecoration(
                  color: const Color(0xffeef6fc),
                  borderRadius: BorderRadius.circular(22),
                ),
                child: const Center(
                  child: Icon(
                    Icons.camera_alt_outlined,
                    size: 40,
                    color: Color(0xff8ba7bd),
                  ),
                ),
              ),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: _capture,
              icon: const Icon(Icons.camera_alt_rounded),
              label: Text(_selfie == null ? 'Capture Selfie' : 'Retake Selfie'),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Icon(
                  _lat != null
                      ? Icons.location_on_rounded
                      : Icons.location_off_rounded,
                  size: 18,
                  color: _lat != null
                      ? const Color(0xff17a97f)
                      : const Color(0xFFDC2626),
                ),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    _locating
                        ? 'Resolving location...'
                        : _lat != null
                        ? '${_placeName ?? ''}${_placeName != null && _placeName!.isNotEmpty ? '\n' : ''}${_lat!.toStringAsFixed(5)}, ${_lng!.toStringAsFixed(5)}'
                        : 'Location unavailable',
                    style: const TextStyle(
                      fontSize: 12,
                      color: Color(0xff5e7e99),
                    ),
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.refresh_rounded),
                  onPressed: _resolveLocation,
                ),
              ],
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _submitting ? null : _submit,
              style: FilledButton.styleFrom(
                backgroundColor: isPunchIn
                    ? const Color(0xff174a7c)
                    : const Color(0xff17a97f),
                minimumSize: const Size.fromHeight(52),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(22),
                ),
              ),
              child: _submitting
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : Text(isPunchIn ? 'Submit Punch In' : 'Submit Punch Out'),
            ),
          ],
        ),
      ),
    );
  }
}

class _ProofUploadSheet extends StatefulWidget {
  final String date;
  final String? leaveId;
  final Future<void> Function()? onUploaded;
  const _ProofUploadSheet({required this.date, this.leaveId, this.onUploaded});

  @override
  State<_ProofUploadSheet> createState() => _ProofUploadSheetState();
}

class _ProofUploadSheetState extends State<_ProofUploadSheet> {
  XFile? _image;
  bool _uploading = false;

  Future<void> _pick(ImageSource source) async {
    try {
      final picked = await ImagePicker().pickImage(
        source: source,
        imageQuality: 70,
      );
      if (picked != null) setState(() => _image = picked);
    } catch (_) {}
  }

  Future<void> _submit() async {
    if (_image == null || _uploading) return;
    setState(() => _uploading = true);
    try {
      final bytes = await _image!.readAsBytes();
      await ApiService.uploadAbsenceProof(
        date: widget.date,
        proofBase64: base64Encode(bytes),
        mimeType: _image!.mimeType ?? 'image/jpeg',
        leaveId: widget.leaveId,
      );
      if (!mounted) return;
      Navigator.pop(context);
      await widget.onUploaded?.call();
      if (!mounted) return;
      AppToast.success('Proof uploaded — awaiting review');
    } catch (e) {
      if (mounted) {
        AppToast.error(e.toString().replaceFirst('Exception: ', ''));
      }
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    String displayDate = widget.date;
    final d = DateTime.tryParse(widget.date);
    if (d != null) displayDate = DateFormat('d MMM yyyy').format(d);
    return Container(
      height: MediaQuery.of(context).size.height * 0.6,
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(32)),
      ),
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Upload Absence Proof',
              style: GoogleFonts.hankenGrotesk(
                fontSize: 20,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              'For $displayDate · HR will review this proof for your unauthorized absence.',
              style: const TextStyle(fontSize: 13, color: Color(0xff5e7e99)),
            ),
            const SizedBox(height: 16),
            if (_image != null)
              ClipRRect(
                borderRadius: BorderRadius.circular(22),
                child: AspectRatio(
                  aspectRatio: 4 / 3,
                  child: Image.file(File(_image!.path), fit: BoxFit.cover),
                ),
              )
            else
              Container(
                height: 180,
                decoration: BoxDecoration(
                  color: const Color(0xffeef6fc),
                  borderRadius: BorderRadius.circular(22),
                ),
                child: const Center(
                  child: Icon(
                    Icons.photo_outlined,
                    size: 40,
                    color: Color(0xff8ba7bd),
                  ),
                ),
              ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => _pick(ImageSource.camera),
                    icon: const Icon(Icons.camera_alt_outlined),
                    label: const Text('Camera'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => _pick(ImageSource.gallery),
                    icon: const Icon(Icons.photo_library_outlined),
                    label: const Text('Gallery'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _image == null || _uploading ? null : _submit,
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFF93000a),
                minimumSize: const Size.fromHeight(52),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(22),
                ),
              ),
              child: _uploading
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Text('Submit Proof'),
            ),
          ],
        ),
      ),
    );
  }
}

class _ProofReviewSheet extends StatefulWidget {
  final List<dynamic> proofs;
  final void Function(dynamic id) onReviewed;
  const _ProofReviewSheet({required this.proofs, required this.onReviewed});

  @override
  State<_ProofReviewSheet> createState() => _ProofReviewSheetState();
}

class _ProofReviewSheetState extends State<_ProofReviewSheet> {
  late List<dynamic> _items;
  final Map<String, TextEditingController> _remarks = {};
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _items = List<dynamic>.from(widget.proofs);
    for (final p in _items) {
      _remarks[p['id'].toString()] = TextEditingController();
    }
  }

  @override
  void dispose() {
    for (final c in _remarks.values) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _review(dynamic proof, String status) async {
    if (_busy) return;
    final id = proof['id']?.toString() ?? '';
    final remark = _remarks[id]?.text.trim();
    setState(() => _busy = true);
    try {
      await ApiService.reviewAbsenceProof(id, status, remark: remark);
      if (!mounted) return;
      widget.onReviewed(proof['id']);
      setState(
        () => _items = _items.where((p) => p['id'] != proof['id']).toList(),
      );
      if (status == 'approved') {
        AppToast.success('Proof approved — worker grace is safe');
      } else {
        AppToast.error('Proof rejected — this month\u2019s grace is forfeited');
      }
    } catch (e) {
      if (mounted) {
        AppToast.error(e.toString().replaceFirst('Exception: ', ''));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _viewFull(dynamic proof) {
    final bytes = base64Decode((proof['proof_data'] ?? '').toString());
    showSpringDialog(
      context: context,
      builder: (_) => Dialog(
        backgroundColor: Colors.black,
        insetPadding: const EdgeInsets.all(12),
        child: InteractiveViewer(
          child: Image.memory(bytes, fit: BoxFit.contain),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      height: MediaQuery.of(context).size.height * 0.85,
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(32)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Absence Proofs',
              style: GoogleFonts.hankenGrotesk(
                fontSize: 20,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              '${_items.length} awaiting review \u00B7 approving keeps the worker\u2019s late grace',
              style: const TextStyle(fontSize: 13, color: Color(0xff5e7e99)),
            ),
            const SizedBox(height: 16),
            Expanded(
              child: _items.isEmpty
                  ? const Center(
                      child: Text(
                        'All caught up',
                        style: TextStyle(
                          fontSize: 14,
                          color: Color(0xff8ba7bd),
                        ),
                      ),
                    )
                  : ListView.separated(
                      itemCount: _items.length,
                      separatorBuilder: (_, _) => const SizedBox(height: 16),
                      itemBuilder: (context, i) {
                        final proof = _items[i];
                        final worker = proof['workers'];
                        final name = worker is Map
                            ? (worker['name'] ?? 'Worker').toString()
                            : 'Worker';
                        final loginId = worker is Map
                            ? worker['login_id']?.toString()
                            : null;
                        String dateStr = proof['date']?.toString() ?? '';
                        final d = DateTime.tryParse(dateStr);
                        if (d != null)
                          dateStr = DateFormat('d MMM yyyy').format(d);
                        final id = proof['id'].toString();
                        Uint8List? imgBytes;
                        try {
                          imgBytes = base64Decode(
                            (proof['proof_data'] ?? '').toString(),
                          );
                        } catch (_) {}
                        return Container(
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(22),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                name,
                                style: GoogleFonts.hankenGrotesk(
                                  fontSize: 15,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              Text(
                                [dateStr, ?loginId].join(' \u00B7 '),
                                style: const TextStyle(
                                  fontSize: 12,
                                  color: Color(0xff5e7e99),
                                ),
                              ),
                              const SizedBox(height: 10),
                              if (imgBytes != null)
                                InkWell(
                                  onTap: () => _viewFull(proof),
                                  child: ClipRRect(
                                    borderRadius: BorderRadius.circular(22),
                                    child: Image.memory(
                                      imgBytes,
                                      height: 160,
                                      width: double.infinity,
                                      fit: BoxFit.cover,
                                    ),
                                  ),
                                )
                              else
                                Container(
                                  height: 80,
                                  alignment: Alignment.center,
                                  decoration: BoxDecoration(
                                    color: const Color(0xffeef6fc),
                                    borderRadius: BorderRadius.circular(22),
                                  ),
                                  child: const Text(
                                    'Proof image unavailable',
                                    style: TextStyle(
                                      fontSize: 12,
                                      color: Color(0xff8ba7bd),
                                    ),
                                  ),
                                ),
                              const SizedBox(height: 10),
                              TextField(
                                controller: _remarks[id],
                                decoration: InputDecoration(
                                  hintText: 'Remark (optional)',
                                  isDense: true,
                                  border: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(22),
                                  ),
                                ),
                                style: const TextStyle(fontSize: 13),
                              ),
                              const SizedBox(height: 10),
                              Row(
                                children: [
                                  Expanded(
                                    child: OutlinedButton(
                                      onPressed: _busy
                                          ? null
                                          : () => _review(proof, 'rejected'),
                                      style: OutlinedButton.styleFrom(
                                        foregroundColor: const Color(
                                          0xFF93000a,
                                        ),
                                        side: const BorderSide(
                                          color: Color(0xFF93000a),
                                        ),
                                      ),
                                      child: const Text('Reject'),
                                    ),
                                  ),
                                  const SizedBox(width: 10),
                                  Expanded(
                                    child: FilledButton(
                                      onPressed: _busy
                                          ? null
                                          : () => _review(proof, 'approved'),
                                      style: FilledButton.styleFrom(
                                        backgroundColor: const Color(
                                          0xff0f7a5a,
                                        ),
                                      ),
                                      child: const Text('Approve'),
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
