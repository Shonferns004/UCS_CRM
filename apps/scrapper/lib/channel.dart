import 'dart:async';

import 'package:flutter/services.dart';

import 'api_config.dart';

const MethodChannel _channel = MethodChannel('com.ucs.scrapper/channel');

class ScrapperEvents {
  ScrapperEvents._();
  static final StreamController<Map<dynamic, dynamic>> _ctrl =
      StreamController<Map<dynamic, dynamic>>.broadcast();
  static Stream<Map<dynamic, dynamic>> get events => _ctrl.stream;
}

Future<void> initChannel() {
  _channel.setMethodCallHandler((call) async {
    if (call.method == 'onEvent' && call.arguments is Map) {
      ScrapperEvents._ctrl.add(Map<dynamic, dynamic>.from(call.arguments as Map));
    }
  });
  return Future.value();
}

Map<String, dynamic> _cfg(Map<dynamic, dynamic> map) =>
    map.map((k, v) => MapEntry(k.toString(), v));

Future<Map<String, dynamic>> getConfig() async {
  final r = await _channel.invokeMethod<Map>('getConfig');
  return _cfg(r?['config'] as Map<dynamic, dynamic>? ?? {});
}

Future<void> setConfig(Map<String, dynamic> cfg) async {
  await _channel.invokeMethod('setConfig', cfg);
}

Future<Map<String, dynamic>> getServiceState() async {
  final r = await _channel.invokeMethod<Map>('getServiceState');
  return _cfg(r ?? {});
}

Future<bool> openAccessibilitySettings() async {
  final r = await _channel.invokeMethod<bool>('openAccessibilitySettings');
  return r ?? false;
}

Future<Map<String, dynamic>> getOverlayState() async {
  final r = await _channel.invokeMethod<Map>('getOverlayState');
  return _cfg(r ?? {});
}

Future<Map<String, dynamic>> setOverlay(bool on) async {
  final r = await _channel.invokeMethod<Map>('setOverlay', on);
  return _cfg(r ?? {});
}

Future<void> setPaymentMethod(String m) async {
  await _channel.invokeMethod('setPaymentMethod', m);
}

Future<void> setOverlayOpacity(double value) async {
  await _channel.invokeMethod('setOverlayOpacity', value);
}

Future<Map<String, dynamic>> captureNow() async {
  final r = await _channel.invokeMethod<Map>('captureNow');
  return _cfg(r ?? {});
}

Future<Map<String, dynamic>> startRun() async {
  final r = await _channel.invokeMethod<Map>('start', {
    'backendUrl': kBackendUrl,
    'apiKey': kScraperKey,
  });
  return _cfg(r ?? {});
}

Future<void> stopRun() async {
  await _channel.invokeMethod('stop');
}

Future<void> setInspect(bool on) async {
  await _channel.invokeMethod('setInspect', on);
}

Future<List<String>> inspectNow() async {
  final r = await _channel.invokeMethod<Map>('inspectNow');
  return (r?['lines'] as List<dynamic>? ?? []).map((e) => e.toString()).toList();
}

Future<Map<String, dynamic>> startTraining() async {
  final r = await _channel.invokeMethod<Map>('trainStart');
  return _cfg(r ?? {});
}

Future<int> stopTraining() async {
  return await _channel.invokeMethod<int>('trainStop') ?? 0;
}

Future<Map<String, dynamic>> getTrainingState() async {
  final r = await _channel.invokeMethod<Map>('trainState');
  return _cfg(r ?? {});
}