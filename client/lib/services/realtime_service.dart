import 'package:flutter/foundation.dart';
import 'package:socket_io_client/socket_io_client.dart' as socket_io;
import '../config.dart';
import 'api_service.dart';

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

  socket_io.Socket? _socket;
  bool _initialized = false;
  String? _workerId;
  RealtimeEvent? _lastEvent;

  static const _tableEvents = <String, RealtimeEvent>{
    'attendance': RealtimeEvent.attendance,
    'leaves': RealtimeEvent.leaves,
    'loans': RealtimeEvent.loans,
    'notification_log': RealtimeEvent.notifications,
    'attendance_corrections': RealtimeEvent.corrections,
  };

  RealtimeEvent? get lastEvent => _lastEvent;
  bool get isConnected => _socket != null;

  Future<void> init(String workerId) async {
    if (_initialized && _workerId == workerId) return;
    _disconnect();
    _initialized = true;
    _workerId = workerId;

    final token = await ApiService.getToken();
    final socket = socket_io.io(
      Config.socketUrl,
      socket_io.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': token})
          .build(),
    );
    _socket = socket;

    socket.on('connect', (_) {
      _lastEvent = null;
      notifyListeners();
    });

    socket.on('db:change', (payload) {
      if (payload is! Map) return;
      final event = _tableEvents[payload['table']];
      if (event == null) return;
      final row = payload['new'] ?? payload['old'];
      if (row is Map) {
        final rowWorkerId = row['worker_id'];
        if (rowWorkerId != null && rowWorkerId.toString() != workerId) return;
      }
      _lastEvent = event;
      notifyListeners();
    });

    socket.on('connect_error', (data) {
      debugPrint('[realtime] connect_error: $data');
    });
  }

  void reset() {
    _disconnect();
    _lastEvent = null;
  }

  void _disconnect() {
    if (_socket != null) {
      _socket!.dispose();
      _socket = null;
    }
    _initialized = false;
    _workerId = null;
  }

  @override
  void dispose() {
    _disconnect();
    super.dispose();
  }
}
