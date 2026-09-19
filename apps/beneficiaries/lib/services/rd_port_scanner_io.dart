import 'dart:async';
import 'dart:io';

/// Scans TCP ports 1-65535 on [host] and reports ports that accept
/// connections. On loopback/device-IP hosts closed ports refuse quickly,
/// so the full range completes acceptably even at modest concurrency.
///
/// [onOpen] is invoked for each open port; returning `true` stops the scan
/// early. Returns the open ports in discovery order (not necessarily sorted).
Future<List<int>> scanOpenTcpPorts(
  String host, {
  int concurrency = 512,
  Duration connectTimeout = const Duration(milliseconds: 60),
  FutureOr<bool> Function(int port)? onOpen,
}) async {
  final results = <int>[];
  var nextPort = 1;
  var stopped = false;

  Future<void> worker() async {
    while (!stopped) {
      final port = nextPort++;
      if (port > 65535) return;
      try {
        final socket = await Socket.connect(
          host,
          port,
          timeout: connectTimeout,
        );
        socket.destroy();
        if (stopped) return;
        if (onOpen != null) {
          if (await onOpen(port)) {
            stopped = true;
            return;
          }
        }
      } catch (_) {}
    }
  }

  await Future.wait(
    List.generate(concurrency, (_) => worker()),
  );
  return results;
}