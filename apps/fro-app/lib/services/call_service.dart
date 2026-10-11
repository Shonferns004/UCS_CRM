import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/models.dart';
import 'api_service.dart';

const int dispositionWindow = 240;
const int settleSeconds = 180;

class ActiveCall {
  final dynamic donorId;
  final String? donorName;
  final String? donorMobile;
  final DateTime startTime;
  ActiveCall({
    required this.donorId,
    this.donorName,
    this.donorMobile,
    required this.startTime,
  });
}

class TodayStats {
  final int calls;
  final int totalSeconds;
  const TodayStats({this.calls = 0, this.totalSeconds = 0});
  TodayStats copyWith({int? calls, int? totalSeconds}) => TodayStats(
        calls: calls ?? this.calls,
        totalSeconds: totalSeconds ?? this.totalSeconds,
      );
}

class CallService extends ChangeNotifier {
  ActiveCall? activeCall;
  int elapsed = 0;
  TodayStats todayStats = const TodayStats();
  String liveStatus = 'online';

  DateTime? dispositionDueAt;
  int? secondsLeft;
  bool isIdle = false;
  bool inShift = true;
  int? settleSecondsLeft;

  bool paused = false;
  String? pausedBy;

  bool _hydrated = false;

  DateTime? _meetingStart;
  DateTime? _pauseStart;
  int _callPausedMs = 0;

  int _serverSeconds = 0;
  DateTime? _serverSecondsAt;
  int _settleSeed = 0;
  DateTime? _settleSeedAt;

  bool _idleNotified = false;
  int _idleAskCount = 0;
  DateTime? _idleAskAt;
  int _settleAskCount = 0;
  DateTime? _settleAskAt;

  Timer? _tick;
  Timer? _callTimer;
  Timer? _dayRoll;
  bool _meetingActive = false;

  static const _settleConfirmMax = 4;
  static const _settleConfirmMs = Duration(milliseconds: 2500);
  static const _idleConfirmMax = 4;
  static const _idleConfirmMs = Duration(milliseconds: 2500);

  bool get isOnCall => activeCall != null;
  bool get meetingActive => _meetingActive;

  String? _timerKey;

  void init(String userId) {
    _timerKey = 'ucs_fro_timer_v1_$userId';
    _restoreTimer();
    _hydrate();
    _startTick();
    _startDayRoll();
  }

  @override
  void dispose() {
    _tick?.cancel();
    _callTimer?.cancel();
    _dayRoll?.cancel();
    super.dispose();
  }

  String fmt(int seconds) {
    final s = seconds < 0 ? 0 : seconds;
    final h = s ~/ 3600;
    final m = (s % 3600) ~/ 60;
    final sec = s % 60;
    final pad = (int v) => v.toString().padLeft(2, '0');
    if (h > 0) return '${pad(h)}:${pad(m)}:${pad(sec)}';
    return '${pad(m)}:${pad(sec)}';
  }

  void _startTick() {
    _tick?.cancel();
    _tick = Timer.periodic(const Duration(seconds: 1), (_) => _tickOnce());
  }

  void _tickOnce() {
    final now = DateTime.now();
    if (_settleSeedAt != null && settleSecondsLeft != null) {
      final elapsedS = now.difference(_settleSeedAt!).inSeconds;
      final left = (_settleSeed - elapsedS).clamp(0, settleSeconds);
      settleSecondsLeft = left;
      if (left == 0 && dispositionDueAt == null) {
        if (_settleAskCount == 0) {
          _settleAskCount = 1;
          _settleAskAt = now;
          syncAllStats();
        } else if (_settleAskCount < _settleConfirmMax &&
            _settleAskAt != null &&
            now.difference(_settleAskAt!) >= _settleConfirmMs) {
          _settleAskCount += 1;
          _settleAskAt = now;
          syncAllStats();
        }
      }
    }
    if (_serverSecondsAt != null) {
      final elapsedS = now.difference(_serverSecondsAt!).inSeconds;
      final left = (_serverSeconds - elapsedS).clamp(0, 1 << 30);
      secondsLeft = left;
      if (left == 0 &&
          !paused &&
          !_meetingActive &&
          !isIdle &&
          inShift) {
        if (!_idleNotified) {
          _idleNotified = true;
          _idleAskCount = 1;
          _idleAskAt = now;
          syncAllStats();
        } else if (_idleAskCount < _idleConfirmMax &&
            _idleAskAt != null &&
            now.difference(_idleAskAt!) >= _idleConfirmMs) {
          _idleAskCount += 1;
          _idleAskAt = now;
          syncAllStats();
        }
      }
    }
    notifyListeners();
  }

  void _startDayRoll() {
    _dayRoll?.cancel();
    _dayRoll = Timer.periodic(const Duration(seconds: 30), (_) {
      final day = _istDayKey(DateTime.now());
      if (day != _lastDay) {
        _lastDay = day;
        todayStats = const TodayStats();
        isIdle = false;
        _idleNotified = false;
        syncAllStats(extra: {'force_counters': true}, statsOverride: todayStats);
        notifyListeners();
      }
    });
  }

  String _lastDay = '';
  String _istDayKey(DateTime t) {
    final ist = t.add(const Duration(hours: 5, minutes: 30));
    final m = ist.month.toString().padLeft(2, '0');
    final d = ist.day.toString().padLeft(2, '0');
    return '${ist.year}-$m-$d';
  }

  void adoptTimer(Map<String, dynamic>? s) {
    if (s == null) return;
    if (s.containsKey('disposition_due_at')) {
      final next = s['disposition_due_at'];
      dispositionDueAt =
          next == null ? null : DateTime.tryParse(next.toString());
      if (next == null) {
        _serverSecondsAt = null;
        secondsLeft = null;
      }
    }
    final sl = s['seconds_left'];
    if (sl is num) {
      _serverSeconds = sl.toInt();
      _serverSecondsAt = DateTime.now();
      secondsLeft = _serverSeconds;
      if (_serverSeconds > 0) {
        _idleNotified = false;
        _idleAskCount = 0;
        _idleAskAt = null;
      }
    } else if (sl == null) {
      _serverSecondsAt = null;
      secondsLeft = null;
    }
    final ss = s['settle_seconds_left'];
    if (ss is num) {
      _settleSeed = ss.toInt();
      _settleSeedAt = DateTime.now();
      settleSecondsLeft = _settleSeed;
      if (_settleSeed > 0) {
        _settleAskCount = 0;
        _settleAskAt = null;
      }
    } else if (ss == null) {
      _settleSeedAt = null;
      settleSecondsLeft = null;
    }
    final shift = s['in_shift'];
    if (shift is bool) inShift = shift;
    final idle = s['is_idle'];
    if (idle is bool) isIdle = idle;
    _persistTimer();
    notifyListeners();
  }

  void adoptOptimisticDisposition() {
    adoptTimer({
      'disposition_due_at':
          DateTime.now().add(const Duration(seconds: dispositionWindow)).toIso8601String(),
      'seconds_left': dispositionWindow,
      'is_idle': false,
    });
  }

  void noteDispositionSaved() {}

  void emitTimeEvent(String event) {
    ApiService.post('/fro/status/time-event', body: {'event': event})
        .then((res) {
      if (res is Map<String, dynamic>) adoptTimer(res);
    }).catchError((_) {});
  }

  void syncAllStats({Map<String, dynamic>? extra, TodayStats? statsOverride}) {
    final stats = statsOverride ?? todayStats;
    final status = (_meetingActive || paused)
        ? 'meeting'
        : (activeCall != null ? 'on_call' : 'online');
    liveStatus = status;
    final body = <String, dynamic>{
      'status': status,
      'current_donor_name': activeCall?.donorName,
      'current_donor_id': activeCall?.donorId?.toString(),
    };
    if (_hydrated || statsOverride != null) {
      body['today_calls'] = stats.calls;
      body['today_talk_seconds'] = stats.totalSeconds;
    }
    if (extra != null) body.addAll(extra);
    ApiService.put('/fro/status', body: body).then((res) {
      if (res is Map<String, dynamic>) {
        adoptTimer(res);
        if (res['status'] != null) liveStatus = res['status'].toString();
      }
      notifyListeners();
    }).catchError((_) {});
  }

  void commitTodayStats(TodayStats next,
      {Map<String, dynamic>? extra, TodayStats? statsOverride}) {
    todayStats = next;
    syncAllStats(extra: extra, statsOverride: statsOverride ?? next);
    notifyListeners();
  }

  void _hydrate() async {
    try {
      final live = await ApiService.get('/fro/status/me');
      if (live is Map<String, dynamic>) {
        final updatedAt = live['updated_at']?.toString();
        if (updatedAt != null) {
          final serverDay = _istDayKey(
              DateTime.tryParse(updatedAt) ?? DateTime.now());
          if (serverDay == _istDayKey(DateTime.now())) {
            todayStats = TodayStats(
              calls: (live['today_calls'] as num?)?.toInt() ?? 0,
              totalSeconds: (live['today_talk_seconds'] as num?)?.toInt() ?? 0,
            );
            if (live['is_paused'] == true) {
              paused = true;
              pausedBy = live['paused_by']?.toString();
            }
          }
        }
        adoptTimer(live);
        if (live['status'] != null) liveStatus = live['status'].toString();
      }
    } catch (_) {
    } finally {
      _hydrated = true;
      syncAllStats();
      notifyListeners();
    }
  }

  void setMeetingActive(bool active) {
    if (active == _meetingActive) return;
    _meetingActive = active;
    if (active) {
      _meetingStart = DateTime.now();
      emitTimeEvent('MEETING_START');
      syncAllStats();
    } else {
      if (_meetingStart != null) {
        _callPausedMs += DateTime.now().difference(_meetingStart!).inMilliseconds;
        _meetingStart = null;
      }
      emitTimeEvent('MEETING_END');
      syncAllStats();
    }
    notifyListeners();
  }

  void applyPause(String? by) {
    if (paused) {
      if (by != null) pausedBy = by;
      notifyListeners();
      return;
    }
    paused = true;
    pausedBy = by;
    _pauseStart ??= DateTime.now();
    emitTimeEvent('PAUSE_START');
    syncAllStats();
    notifyListeners();
  }

  void clearPause() {
    if (!paused) return;
    paused = false;
    pausedBy = null;
    if (_pauseStart != null) {
      _callPausedMs += DateTime.now().difference(_pauseStart!).inMilliseconds;
      _pauseStart = null;
    }
    emitTimeEvent('PAUSE_END');
    syncAllStats();
    notifyListeners();
  }

  Future<void> resumeSelf() async {
    await ApiService.post('/fro/status/resume-self', body: {});
    clearPause();
  }

  void startCall(Donor donor) {
    _callPausedMs = 0;
    activeCall = ActiveCall(
      donorId: donor.id,
      donorName: donor.donorName,
      donorMobile: donor.donorMobile,
      startTime: DateTime.now(),
    );
    elapsed = 0;
    _startCallTimer();
    syncAllStats();
    notifyListeners();
  }

  void endCall() {
    final call = activeCall;
    if (call != null) {
      activeCall = null;
      final now = DateTime.now();
      int pausedMs = _callPausedMs;
      if (_meetingStart != null) {
        pausedMs += now.difference(_meetingStart!).inMilliseconds;
      }
      if (_pauseStart != null) {
        pausedMs += now.difference(_pauseStart!).inMilliseconds;
      }
      final duration =
          ((now.difference(call.startTime).inMilliseconds - pausedMs) / 1000)
              .floor();
      _callPausedMs = 0;
      if (duration > 0) {
        commitTodayStats(TodayStats(
          calls: todayStats.calls + 1,
          totalSeconds: todayStats.totalSeconds + duration,
        ));
      }
    }
    activeCall = null;
    elapsed = 0;
    _callTimer?.cancel();
    _callTimer = null;
    syncAllStats();
    notifyListeners();
  }

  void _startCallTimer() {
    _callTimer?.cancel();
    _callTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      final call = activeCall;
      if (call == null) return;
      final now = DateTime.now();
      int pausedMs = _callPausedMs;
      if (_meetingStart != null) {
        pausedMs += now.difference(_meetingStart!).inMilliseconds;
      }
      if (_pauseStart != null) {
        pausedMs += now.difference(_pauseStart!).inMilliseconds;
      }
      elapsed =
          ((now.difference(call.startTime).inMilliseconds - pausedMs) / 1000)
              .floor()
              .clamp(0, 1 << 30);
      notifyListeners();
    });
  }

  void forceOffline() {
    ApiService.put('/fro/status', body: {'status': 'offline'}).catchError((_) {});
  }

  Future<void> markOffline() async {
    try {
      await ApiService.put('/fro/status', body: {'status': 'offline'});
    } catch (_) {}
  }

  void _persistTimer() {
    if (_timerKey == null) return;
    SharedPreferences.getInstance().then((prefs) {
      prefs.setString(_timerKey!, jsonEncode({
        'disposition_due_at': dispositionDueAt?.toIso8601String(),
        'seconds_left': secondsLeft,
        'is_idle': isIdle,
        'saved_at': DateTime.now().millisecondsSinceEpoch,
      }));
    }).catchError((_) {});
  }

  void _restoreTimer() {
    if (_timerKey == null) return;
    SharedPreferences.getInstance().then((prefs) {
      final raw = prefs.getString(_timerKey!);
      if (raw == null) return;
      try {
        final saved = jsonDecode(raw) as Map<String, dynamic>;
        final savedAtMs = (saved['saved_at'] as num?)?.toInt() ?? 0;
        final savedDay = _istDayKey(
            DateTime.fromMillisecondsSinceEpoch(savedAtMs));
        if (savedDay != _istDayKey(DateTime.now())) return;
        final gap = ((DateTime.now().millisecondsSinceEpoch - savedAtMs) / 1000)
            .floor()
            .clamp(0, 1 << 30);
        if (saved['disposition_due_at'] != null) {
          dispositionDueAt =
              DateTime.tryParse(saved['disposition_due_at'].toString());
        }
        if (saved['is_idle'] == true) isIdle = true;
        final sl = saved['seconds_left'];
        if (sl is num) {
          final restored = (sl.toInt() - gap).clamp(0, 1 << 30);
          _serverSeconds = restored;
          _serverSecondsAt = DateTime.now();
          secondsLeft = restored;
        }
        notifyListeners();
      } catch (_) {}
    }).catchError((_) {});
  }
}
