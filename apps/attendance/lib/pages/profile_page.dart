import 'package:flutter/material.dart';
import 'package:flutter_tabler_icons/flutter_tabler_icons.dart';
import 'package:intl/intl.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:liquid_pull_to_refresh/liquid_pull_to_refresh.dart';
import '../services/api_service.dart';
import '../services/realtime_service.dart';
import '../main.dart';
import '../theme/app_palette.dart';
import '../widgets/mini_calendar.dart';
import '../widgets/ui_motion.dart';
import '../widgets/consistency_bar.dart';
import '../utils/responsive.dart';

import '../widgets/skeleton_loader.dart';
import 'edit_profile_page.dart';

class ProfilePage extends StatefulWidget {
  final VoidCallback? onLogout;
  final int tabChangeVersion;
  const ProfilePage({super.key, this.onLogout, required this.tabChangeVersion});

  @override
  State<ProfilePage> createState() => _ProfilePageState();
}

class _ProfilePageState extends State<ProfilePage> {
  final ScrollController _scrollController = ScrollController();
  Map<String, dynamic>? _worker;
  bool _loading = true;
  List<dynamic> _loans = [];
  final Set<String> _expandedCards = {};

  int _present = 0, _absent = 0, _late = 0, _leave = 0, _lateUsed = 0;
  Map<String, String> _statusByDate = {};
  Map<String, Map<String, dynamic>> _historyByDate = {};
  String? _selectedDateKey;
  final Map<int, Map<String, int>> _monthlyStats = {};
  Map<String, List<String>> _calendarDates = {};
  Map<String, dynamic>? _salaryBreakdown;
  int? _breakdownYm;
  int _calYear = DateTime.now().year;
  int _calMonth = DateTime.now().month;
  Map<String, dynamic>? _printProfile;

  @override
  void initState() {
    super.initState();
    RealtimeService.instance.addListener(_onRealtimeChange);
    _loadData();
  }

  @override
  void didUpdateWidget(covariant ProfilePage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.tabChangeVersion != oldWidget.tabChangeVersion) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_scrollController.hasClients) _scrollController.jumpTo(0);
        _refreshHistoryFromNetwork();
        _fetchCalendar();
        _fetchSalaryBreakdown();
      });
    }
  }

  @override
  void dispose() {
    _scrollController.dispose();
    RealtimeService.instance.removeListener(_onRealtimeChange);
    super.dispose();
  }

  Future<void> _loadData() async {
    try {
      _worker ??= await ApiService.getWorkerData();

      // Cached data lets the network phase start from a warm state, but the
      // skeleton stays up until every section has its real values.
      final cachedProfile = await ApiService.getCachedProfile();
      if (cachedProfile != null) {
        _worker = cachedProfile;
        await ApiService.saveWorkerData(cachedProfile);
      }
      await _applyCachedHistory(ApiService.getCachedHistory());

      try {
        final profile = await ApiService.getMyProfile();
        _worker = profile;
        await ApiService.saveWorkerData(profile);
      } catch (_) {}

      await _refreshHistoryFromNetwork();
      await Future.wait([
        _fetchCalendar(),
        _fetchSalaryBreakdown(),
        _fetchPrintProfile(),
        _fetchLoans(),
      ]);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _fetchLoans() async {
    try {
      final loans = await ApiService.getMyLoans();
      if (mounted) setState(() => _loans = loans);
    } catch (_) {}
  }

  Future<void> _fetchPrintProfile() async {
    try {
      final data = await ApiService.getPrintProfile();
      if (mounted) setState(() => _printProfile = data);
    } catch (_) {}
  }

  Future<void> _fetchSalaryBreakdown({int? year, int? month}) async {
    try {
      final y = year ?? _calYear;
      final m = month ?? _calMonth;
      var data = await ApiService.getMySalaryBreakdown(year: y, month: m);
      if (data != null) {
        // The server echoes the month it computed. Older servers ignore the
        // params and always answer with the current month, so only trust those
        // for the current month.
        final ry = data['year'];
        final rm = data['month'];
        final now = DateTime.now();
        final ok = (ry is num && rm is num)
            ? (ry.toInt() == y && rm.toInt() == m)
            : (y == now.year && m == now.month);
        if (!ok) data = null;
      }
      if (mounted && y == _calYear && m == _calMonth) {
        setState(() {
          _salaryBreakdown = data;
          _breakdownYm = y * 100 + m;
        });
      }
    } catch (_) {}
  }

  Map<String, dynamic>? get _selectedBreakdown {
    if (_breakdownYm != _calYear * 100 + _calMonth) return null;
    return _salaryBreakdown;
  }

  Set<String> _forfeitedHolidayKeys() {
    final bd = _selectedBreakdown;
    if (bd == null) return const {};
    final dates = bd['forfeitedHolidayDates'];
    if (dates is List) {
      return dates.map((d) => d.toString()).where((s) => s.isNotEmpty).toSet();
    }
    return const {};
  }

  Set<String> _deductedSundayKeys() {
    final bd = _selectedBreakdown;
    if (bd == null || bd['hasSalary'] != true) return const {};
    final dates = bd['deductedDates'];
    if (dates is List) {
      final out = <String>{};
      for (final d in dates) {
        final s = d?.toString();
        if (s == null || s.isEmpty) continue;
        final dt = DateTime.tryParse(s);
        if (dt != null && dt.weekday == DateTime.sunday) out.add(s);
      }
      return out;
    }
    return _deriveDeductedSundays(bd);
  }

  // Older servers don't send deductedDates — rebuild the same Sunday set the
  // salary sheet uses from the fields they do send.
  Set<String> _deriveDeductedSundays(Map<String, dynamic> bd) {
    final y = _calYear;
    final m = _calMonth;
    final daysInMonth =
        ((bd['daysInMonth'] as num?) ?? DateTime(y, m + 1, 0).day).toInt();
    String keyOf(DateTime d) =>
        '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

    final sundays = <String>[
      for (var d = 1; d <= daysInMonth; d++)
        if (DateTime(y, m, d).weekday == DateTime.sunday)
          keyOf(DateTime(y, m, d)),
    ];
    if (sundays.isEmpty) return const {};

    final deducted = <String>{};
    final records = bd['records'] is List ? bd['records'] as List : const [];
    final absences = <String>{
      for (final d in (bd['absentDates'] as List? ?? [])) d.toString(),
    };
    for (final r in records) {
      final st = r['status']?.toString();
      if (st == 'absent' || st == 'leave') absences.add(r['date'].toString());
    }
    // Absent/leave on Saturday clubs the next Sunday, on Monday the previous.
    for (final d in absences) {
      final dt = DateTime.tryParse(d);
      if (dt == null || dt.year != y || dt.month != m) continue;
      DateTime? sun;
      if (dt.weekday == DateTime.saturday)
        sun = dt.add(const Duration(days: 1));
      if (dt.weekday == DateTime.monday)
        sun = dt.subtract(const Duration(days: 1));
      if (sun != null && sun.year == y && sun.month == m)
        deducted.add(keyOf(sun));
    }

    // 6+ absences (or a join after the 10th) cancels every Sunday.
    final absentCount = ((bd['absentCount'] as num?) ?? 0).toInt();
    final joinDay = ((bd['joinDay'] as num?) ?? 1).toInt();
    final lateJoin = bd['joinedThisMonth'] == true && joinDay > 10;
    if (absentCount >= 6 || lateJoin) deducted.addAll(sundays);

    // Sundays beyond the free pool that were not paid are unpaid. The new rules
    // pay every eligible Sunday, so nothing extra is ever deducted for them.
    if (!_newSundayRules) {
      final attended = <String>{
        for (final r in records)
          if (['present', 'late', 'half-day'].contains(r['status']?.toString()))
            r['date'].toString(),
      };
      final freeRaw =
          (((bd['paidSundayCount'] as num?) ?? 0) -
                  ((bd['attendedSundayCount'] as num?) ?? 0))
              .toInt();
      final free = freeRaw < 0 ? 0 : freeRaw;
      final eligibleNotWorked = sundays
          .where((s) => !deducted.contains(s) && !attended.contains(s))
          .toList();
      final unpaidCount = eligibleNotWorked.length - free;
      if (unpaidCount > 0) deducted.addAll(eligibleNotWorked.take(unpaidCount));
    }

    return deducted;
  }

  void _onRealtimeChange() {
    final event = RealtimeService.instance.lastEvent;
    if (event == null) return;
    switch (event) {
      case RealtimeEvent.attendance:
      case RealtimeEvent.corrections:
        _refreshHistoryFromNetwork();
      default:
        break;
    }
  }

  Future<void> _applyCachedHistory(Future<List<dynamic>?> future) async {
    final cachedHistory = await future;
    if (cachedHistory == null) return;
    int p = 0, a = 0, l = 0, lv = 0;
    final statusMap = <String, String>{};
    final monthlyStats = <int, Map<String, int>>{};
    final detailMap = <String, Map<String, dynamic>>{};

    for (final rec in cachedHistory) {
      final date = rec['date'] ?? '';
      final status = rec['status'] ?? 'present';
      statusMap[date.toString()] = status.toString();
      detailMap[date.toString()] = {
        'date': date,
        'status': status,
        'punch_in_time': rec['punch_in_time'],
        'punch_out_time': rec['punch_out_time'],
        'hours_worked': rec['hours_worked'],
        'late_minutes': rec['late_minutes'],
      };
      final dt = DateTime.tryParse(date.toString());
      if (dt != null) {
        final ym = dt.year * 100 + dt.month;
        monthlyStats.putIfAbsent(
          ym,
          () => {
            'present': 0,
            'absent': 0,
            'late': 0,
            'leave': 0,
            'half-day': 0,
            'holiday': 0,
          },
        );
        final st = status.toString();
        if (monthlyStats[ym]!.containsKey(st)) {
          monthlyStats[ym]![st] = monthlyStats[ym]![st]! + 1;
        }
      }
      switch (status) {
        case 'present':
          p++;
          break;
        case 'absent':
          a++;
          break;
        case 'late':
          l++;
          p++;
          break;
        case 'leave':
          lv++;
          break;
      }
    }

    setState(() {
      _present = p;
      _absent = a;
      _late = l;
      _leave = lv;
      _statusByDate = statusMap;
      _historyByDate = detailMap;
      _monthlyStats.clear();
      _monthlyStats.addAll(monthlyStats);
    });
  }

  Future<void> _refreshHistoryFromNetwork() async {
    int p = 0, a = 0, l = 0, lv = 0;
    final statusMap = <String, String>{};
    final monthlyStats = <int, Map<String, int>>{};
    final detailMap = <String, Map<String, dynamic>>{};

    try {
      final res = await Future.wait([
        ApiService.getHistory(),
        ApiService.getTodayStatus(),
      ]);
      final history = res[0] as List<dynamic>;
      final today = res[1] as Map<String, dynamic>;

      for (final rec in history) {
        final date = rec['date'] ?? '';
        final status = rec['status'] ?? 'present';
        statusMap[date.toString()] = status.toString();
        detailMap[date.toString()] = {
          'date': date,
          'status': status,
          'punch_in_time': rec['punch_in_time'],
          'punch_out_time': rec['punch_out_time'],
          'hours_worked': rec['hours_worked'],
          'late_minutes': rec['late_minutes'],
        };
        final dt = DateTime.tryParse(date.toString());
        if (dt != null) {
          final ym = dt.year * 100 + dt.month;
          monthlyStats.putIfAbsent(
            ym,
            () => {
              'present': 0,
              'absent': 0,
              'late': 0,
              'leave': 0,
              'half-day': 0,
              'holiday': 0,
            },
          );
          final st = status.toString();
          if (monthlyStats[ym]!.containsKey(st)) {
            monthlyStats[ym]![st] = monthlyStats[ym]![st]! + 1;
          }
        }
        switch (status) {
          case 'present':
            p++;
            break;
          case 'absent':
            a++;
            break;
          case 'late':
            l++;
            p++;
            break;
          case 'leave':
            lv++;
            break;
        }
      }

      setState(() {
        _present = p;
        _absent = a;
        _late = l;
        _leave = lv;
        _lateUsed = today['lateUsed'] ?? 0;
        _statusByDate = statusMap;
        _historyByDate = detailMap;
        _monthlyStats.clear();
        _monthlyStats.addAll(monthlyStats);
      });
    } catch (_) {}
  }

  Future<void> _fetchCalendar({int? year, int? month}) async {
    try {
      final n = DateTime.now();
      final y = year ?? n.year;
      final m = month ?? n.month;
      final data = await ApiService.getCalendar(year: y, month: m);
      final Map<String, List<String>> calMap = {};
      for (final e in (data['events'] as List? ?? [])) {
        final d = e['date']?.toString();
        if (d != null) calMap.putIfAbsent(d, () => []).add('event');
      }
      for (final h in (data['holidays'] as List? ?? [])) {
        final d = h['date']?.toString();
        if (d != null) calMap.putIfAbsent(d, () => []).add('holiday');
      }
      for (final b in (data['birthdays'] as List? ?? [])) {
        final d = b['date']?.toString();
        if (d != null) calMap.putIfAbsent(d, () => []).add('birthday');
      }
      if (mounted) setState(() => _calendarDates = calMap);
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColors>()!;
    final scheme = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;

    final rawName = _worker?['name'] ?? 'Worker';
    final name = rawName
        .split(' ')
        .map(
          (w) => w.isNotEmpty
              ? '${w[0].toUpperCase()}${w.substring(1).toLowerCase()}'
              : '',
        )
        .join(' ');
    final loginId = _worker?['login_id'] ?? '';
    final role = _worker?['role'] ?? _worker?['designation'] ?? '';
    final total = _present + _absent + _late + _leave;
    final rate = total > 0 ? (_present + _late) / total : 0.0;
    final initials = name
        .split(' ')
        .map((n) => n.isNotEmpty ? n[0] : '')
        .join()
        .toUpperCase();

    final presentFraction = total > 0 ? _present / total : 0.0;
    final absentFraction = total > 0 ? _absent / total : 0.0;
    final leaveFraction = total > 0 ? _leave / total : 0.0;
    final lateFraction = total > 0 ? _late / total : 0.0;

    final content = Scaffold(
      backgroundColor: AppPalette.iceBlue,
      body: SafeArea(
        child: LiquidPullToRefresh(
          onRefresh: _loadData,
          color: AppPalette.ocean,
          backgroundColor: AppPalette.iceBlue,
          height: 96,
          showChildOpacityTransition: false,
          springAnimationDurationInMilliseconds: 700,
          child: ListView(
            controller: _scrollController,
            physics: const AlwaysScrollableScrollPhysics(),
            padding: EdgeInsets.fromLTRB(
              Responsive.pad(context, 16),
              Responsive.pad(context, 16),
              Responsive.pad(context, 16),
              Responsive.pad(context, 120),
            ),
            children: [
              Padding(
                padding: EdgeInsets.only(bottom: Responsive.pad(context, 14)),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Profile',
                      style: GoogleFonts.hankenGrotesk(
                        fontSize: Responsive.sp(context, 26),
                        fontWeight: FontWeight.w700,
                        color: AppPalette.ink,
                      ),
                    ),
                    SizedBox(height: Responsive.pad(context, 2)),
                    Text(
                      'Attendance and payroll at a glance',
                      style: TextStyle(
                        fontSize: Responsive.sp(context, 12.5),
                        fontWeight: FontWeight.w500,
                        color: AppPalette.muted,
                      ),
                    ),
                  ],
                ),
              ),
              StaggeredReveal(
                index: 0,
                child: _profileCard(name, loginId, role, initials),
              ),
              SizedBox(height: Responsive.pad(context, 16)),
              StaggeredReveal(
                index: 1,
                child: _surfaceCard(_summaryCardsGrid(colors, scheme)),
              ),
              SizedBox(height: Responsive.pad(context, 16)),
              StaggeredReveal(
                index: 2,
                child: Container(
                  padding: EdgeInsets.all(Responsive.pad(context, 18)),
                  decoration: BoxDecoration(
                    color: Color.alphaBlend(
                      _lateTierColor.withValues(alpha: 0.12),
                      AppPalette.white,
                    ),
                    borderRadius: BorderRadius.circular(24),
                    boxShadow: AppPalette.lift(0.45),
                  ),
                  child: _lateDeductionCard(colors, scheme, tt),
                ),
              ),
              SizedBox(height: Responsive.pad(context, 16)),
              StaggeredReveal(
                index: 3,
                child: _surfaceCard(
                  _attendanceCalendar(
                    presentFraction,
                    absentFraction,
                    leaveFraction,
                    lateFraction,
                    rate,
                    colors,
                    scheme,
                    tt,
                  ),
                ),
              ),
              SizedBox(height: Responsive.pad(context, 16)),
              StaggeredReveal(
                index: 5,
                child: _surfaceCard(_loanStatusCard(colors, scheme, tt)),
              ),
              SizedBox(height: Responsive.pad(context, 24)),
              StaggeredReveal(
                index: 6,
                child: SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed: _confirmLogout,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppPalette.error,
                      foregroundColor: Colors.white,
                      elevation: 0,
                      padding: EdgeInsets.symmetric(
                        vertical: Responsive.pad(context, 16),
                      ),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                    ),
                    icon: Icon(
                      TablerIcons.power,
                      size: Responsive.sp(context, 20),
                    ),
                    label: Text(
                      'LOGOUT',
                      style: GoogleFonts.hankenGrotesk(
                        fontSize: Responsive.sp(context, 14),
                        fontWeight: FontWeight.w800,
                        letterSpacing: Responsive.sp(context, 1.5),
                      ),
                    ),
                  ),
                ),
              ),
              SizedBox(height: Responsive.pad(context, 16)),
            ],
          ),
        ),
      ),
    );

    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 480),
      switchInCurve: Curves.easeInOutCubic,
      switchOutCurve: Curves.easeInCubic,
      transitionBuilder: (child, animation) {
        final curved = CurvedAnimation(
          parent: animation,
          curve: Curves.easeInOutCubic,
        );
        return FadeTransition(
          opacity: curved,
          child: SlideTransition(
            position: Tween<Offset>(
              begin: const Offset(0, 0.02),
              end: Offset.zero,
            ).animate(curved),
            child: child,
          ),
        );
      },
      child: _loading
          ? KeyedSubtree(
              key: const ValueKey('profile-skeleton'),
              child: TweenAnimationBuilder<double>(
                tween: Tween(begin: 0, end: 1),
                duration: const Duration(milliseconds: 280),
                curve: Curves.easeInOut,
                builder: (_, value, child) =>
                    Opacity(opacity: value, child: child),
                child: const ProfileSkeleton(),
              ),
            )
          : KeyedSubtree(
              key: const ValueKey('profile-content'),
              child: content,
            ),
    );
  }

  Widget _surfaceCard(Widget child) {
    return Container(
      padding: EdgeInsets.all(Responsive.pad(context, 18)),
      decoration: BoxDecoration(
        color: AppPalette.white,
        borderRadius: BorderRadius.circular(24),
        boxShadow: AppPalette.lift(0.45),
      ),
      child: child,
    );
  }

  Widget _profileCard(
    String name,
    String loginId,
    String role,
    String initials,
  ) {
    final sc = Theme.of(context).colorScheme;
    return GestureDetector(
      onTap: () {
        showSpringSheet(
          context: context,
          builder: (_) => SizedBox(
            height: MediaQuery.of(context).size.height * 0.90,
            child: Container(
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.surface,
                borderRadius: const BorderRadius.vertical(
                  top: Radius.circular(32),
                ),
              ),
              clipBehavior: Clip.antiAlias,
              child: EditProfilePage(worker: _worker!),
            ),
          ),
        ).then((result) {
          if (result == true && mounted) _loadData();
        });
      },
      child: Container(
        padding: EdgeInsets.all(Responsive.pad(context, 20)),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [AppPalette.ocean, AppPalette.oceanDeep],
          ),
          borderRadius: BorderRadius.circular(28),
          boxShadow: [
            BoxShadow(
              color: AppPalette.ocean.withValues(alpha: 0.28),
              blurRadius: 30,
              offset: const Offset(0, 14),
            ),
          ],
        ),
        child: Row(
          children: [
            Stack(
              children: [
                Container(
                  width: Responsive.pad(context, 88),
                  height: Responsive.pad(context, 88),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.16),
                    shape: BoxShape.circle,
                  ),
                  clipBehavior: Clip.antiAlias,
                  child:
                      _worker?['photo_url'] != null &&
                          (_worker!['photo_url'] as String).isNotEmpty
                      ? Transform.scale(
                          scale: 1.2,
                          child: Image.network(
                            _worker!['photo_url'],
                            fit: BoxFit.cover,
                            width: Responsive.pad(context, 88),
                            height: Responsive.pad(context, 88),
                            cacheWidth: 400,
                            cacheHeight: 440,
                            errorBuilder: (_, __, ___) => Center(
                              child: Text(
                                initials,
                                style: GoogleFonts.hankenGrotesk(
                                  fontSize: Responsive.sp(context, 30),
                                  fontWeight: FontWeight.w800,
                                  color: Colors.white,
                                ),
                              ),
                            ),
                          ),
                        )
                      : Center(
                          child: Text(
                            initials,
                            style: GoogleFonts.hankenGrotesk(
                              fontSize: Responsive.sp(context, 30),
                              fontWeight: FontWeight.w800,
                              color: Colors.white,
                            ),
                          ),
                        ),
                ),
                Positioned(
                  right: 0,
                  bottom: 0,
                  child: Container(
                    width: Responsive.pad(context, 18),
                    height: Responsive.pad(context, 18),
                    decoration: const BoxDecoration(
                      color: AppPalette.aqua,
                      shape: BoxShape.circle,
                    ),
                  ),
                ),
              ],
            ),
            SizedBox(width: Responsive.pad(context, 16)),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.hankenGrotesk(
                      fontSize: Responsive.sp(context, 22),
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
                    ),
                  ),
                  SizedBox(height: Responsive.pad(context, 3)),
                  Text(
                    role.isNotEmpty
                        ? role
                        : (_worker?['department'] ?? 'Employee'),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: Responsive.sp(context, 13.5),
                      fontWeight: FontWeight.w500,
                      color: Colors.white.withValues(alpha: 0.74),
                    ),
                  ),
                  SizedBox(height: Responsive.pad(context, 6)),
                  Row(
                    children: [
                      Icon(
                        TablerIcons.id_badge,
                        size: Responsive.sp(context, 13),
                        color: Colors.white.withValues(alpha: 0.55),
                      ),
                      SizedBox(width: Responsive.pad(context, 5)),
                      Text(
                        'ID #$loginId',
                        style: TextStyle(
                          fontSize: Responsive.sp(context, 11.5),
                          fontWeight: FontWeight.w500,
                          color: Colors.white.withValues(alpha: 0.55),
                        ),
                      ),
                    ],
                  ),
                  SizedBox(height: Responsive.pad(context, 12)),
                  _documentsTag(sc, onDark: true),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _documentsTag(ColorScheme sc, {bool onDark = false}) {
    final profile = _printProfile?['profile'] as Map<String, dynamic>?;
    const docKeys = [
      'aadhar_front_url',
      'aadhar_back_url',
      'pan_card_url',
      'bank_proof_url',
      'light_bill_url',
    ];
    final uploaded = profile == null
        ? 0
        : docKeys.where((k) {
            final v = profile[k];
            return v is String && v.isNotEmpty;
          }).length;
    // Source of truth is the worker's documents_submitted flag (set by HR);
    // fall back to any document URL present in the print-profile payload.
    final complete = _worker?['documents_submitted'] == true || uploaded > 0;
    final color = complete ? const Color(0xff0f7a5a) : const Color(0xFFba1a1a);
    final tagColor = onDark
        ? (complete ? AppPalette.aqua : const Color(0xFFFFB4AB))
        : color;
    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: Responsive.pad(context, 10),
        vertical: Responsive.pad(context, 5),
      ),
      decoration: BoxDecoration(
        color: onDark
            ? Colors.white.withValues(alpha: 0.14)
            : color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            complete ? TablerIcons.badge : TablerIcons.file_alert,
            size: Responsive.sp(context, 14),
            color: tagColor,
          ),
          const SizedBox(width: 6),
          Text(
            complete ? 'Documents: Submitted' : 'Documents: Missing',
            style: TextStyle(
              fontSize: Responsive.sp(context, 11.5),
              fontWeight: FontWeight.w700,
              color: onDark ? Colors.white : color,
            ),
          ),
        ],
      ),
    );
  }

  int get _lateGrace {
    final t = _salaryBreakdown?['lateThresholds'];
    if (t is Map && (t['grace'] as num?) != null)
      return (t['grace'] as num).toInt();
    final g = _salaryBreakdown?['lateGraceMinutes'];
    if (g is num) return g.toInt();
    return 180;
  }

  int get _lateHalf {
    final t = _salaryBreakdown?['lateThresholds'];
    if (t is Map && (t['half'] as num?) != null)
      return (t['half'] as num).toInt();
    return (240 * (_lateGrace / 180)).round();
  }

  int get _lateFull {
    final t = _salaryBreakdown?['lateThresholds'];
    if (t is Map && (t['full'] as num?) != null)
      return (t['full'] as num).toInt();
    return (480 * (_lateGrace / 180)).round();
  }

  // An unauthorized absence forfeits the month's grace: the grace is charged
  // up-front, so the tier ladder runs on (used + grace). Mirrors
  // backend/src/utils/latePolicy.js.
  bool get _graceForfeited => _selectedBreakdown?['graceForfeited'] == true;

  double get _lateEffectiveMinutes => _graceForfeited
      ? (_selectedLateMinutes + _lateGrace).toDouble()
      : _selectedLateMinutes.toDouble();

  double get _lateTier {
    final used = _lateEffectiveMinutes;
    if (used <= _lateGrace) return 0;
    if (used <= _lateHalf) return 1;
    if (used <= _lateFull) return 2;
    return 3;
  }

  Color get _lateTierColor {
    switch (_lateTier) {
      case 0:
        return const Color(0xff1f6b52);
      case 1:
        return const Color(0xFFe67e22);
      case 2:
        return const Color(0xFFd35400);
      case 3:
        return const Color(0xFFba1a1a);
      default:
        return const Color(0xFFc28228);
    }
  }

  String get _lateTierLabel {
    switch (_lateTier) {
      case 0:
        return 'No deduction';
      case 1:
        return 'Half-day deduction';
      case 2:
        return 'One-day deduction';
      case 3:
        return 'Proportional deduction';
      default:
        return '';
    }
  }

  String get _lateTierDesc {
    final used = _selectedLateMinutes;
    if (_graceForfeited) {
      return 'Unauthorized absence this month — the $_lateGrace min grace is charged up-front '
          '(eff = $used + $_lateGrace), then the normal tiers apply. An admin can roll it back from the admin app.';
    }
    switch (_lateTier) {
      case 0:
        return '$used min used — within the $_lateGrace min grace period. No expense deduction for lateness.';
      case 1:
        return '$used min used — exceeds grace limit. Half-day (0.5 day) will be deducted from expenses.';
      case 2:
        return '$used min used — exceeds half-day threshold. The $_lateGrace free minutes are charged too (added once): ($used + $_lateGrace) ÷ $_lateFull, rounded to the nearest half day.';
      case 3:
        return '$used min used — exceeds $_lateFull min. Proportional deduction (($used + $_lateGrace) ÷ $_lateFull, grace charged once), rounded to the nearest half day.';
      default:
        return '';
    }
  }

  bool get _joinedThisMonth {
    final created = _worker?['created_at'];
    if (created == null) return false;
    final dt = DateTime.tryParse(created.toString());
    if (dt == null) return false;
    return dt.year == _calYear && dt.month == _calMonth;
  }

  // New Sunday policy — a Sunday is voluntary and every eligible Sunday is paid
  // — applies from 2026-10-01. Keep in sync with backend/src/utils/sundayRules.js.
  static const String _sundayRulesFrom = '2026-10-01';

  bool get _newSundayRules {
    final key = '$_calYear-${_calMonth.toString().padLeft(2, '0')}-01';
    return key.compareTo(_sundayRulesFrom) >= 0;
  }

  static bool _isVoluntarySunday(String dateKey) {
    final day = dateKey.length >= 10 ? dateKey.substring(0, 10) : dateKey;
    if (day.compareTo(_sundayRulesFrom) < 0) return false;
    final dt = DateTime.tryParse(day);
    return dt != null && dt.weekday == DateTime.sunday;
  }

  int _lateMinutesForMonth(int ym) {
    var minutes = 0;
    _historyByDate.forEach((key, rec) {
      final dt = DateTime.tryParse(key);
      if (dt == null || dt.year * 100 + dt.month != ym) return;
      // A voluntary Sunday never carries late minutes.
      if (_isVoluntarySunday(key)) return;
      final lm = rec['late_minutes'];
      if (lm is num) minutes += lm.toInt();
    });
    return minutes;
  }

  int get _selectedLateMinutes {
    final v = _selectedBreakdown?['totalLateMinutes'];
    if (v is num) return v.toInt();
    final now = DateTime.now();
    if (_calYear == now.year && _calMonth == now.month) return _lateUsed;
    return _lateMinutesForMonth(_calYear * 100 + _calMonth);
  }

  // Latest run of working days that are all "late" (weekends have no rows,
  // leave rows are skipped). UI-only indicator — payroll maths is untouched.
  int get _continuousLateDays {
    final working =
        _statusByDate.entries
            .where(
              (e) =>
                  ['present', 'late', 'half-day', 'absent'].contains(e.value),
            )
            .toList()
          ..sort((a, b) => b.key.compareTo(a.key));
    var streak = 0;
    for (final e in working) {
      if (e.value == 'late') {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  }

  Widget _lateDeductionCard(
    AppColors colors,
    ColorScheme scheme,
    TextTheme tt,
  ) {
    return Padding(
      padding: EdgeInsets.symmetric(vertical: Responsive.pad(context, 4)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                TablerIcons.clock,
                size: Responsive.sp(context, 16),
                color: _lateTierColor,
              ),
              SizedBox(width: Responsive.pad(context, 8)),
              Text(
                'Late Deduction Status',
                style: GoogleFonts.hankenGrotesk(
                  fontSize: Responsive.sp(context, 16),
                  fontWeight: FontWeight.w600,
                  color: const Color(0xff0f2e4a),
                ),
              ),
              const Spacer(),
              Text(
                DateFormat('MMMM yyyy').format(DateTime(_calYear, _calMonth)),
                style: GoogleFonts.hankenGrotesk(
                  fontSize: Responsive.sp(context, 11),
                  fontWeight: FontWeight.w600,
                  color: const Color(0xff5e7e99),
                ),
              ),
            ],
          ),
          if (_continuousLateDays >= 3) ...[
            SizedBox(height: Responsive.pad(context, 12)),
            Container(
              width: double.infinity,
              padding: EdgeInsets.symmetric(
                horizontal: Responsive.pad(context, 10),
                vertical: Responsive.pad(context, 8),
              ),
              decoration: BoxDecoration(
                color: const Color(0xFFFFF3E0),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Row(
                children: [
                  Icon(
                    TablerIcons.alert_triangle,
                    size: Responsive.sp(context, 14),
                    color: const Color(0xFFB45309),
                  ),
                  SizedBox(width: Responsive.pad(context, 8)),
                  Expanded(
                    child: Text(
                      '$_continuousLateDays days continuous late - half day deducted',
                      style: TextStyle(
                        fontSize: Responsive.sp(context, 11.5),
                        fontWeight: FontWeight.w600,
                        color: const Color(0xFF8A4B08),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
          SizedBox(height: Responsive.pad(context, 14)),
          Row(
            children: [
              Container(
                padding: EdgeInsets.symmetric(
                  horizontal: Responsive.pad(context, 10),
                  vertical: Responsive.pad(context, 6),
                ),
                decoration: BoxDecoration(
                  color: _lateTierColor.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  '${_selectedLateMinutes} min',
                  style: GoogleFonts.hankenGrotesk(
                    fontSize: Responsive.sp(context, 24),
                    fontWeight: FontWeight.w800,
                    color: _lateTierColor,
                  ),
                ),
              ),
              SizedBox(width: Responsive.pad(context, 14)),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      padding: EdgeInsets.symmetric(
                        horizontal: Responsive.pad(context, 8),
                        vertical: Responsive.pad(context, 3),
                      ),
                      decoration: BoxDecoration(
                        color: _lateTierColor.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(3),
                      ),
                      child: Text(
                        _lateTierLabel,
                        style: TextStyle(
                          fontSize: Responsive.sp(context, 11),
                          fontWeight: FontWeight.w700,
                          color: _lateTierColor,
                        ),
                      ),
                    ),
                    SizedBox(height: Responsive.pad(context, 4)),
                    Text(
                      _lateTierDesc,
                      style: TextStyle(
                        fontSize: Responsive.sp(context, 11),
                        color: scheme.onSurfaceVariant,
                        height: 1.4,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          SizedBox(height: Responsive.pad(context, 12)),
          Container(
            padding: EdgeInsets.all(Responsive.pad(context, 12)),
            decoration: BoxDecoration(
              color: scheme.surface.withValues(alpha: 0.6),
              borderRadius: BorderRadius.circular(6),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Deduction rules',
                  style: TextStyle(
                    fontSize: Responsive.sp(context, 10),
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.05,
                    color: const Color(0xff5e7e99),
                  ),
                ),
                SizedBox(height: Responsive.pad(context, 6)),
                _ruleRow('0 – $_lateGrace min', 'No deduction', _lateTier == 0),
                _ruleRow(
                  '${_lateGrace + 1} – $_lateHalf min',
                  'Half-day deduction',
                  _lateTier == 1,
                ),
                _ruleRow(
                  '${_lateHalf + 1} – $_lateFull min',
                  'One-day deduction',
                  _lateTier == 2,
                ),
                _ruleRow(
                  '> $_lateFull min',
                  'Proportional deduction',
                  _lateTier == 3,
                ),
              ],
            ),
          ),
          if (_joinedThisMonth) ...[
            SizedBox(height: Responsive.pad(context, 10)),
            Container(
              padding: EdgeInsets.symmetric(
                horizontal: Responsive.pad(context, 10),
                vertical: Responsive.pad(context, 8),
              ),
              decoration: BoxDecoration(
                color: const Color(0xFFf3e8ff).withValues(alpha: 0.6),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Row(
                children: [
                  Icon(
                    TablerIcons.info_circle,
                    size: Responsive.sp(context, 14),
                    color: const Color(0xff2f7fb5),
                  ),
                  SizedBox(width: Responsive.pad(context, 8)),
                  Expanded(
                    child: Text(
                      'First month joining: 1.5 days deducted from expenses (new joiner policy).',
                      style: TextStyle(
                        fontSize: Responsive.sp(context, 11),
                        color: scheme.onSurfaceVariant,
                        height: 1.3,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _ruleRow(String range, String desc, bool active) {
    return Padding(
      padding: EdgeInsets.symmetric(vertical: Responsive.pad(context, 2)),
      child: Row(
        children: [
          Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(
              color: active ? const Color(0xff1f6b52) : const Color(0xffdceaf6),
              shape: BoxShape.circle,
            ),
          ),
          SizedBox(width: Responsive.pad(context, 8)),
          Text(
            range,
            style: TextStyle(
              fontSize: Responsive.sp(context, 11),
              fontWeight: FontWeight.w600,
              color: active ? const Color(0xff0f2e4a) : const Color(0xff5e7e99),
            ),
          ),
          SizedBox(width: Responsive.pad(context, 8)),
          Text(
            '→',
            style: TextStyle(
              fontSize: Responsive.sp(context, 11),
              color: const Color(0xffc2d8ea),
            ),
          ),
          SizedBox(width: Responsive.pad(context, 8)),
          Expanded(
            child: Text(
              desc,
              style: TextStyle(
                fontSize: Responsive.sp(context, 11),
                fontWeight: active ? FontWeight.w600 : FontWeight.w400,
                color: active
                    ? const Color(0xff0f2e4a)
                    : const Color(0xff5e7e99),
              ),
            ),
          ),
        ],
      ),
    );
  }

  String _fmtDays(num v) {
    if (v == v.roundToDouble()) return '${v.toInt()}';
    return v.toStringAsFixed(1);
  }

  num get _fallbackLateDeductionDays {
    final minutes = _selectedLateMinutes;
    if (_graceForfeited) {
      // Grace charged up-front (single budget — the clawback does NOT add it a
      // second time). Plain tier ladder on the effective total.
      final eff = minutes + _lateGrace;
      if (eff > _lateFull) return (((eff / _lateFull) * 2).roundToDouble()) / 2;
      if (eff > _lateHalf) return 1;
      if (eff > _lateGrace) return 0.5;
      return 0;
    }
    if (minutes <= _lateGrace) return 0;
    if (minutes <= _lateHalf) return 0.5;
    // Grace clawback (mirrors backend/src/utils/latePolicy.js): once the 1-day
    // tier is reached the grace is charged too, added exactly once.
    return (((minutes + _lateGrace) / _lateFull) * 2).roundToDouble() / 2;
  }

  Widget _summaryCardsGrid(AppColors colors, ColorScheme scheme) {
    final ym = _calYear * 100 + _calMonth;
    final monthStats = _monthlyStats[ym] ?? {};
    final bd = _selectedBreakdown;
    final hasBd =
        bd != null && bd['hasSalary'] == true && bd['records'] is List;
    final bdRecords = hasBd ? (bd['records'] as List) : const [];

    // Same values the HR salary sheet prints (computePaidDays output).
    final presentCount = hasBd
        ? bdRecords
              .where((r) => r['status'] == 'present' || r['status'] == 'late')
              .length
        : (monthStats['present'] ?? 0) + (monthStats['late'] ?? 0);
    // Approved leave is still an absence from work — the day is paid as neither
    // present nor worked — so it belongs in the Absence total. A leave date with
    // no attendance row is already fabricated as absent by payroll
    // (bd['absentCount']); only real `leave` rows are added here, so the two
    // never double-count.
    final leaveCount = hasBd
        ? bdRecords.where((r) => r['status'] == 'leave').length
        : (monthStats['leave'] ?? 0);
    final absentCount =
        (hasBd
            ? (((bd['absentCount'] as num?) ?? 0).toInt())
            : (monthStats['absent'] ?? 0)) +
        leaveCount;
    final halfDay = hasBd
        ? (((bd['halfDayCount'] as num?) ?? 0) * 0.5)
        : ((monthStats['half-day'] ?? 0) * 0.5);
    final lateDeduction = hasBd
        ? ((bd['lateDeductionDays'] as num?) ?? 0)
        : _fallbackLateDeductionDays;
    final sundayDeducted = hasBd
        ? ((bd['sundayDeductionDays'] as num?) ?? 0)
        : 0;
    final trainingDeduction = hasBd
        ? ((bd['joiningDeduction'] as num?) ?? 0)
        : (_joinedThisMonth ? 1.5 : 0);
    final netPaidDays = hasBd ? ((bd['finalPaidDays'] as num?) ?? 0) : null;

    final tiles = <Widget>[
      _summaryTile(
        'Present',
        '$presentCount',
        TablerIcons.calendar_check,
        const Color(0xff0f7a5a),
      ),
      _summaryTile(
        'Absence',
        '$absentCount',
        TablerIcons.calendar_x,
        const Color(0xFFba1a1a),
      ),
      _summaryTile(
        'Half-day',
        _fmtDays(halfDay),
        TablerIcons.sun,
        const Color(0xff174a7c),
      ),
      _summaryTile(
        'Late Deduction Days',
        _fmtDays(lateDeduction),
        TablerIcons.clock,
        const Color(0xFFc28228),
      ),
      _summaryTile(
        'Sunday Deducted',
        _fmtDays(sundayDeducted),
        TablerIcons.calendar_off,
        const Color(0xff174a7c),
      ),
      if (_joinedThisMonth || trainingDeduction > 0)
        _summaryTile(
          'Training Deduction',
          _fmtDays(trainingDeduction),
          TablerIcons.school,
          const Color(0xff2f7fb5),
        ),
      if (netPaidDays != null)
        _summaryTile(
          'Net Paid Days',
          _fmtDays(netPaidDays),
          TablerIcons.wallet,
          const Color(0xFF0f766e),
        ),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text(
              'My Attendance',
              style: GoogleFonts.hankenGrotesk(
                fontSize: Responsive.sp(context, 16),
                fontWeight: FontWeight.w600,
                color: scheme.onSurface,
              ),
            ),
            const Spacer(),
            Text(
              DateFormat('MMMM yyyy').format(DateTime(_calYear, _calMonth)),
              style: GoogleFonts.hankenGrotesk(
                fontSize: Responsive.sp(context, 11),
                fontWeight: FontWeight.w600,
                color: const Color(0xff5e7e99),
              ),
            ),
          ],
        ),
        SizedBox(height: Responsive.pad(context, 8)),
        Column(
          children: [
            for (var i = 0; i < tiles.length; i += 2)
              Padding(
                padding: EdgeInsets.only(
                  bottom: i + 2 < tiles.length ? Responsive.pad(context, 8) : 0,
                ),
                child: Row(
                  children: [
                    Expanded(child: tiles[i]),
                    SizedBox(width: Responsive.pad(context, 8)),
                    if (i + 1 < tiles.length)
                      Expanded(child: tiles[i + 1])
                    else
                      const Spacer(),
                  ],
                ),
              ),
          ],
        ),
      ],
    );
  }

  Widget _summaryTile(String label, String value, IconData icon, Color color) {
    return Padding(
      padding: EdgeInsets.symmetric(
        horizontal: Responsive.pad(context, 4),
        vertical: Responsive.pad(context, 7),
      ),
      child: Row(
        children: [
          Container(
            width: Responsive.sp(context, 34),
            height: Responsive.sp(context, 34),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.12),
              shape: BoxShape.circle,
            ),
            child: Icon(icon, size: Responsive.sp(context, 16), color: color),
          ),
          SizedBox(width: Responsive.pad(context, 9)),
          Expanded(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  value,
                  style: GoogleFonts.hankenGrotesk(
                    fontSize: Responsive.sp(context, 17),
                    fontWeight: FontWeight.w800,
                    color: color,
                  ),
                ),
                Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: Responsive.sp(context, 9.5),
                    fontWeight: FontWeight.w600,
                    color: AppPalette.muted,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _attendanceCalendar(
    double presentFrac,
    double absentFrac,
    double leaveFrac,
    double lateFrac,
    double rate,
    AppColors colors,
    ColorScheme scheme,
    TextTheme tt,
  ) {
    final now = DateTime.now();
    final minMonth = DateTime(now.year, now.month - 1);
    final atMinMonth = _calYear == minMonth.year && _calMonth == minMonth.month;
    final atCurrentMonth = _calYear == now.year && _calMonth == now.month;
    return Padding(
      padding: EdgeInsets.symmetric(vertical: Responsive.pad(context, 4)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Attendance Calendar',
                style: GoogleFonts.hankenGrotesk(
                  fontSize: Responsive.sp(context, 18),
                  fontWeight: FontWeight.w600,
                  color: scheme.onSurface,
                ),
              ),
            ],
          ),
          SizedBox(height: Responsive.pad(context, 16)),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Monthly Consistency',
                style: TextStyle(
                  fontSize: Responsive.sp(context, 12),
                  fontWeight: FontWeight.w600,
                  letterSpacing: 0.05,
                  color: const Color(0xff3f6487),
                ),
              ),
              Text(
                '${(rate * 100).round()}%',
                style: TextStyle(
                  fontSize: Responsive.sp(context, 12),
                  fontWeight: FontWeight.w600,
                  letterSpacing: 0.05,
                  color: const Color(0xff1f6b52),
                ),
              ),
            ],
          ),
          SizedBox(height: Responsive.pad(context, 8)),
          ConsistencyBar(
            presentFraction: presentFrac,
            absentFraction: absentFrac,
            leaveFraction: leaveFrac,
            lateFraction: lateFrac,
            height: 8,
          ),
          SizedBox(height: Responsive.pad(context, 20)),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              IconButton(
                icon: const Icon(TablerIcons.chevron_left, size: 18),
                style: IconButton.styleFrom(
                  backgroundColor: AppPalette.iceSoft,
                  foregroundColor: AppPalette.ocean,
                  disabledBackgroundColor: AppPalette.iceSoft.withValues(
                    alpha: 0.5,
                  ),
                  minimumSize: const Size(38, 38),
                ),
                tooltip: 'Previous month',
                onPressed: atMinMonth
                    ? null
                    : () {
                        setState(() {
                          if (_calMonth == 1) {
                            _calMonth = 12;
                            _calYear--;
                          } else {
                            _calMonth--;
                          }
                          _selectedDateKey = null;
                        });
                        _fetchCalendar(year: _calYear, month: _calMonth);
                        _fetchSalaryBreakdown(year: _calYear, month: _calMonth);
                      },
              ),
              Text(
                DateFormat('MMMM yyyy').format(DateTime(_calYear, _calMonth)),
                style: GoogleFonts.hankenGrotesk(
                  fontSize: Responsive.sp(context, 15),
                  fontWeight: FontWeight.w700,
                  color: scheme.onSurface,
                ),
              ),
              IconButton(
                icon: const Icon(TablerIcons.chevron_right, size: 18),
                style: IconButton.styleFrom(
                  backgroundColor: AppPalette.iceSoft,
                  foregroundColor: AppPalette.ocean,
                  disabledBackgroundColor: AppPalette.iceSoft.withValues(
                    alpha: 0.5,
                  ),
                  minimumSize: const Size(38, 38),
                ),
                tooltip: 'Next month',
                onPressed: atCurrentMonth
                    ? null
                    : () {
                        setState(() {
                          if (_calMonth == 12) {
                            _calMonth = 1;
                            _calYear++;
                          } else {
                            _calMonth++;
                          }
                          _selectedDateKey = null;
                        });
                        _fetchCalendar(year: _calYear, month: _calMonth);
                        _fetchSalaryBreakdown(year: _calYear, month: _calMonth);
                      },
              ),
            ],
          ),
          MiniCalendar(
            year: _calYear,
            month: _calMonth,
            statusByDate: _statusByDate,
            selectedDate: _selectedDateKey,
            calendarDates: _calendarDates,
            deductedSundays: _deductedSundayKeys(),
            forfeitedHolidays: _forfeitedHolidayKeys(),
            onDateSelected: _showDayDetailSheet,
          ),
          SizedBox(height: Responsive.pad(context, 16)),
          Wrap(
            spacing: 16,
            runSpacing: 8,
            children: [
              _legendDot('Present', const Color(0xffbcf7e5)),
              _legendDot('Absent', const Color(0xFFffdad6)),
              _legendDot('Leave', const Color(0xffd6eaf7)),
              _legendDot('Late', const Color(0xFFffddb8)),
              _legendDot('Half-day', const Color(0xFFF3E8FF)),
            ],
          ),
        ],
      ),
    );
  }

  void _confirmLogout() {
    final sc = Theme.of(context).colorScheme;
    showSpringDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
        backgroundColor: sc.surface,
        title: Text(
          'Logout',
          style: GoogleFonts.hankenGrotesk(
            fontSize: Responsive.sp(context, 20),
            fontWeight: FontWeight.w600,
            color: sc.onSurface,
          ),
        ),
        content: Text(
          'Are you sure you want to logout?',
          style: TextStyle(
            fontSize: Responsive.sp(context, 14),
            color: sc.onSurfaceVariant,
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text(
              'Cancel',
              style: TextStyle(
                fontWeight: FontWeight.w600,
                color: sc.onSurfaceVariant,
              ),
            ),
          ),
          TextButton(
            onPressed: () {
              Navigator.pop(ctx);
              widget.onLogout?.call();
            },
            child: Text(
              'Logout',
              style: TextStyle(fontWeight: FontWeight.w600, color: sc.error),
            ),
          ),
        ],
      ),
    );
  }

  Widget _loanStatusCard(AppColors colors, ColorScheme scheme, TextTheme tt) {
    final expanded = _expandedCards.contains('loan');
    final activeLoans = _loans
        .where((l) => l['status'] == 'approved' || l['status'] == 'pending')
        .toList();
    return Padding(
      padding: EdgeInsets.symmetric(vertical: Responsive.pad(context, 4)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          GestureDetector(
            onTap: () => setState(() {
              if (expanded) {
                _expandedCards.remove('loan');
              } else {
                _expandedCards.add('loan');
              }
            }),
            behavior: HitTestBehavior.opaque,
            child: Row(
              children: [
                Icon(
                  TablerIcons.wallet,
                  size: Responsive.sp(context, 18),
                  color: scheme.primary,
                ),
                SizedBox(width: Responsive.pad(context, 8)),
                Expanded(
                  child: Text(
                    'Loan Status',
                    style: GoogleFonts.hankenGrotesk(
                      fontSize: Responsive.sp(context, 18),
                      fontWeight: FontWeight.w600,
                      color: scheme.onSurface,
                    ),
                  ),
                ),
                if (activeLoans.isNotEmpty)
                  Container(
                    padding: EdgeInsets.symmetric(
                      horizontal: Responsive.pad(context, 6),
                      vertical: Responsive.pad(context, 2),
                    ),
                    decoration: BoxDecoration(
                      color: const Color(0xFFc28228).withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(18),
                    ),
                    child: Text(
                      '${activeLoans.length}',
                      style: TextStyle(
                        fontSize: Responsive.sp(context, 11),
                        fontWeight: FontWeight.w700,
                        color: const Color(0xFFc28228),
                      ),
                    ),
                  ),
                SizedBox(width: Responsive.pad(context, 8)),
                Icon(
                  expanded ? TablerIcons.chevron_up : TablerIcons.chevron_down,
                  size: Responsive.sp(context, 18),
                  color: scheme.onSurfaceVariant,
                ),
              ],
            ),
          ),
          if (expanded) ...[
            SizedBox(height: Responsive.pad(context, 16)),
            if (activeLoans.isEmpty)
              Padding(
                padding: EdgeInsets.symmetric(
                  vertical: Responsive.pad(context, 16),
                ),
                child: Center(
                  child: Text(
                    'No active loans',
                    style: TextStyle(
                      fontSize: Responsive.sp(context, 13),
                      color: scheme.onSurfaceVariant,
                    ),
                  ),
                ),
              )
            else
              ...activeLoans.take(3).map((l) => _loanItem(l, scheme, colors)),
            if (activeLoans.length > 3)
              Padding(
                padding: EdgeInsets.only(top: Responsive.pad(context, 8)),
                child: Center(
                  child: Text(
                    '+${activeLoans.length - 3} more',
                    style: TextStyle(
                      fontSize: Responsive.sp(context, 11),
                      color: scheme.onSurfaceVariant,
                    ),
                  ),
                ),
              ),
          ],
        ],
      ),
    );
  }

  Widget _loanItem(dynamic l, ColorScheme scheme, AppColors colors) {
    final status = l['status']?.toString() ?? 'pending';
    final total = l['total_amount'] ?? 0;
    final remaining = l['remaining_amount'] ?? total;
    final Color statusColor;
    final String statusLabel;
    switch (status) {
      case 'pending':
        statusColor = const Color(0xFFc28228);
        statusLabel = 'Pending';
        break;
      case 'approved':
        statusColor = const Color(0xff0f7a5a);
        statusLabel = 'Approved';
        break;
      case 'rejected':
        statusColor = const Color(0xFFba1a1a);
        statusLabel = 'Rejected';
        break;
      default:
        statusColor = scheme.onSurfaceVariant;
        statusLabel = status;
    }
    return Padding(
      padding: EdgeInsets.only(bottom: Responsive.pad(context, 12)),
      child: Container(
        padding: EdgeInsets.all(Responsive.pad(context, 12)),
        decoration: BoxDecoration(
          color: colors.surfaceContainerLowest,
          borderRadius: BorderRadius.circular(22),
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '\u20B9$total',
                    style: TextStyle(
                      fontSize: Responsive.sp(context, 14),
                      fontWeight: FontWeight.w700,
                      color: scheme.onSurface,
                    ),
                  ),
                  SizedBox(height: Responsive.pad(context, 2)),
                  if (status == 'approved')
                    Text(
                      '\u20B9$remaining remaining',
                      style: TextStyle(
                        fontSize: Responsive.sp(context, 11),
                        color: scheme.onSurfaceVariant,
                      ),
                    ),
                ],
              ),
            ),
            Container(
              padding: EdgeInsets.symmetric(
                horizontal: Responsive.pad(context, 8),
                vertical: Responsive.pad(context, 3),
              ),
              decoration: BoxDecoration(
                color: statusColor.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Text(
                statusLabel,
                style: TextStyle(
                  fontSize: Responsive.sp(context, 10),
                  fontWeight: FontWeight.w700,
                  color: statusColor,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _showDayDetailSheet(String key) {
    setState(() => _selectedDateKey = key);
    showSpringSheet(
      context: context,
      builder: (_) =>
          _DayDetailSheet(dateKey: key, detail: _historyByDate[key]),
    );
  }

  Widget _legendDot(String label, Color color) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 12,
          height: 12,
          decoration: BoxDecoration(
            color: color,
            borderRadius: BorderRadius.circular(3),
          ),
        ),
        SizedBox(width: Responsive.pad(context, 6)),
        Text(
          label,
          style: TextStyle(
            fontSize: Responsive.sp(context, 12),
            color: Theme.of(context).colorScheme.onSurfaceVariant,
          ),
        ),
      ],
    );
  }
}

class _DayDetailSheet extends StatelessWidget {
  final String dateKey;
  final Map<String, dynamic>? detail;

  const _DayDetailSheet({required this.dateKey, this.detail});

  String _fmtTime(dynamic ts) {
    if (ts == null) return '—';
    if (ts is DateTime) return DateFormat('hh:mm a').format(ts.toLocal());
    String s = ts.toString();
    if (!s.endsWith('Z') && !RegExp(r'[+-]\d{2}:\d{2}$').hasMatch(s)) s += 'Z';
    final t = DateTime.tryParse(s);
    if (t == null) return '—';
    return DateFormat('hh:mm a').format(t.toLocal());
  }

  (Color, String, IconData) _statusMeta(String status) {
    switch (status) {
      case 'present':
        return (AppPalette.aquaDeep, 'Present', TablerIcons.circle_check);
      case 'absent':
        return (const Color(0xFFB42318), 'Absent', TablerIcons.circle_x);
      case 'late':
        return (const Color(0xFFB45309), 'Late', TablerIcons.clock);
      case 'leave':
        return (AppPalette.ocean, 'Leave', TablerIcons.calendar_check);
      case 'half-day':
        return (const Color(0xFF7E22CE), 'Half Day', TablerIcons.sun);
      default:
        return (AppPalette.muted, 'No status', TablerIcons.circle);
    }
  }

  @override
  Widget build(BuildContext context) {
    final status = detail?['status']?.toString() ?? '';
    final (statusColor, statusLabel, statusIcon) = _statusMeta(status);
    final lateMinutes = detail?['late_minutes'];
    final dt = DateTime.tryParse(dateKey);
    final dateLabel = dt != null
        ? DateFormat('EEEE, d MMMM yyyy').format(dt)
        : dateKey;

    return SafeArea(
      top: false,
      child: Container(
        padding: EdgeInsets.fromLTRB(
          Responsive.pad(context, 20),
          Responsive.pad(context, 12),
          Responsive.pad(context, 20),
          Responsive.pad(context, 24),
        ),
        decoration: const BoxDecoration(
          color: AppPalette.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(32)),
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
                    color: statusColor.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(15),
                  ),
                  child: Icon(
                    statusIcon,
                    size: Responsive.sp(context, 22),
                    color: statusColor,
                  ),
                ),
                SizedBox(width: Responsive.pad(context, 12)),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        dateLabel,
                        style: GoogleFonts.hankenGrotesk(
                          fontSize: Responsive.sp(context, 16.5),
                          fontWeight: FontWeight.w700,
                          color: AppPalette.ink,
                        ),
                      ),
                      SizedBox(height: Responsive.pad(context, 3)),
                      Text(
                        detail == null ? 'No attendance record' : statusLabel,
                        style: TextStyle(
                          fontSize: Responsive.sp(context, 12),
                          fontWeight: FontWeight.w600,
                          color: detail == null
                              ? AppPalette.muted
                              : statusColor,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            SizedBox(height: Responsive.pad(context, 18)),
            if (detail == null)
              Container(
                padding: EdgeInsets.all(Responsive.pad(context, 16)),
                decoration: BoxDecoration(
                  color: AppPalette.iceSoft,
                  borderRadius: BorderRadius.circular(18),
                ),
                child: Row(
                  children: [
                    const Icon(
                      TablerIcons.calendar_off,
                      size: 20,
                      color: AppPalette.muted,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'No punch-in or punch-out was recorded for this day.',
                        style: TextStyle(
                          fontSize: Responsive.sp(context, 12.5),
                          color: AppPalette.muted,
                        ),
                      ),
                    ),
                  ],
                ),
              )
            else ...[
              Row(
                children: [
                  Expanded(
                    child: _timeBlock(
                      context,
                      'IN',
                      _fmtTime(detail!['punch_in_time']),
                      TablerIcons.login,
                      AppPalette.aquaDeep,
                    ),
                  ),
                  SizedBox(width: Responsive.pad(context, 12)),
                  Expanded(
                    child: _timeBlock(
                      context,
                      'OUT',
                      _fmtTime(detail!['punch_out_time']),
                      TablerIcons.logout,
                      AppPalette.ocean,
                    ),
                  ),
                ],
              ),
              if (lateMinutes is num && lateMinutes > 0) ...[
                SizedBox(height: Responsive.pad(context, 12)),
                Row(
                  children: [
                    const Icon(
                      TablerIcons.clock,
                      size: 15,
                      color: Color(0xFFB45309),
                    ),
                    const SizedBox(width: 6),
                    Text(
                      'Late by ${lateMinutes.toInt()} min',
                      style: TextStyle(
                        fontSize: Responsive.sp(context, 12),
                        fontWeight: FontWeight.w700,
                        color: const Color(0xFFB45309),
                      ),
                    ),
                  ],
                ),
              ],
            ],
          ],
        ),
      ),
    );
  }

  Widget _timeBlock(
    BuildContext context,
    String label,
    String value,
    IconData icon,
    Color color,
  ) {
    return Container(
      padding: EdgeInsets.all(Responsive.pad(context, 14)),
      decoration: BoxDecoration(
        color: AppPalette.iceSoft,
        borderRadius: BorderRadius.circular(18),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: Responsive.sp(context, 15), color: color),
              const SizedBox(width: 6),
              Text(
                label,
                style: TextStyle(
                  fontSize: Responsive.sp(context, 10.5),
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.6,
                  color: AppPalette.muted,
                ),
              ),
            ],
          ),
          SizedBox(height: Responsive.pad(context, 8)),
          Text(
            value,
            style: GoogleFonts.hankenGrotesk(
              fontSize: Responsive.sp(context, 19),
              fontWeight: FontWeight.w800,
              color: AppPalette.ink,
            ),
          ),
        ],
      ),
    );
  }
}
