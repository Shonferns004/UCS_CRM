import 'dart:async';
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
  codes,
  absenceProofs,
}

class RealtimeService extends ChangeNotifier {
  RealtimeService._();
  static final RealtimeService instance = RealtimeService._();

  socket_io.Socket? _socket;
  bool _initialized = false;
  String? _workerId;
  bool _isAdmin = false;
  RealtimeEvent? _lastEvent;

  static const _tableEvents = <String, RealtimeEvent>{
    'attendance': RealtimeEvent.attendance,
    'leaves': RealtimeEvent.leaves,
    'worker_loans': RealtimeEvent.loans,
    'notification_log': RealtimeEvent.notifications,
    'attendance_corrections': RealtimeEvent.corrections,
    'impersonation_codes': RealtimeEvent.codes,
    'absence_proofs': RealtimeEvent.absenceProofs,
  };

  RealtimeEvent? get lastEvent => _lastEvent;
  bool get isConnected => _socket?.connected == true;

  // Coalesce bursts of db:change events (e.g. bulk imports emit one per row)
  // so every page listener doesn't trigger its own `_load()` per row.
  Timer? _debounce;
  RealtimeEvent? _pendingEvent;

  Future<void> init(String workerId, {bool isAdmin = false}) async {
    if (_initialized && _workerId == workerId && _isAdmin == isAdmin) return;
    _disconnect();
    _initialized = true;
    _workerId = workerId;
    _isAdmin = isAdmin;

    final token = await ApiService.getToken();
    final socket = socket_io.io(
      _normalizedSocketUrl(Config.socketUrl),
      socket_io.OptionBuilder().setTransports(['websocket']).setAuth({
        'token': token,
      }).build(),
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
      if (row is Map && !_isAdmin) {
        if (event == RealtimeEvent.codes) {
          // impersonation_codes use created_by, not worker_id — let all workers through
        } else {
          final rowWorkerId = row['worker_id'];
          if (rowWorkerId != null && rowWorkerId.toString() != workerId) return;
        }
      }
      _pendingEvent = event;
      _debounce?.cancel();
      _debounce = Timer(const Duration(milliseconds: 500), () {
        _lastEvent = _pendingEvent;
        _pendingEvent = null;
        notifyListeners();
      });
    });

    socket.on('connect_error', (data) {
      debugPrint('[realtime] connect_error: $data');
    });
  }

  // Some builds/remote configs have produced a Socket.IO URL with an explicit
  // ":0" port (Uri.port == 0 when a port was not specified on older client
  // versions). Hand the client a clean origin (and no /api suffix) so the
  // handshake goes to https://host/socket.io/ instead of https://host:0/.
  String _normalizedSocketUrl(String raw) {
    final value = raw.trim();
    if (value.isEmpty) return value;
    final uri = Uri.tryParse(value);
    if (uri == null || uri.host.isEmpty) return value;
    var path = uri.path;
    if (path.endsWith('/api')) {
      path = path.substring(0, path.length - 4);
    }
    final port = uri.hasPort && uri.port != 0 ? uri.port : null;
    return Uri(
      scheme: uri.scheme,
      userInfo: uri.userInfo,
      host: uri.host,
      port: port,
      path: path,
      query: uri.query,
    ).toString();
  }

  void reset() {
    _disconnect();
    _lastEvent = null;
  }

  void _disconnect() {
    _debounce?.cancel();
    _debounce = null;
    _pendingEvent = null;
    if (_socket != null) {
      _socket!.dispose();
      _socket = null;
    }
    _initialized = false;
    _workerId = null;
    _isAdmin = false;
  }

  @override
  void dispose() {
    _disconnect();
    super.dispose();
  }
}
