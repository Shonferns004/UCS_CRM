import 'dart:async';

/// Placeholder port scanner for platforms without `dart:io` (e.g. web).
Future<List<int>> scanOpenTcpPorts(
  String host, {
  int concurrency = 128,
  Duration connectTimeout = const Duration(milliseconds: 500),
  FutureOr<bool> Function(int port)? onOpen,
}) async {
  return const [];
}