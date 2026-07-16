import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'supabase_service.dart';

enum RealtimeEvent {
  attendance,
  leaves,
  loans,
  notifications,
  corrections,
}

class RealtimeService extends ChangeNotifier {
  RealtimeService._();
  static final RealtimeService instance = RealtimeService._();

  RealtimeChannel? _channel;
  bool _initialized = false;
  String? _workerId;
  RealtimeEvent? _lastEvent;

  RealtimeEvent? get lastEvent => _lastEvent;
  bool get isConnected => _channel != null;

  void init(String workerId) {
    if (_initialized && _workerId == workerId) return;
    dispose();
    _initialized = true;
    _workerId = workerId;

    _channel = SupabaseService.client.channel('live_$workerId');

    final tables = {
      'attendance': RealtimeEvent.attendance,
      'leaves': RealtimeEvent.leaves,
      'loans': RealtimeEvent.loans,
      'notifications': RealtimeEvent.notifications,
      'attendance_corrections': RealtimeEvent.corrections,
    };

    for (final entry in tables.entries) {
      _channel!.onPostgresChanges(
        event: PostgresChangeEvent.all,
        schema: 'public',
        table: entry.key,
        filter: PostgresChangeFilter(
          type: PostgresChangeFilterType.eq,
          column: 'worker_id',
          value: workerId,
        ),
        callback: (_) {
          _lastEvent = entry.value;
          notifyListeners();
        },
      );
    }

    _channel!.subscribe();
  }

  void reset() {
    dispose();
    _lastEvent = null;
  }

  @override
  void dispose() {
    if (_channel != null) {
      SupabaseService.client.removeChannel(_channel!);
      _channel = null;
    }
    _initialized = false;
    _workerId = null;
    super.dispose();
  }
}
