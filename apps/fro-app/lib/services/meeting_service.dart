import 'dart:async';

import 'package:flutter/foundation.dart';

import 'api_service.dart';
import 'call_service.dart';

class MeetingService extends ChangeNotifier {
  Map<String, dynamic>? meeting;
  Timer? _timer;
  bool _inflight = false;
  final CallService callService;

  MeetingService(this.callService);

  bool get active => meeting != null && meeting!['active'] == true;

  void start() {
    refresh();
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(seconds: 12), (_) => refresh());
  }

  void stop() {
    _timer?.cancel();
    _timer = null;
  }

  Future<void> refresh() async {
    if (_inflight) return;
    _inflight = true;
    try {
      final r = await ApiService.get('/meeting');
      final next = (r is Map<String, dynamic> && r['active'] == true)
          ? r
          : null;
      final changed = (next?['id']?.toString()) != (meeting?['id']?.toString()) ||
          (next != null) != (meeting != null);
      if (changed) {
        meeting = next;
        callService.setMeetingActive(active);
        notifyListeners();
      }
    } catch (_) {
    } finally {
      _inflight = false;
    }
  }
}
