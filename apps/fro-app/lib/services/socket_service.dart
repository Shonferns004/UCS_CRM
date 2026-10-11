import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import '../config.dart';
import 'api_service.dart';

typedef SocketHandler = void Function(Map<String, dynamic>? payload);

class SocketService extends ChangeNotifier {
  io.Socket? _socket;
  bool connected = false;

  final _listeners = <String, List<SocketHandler>>{};

  Future<void> connect() async {
    if (_socket != null) return;
    String? token;
    try {
      token = await ApiService.getToken();
    } catch (_) {}
    _socket = io.io(
      Config.socketUrl,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .enableAutoConnect()
          .enableReconnection()
          .setReconnectionAttempts(1 << 30)
          .setReconnectionDelay(2000)
          .setReconnectionDelayMax(10000)
          .setAuth({'token': token})
          .build(),
    );
    _socket!.onConnect((_) {
      connected = true;
      notifyListeners();
      _emitLocal('connect', null);
    });
    _socket!.onDisconnect((_) {
      connected = false;
      notifyListeners();
    });
    for (final evt in [
      'db:change',
      'fro:action',
      'fro:broadcast',
      'fro:team-broadcast',
      'fro:force-logout',
      'fro:pause',
      'fro:resume',
    ]) {
      _socket!.on(evt, (data) {
        Map<String, dynamic>? payload;
        if (data is Map) {
          payload = data.map((k, v) => MapEntry(k.toString(), v));
        }
        _emitLocal(evt, payload);
      });
    }
  }

  void disconnect() {
    _socket?.dispose();
    _socket = null;
    connected = false;
    notifyListeners();
  }

  void on(String event, SocketHandler handler) {
    _listeners.putIfAbsent(event, () => []).add(handler);
  }

  void off(String event, SocketHandler handler) {
    _listeners[event]?.remove(handler);
  }

  void _emitLocal(String event, Map<String, dynamic>? payload) {
    final hs = _listeners[event];
    if (hs == null) return;
    for (final h in List<SocketHandler>.of(hs)) {
      try {
        h(payload);
      } catch (_) {}
    }
  }

  void onDbChange({
    required String table,
    String event = '*',
    bool Function(Map<String, dynamic> payload)? filter,
    void Function(Map<String, dynamic>? row)? onInsert,
    void Function(Map<String, dynamic>? row, Map<String, dynamic>? old)? onUpdate,
    void Function(Map<String, dynamic>? old)? onDelete,
  }) {
    on('db:change', (payload) {
      if (payload == null) return;
      if (payload['table']?.toString() != table) return;
      final evt = payload['eventType']?.toString() ?? '';
      if (event != '*' && event != evt) return;
      final p = payload;
      if (filter != null && !filter(p)) return;
      final newRow = p['new'] is Map
          ? (p['new'] as Map).map((k, v) => MapEntry(k.toString(), v))
          : null;
      final oldRow = p['old'] is Map
          ? (p['old'] as Map).map((k, v) => MapEntry(k.toString(), v))
          : null;
      if (evt == 'INSERT' && onInsert != null) onInsert(newRow);
      if (evt == 'UPDATE' && onUpdate != null) onUpdate(newRow, oldRow);
      if (evt == 'DELETE' && onDelete != null) onDelete(oldRow);
    });
  }

  void onConnect(void Function() handler) {
    on('connect', (_) => handler());
  }

  void onFroPause(SocketHandler handler) => on('fro:pause', handler);
  void onFroResume(SocketHandler handler) => on('fro:resume', handler);
  void onFroForceLogout(SocketHandler handler) =>
      on('fro:force-logout', handler);
  void onFroBroadcast(SocketHandler handler) => on('fro:broadcast', handler);
  void onFroTeamBroadcast(SocketHandler handler) =>
      on('fro:team-broadcast', handler);
}
