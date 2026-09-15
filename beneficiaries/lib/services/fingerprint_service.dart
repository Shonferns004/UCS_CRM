import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'rd_http_client.dart';

/// Supported biometric device families
enum BiometricDeviceType {
  mantraMFS100,
  mantraMFS110,
  morphoMSO1300,
  startekFM2200,
  acplFM2200,
  secugen,
  precision,
  zkteco,
  generic,
}

class DeviceInfo {
  final BiometricDeviceType type;
  final String displayName;
  final String packageName;
  final String rdServicePackage;
  final bool isAvailable;

  const DeviceInfo({
    required this.type,
    required this.displayName,
    required this.packageName,
    required this.rdServicePackage,
    this.isAvailable = false,
  });

  factory DeviceInfo.fromMap(Map<String, dynamic> map) {
    return DeviceInfo(
      type: _parseType(map['type'] ?? 'generic'),
      displayName: map['display_name'] ?? 'Unknown Device',
      packageName: map['package_name'] ?? '',
      rdServicePackage: map['rd_service_package'] ?? '',
      isAvailable: map['is_available'] ?? false,
    );
  }

  static BiometricDeviceType _parseType(String type) {
    return BiometricDeviceType.values.firstWhere(
      (e) => e.name == type,
      orElse: () => BiometricDeviceType.generic,
    );
  }
}

class CaptureResult {
  final String pidData;
  final String fidData;
  final String qualityScore;
  final String template;
  final String deviceInfo;
  final String timestamp;
  final bool success;
  final String? error;

  const CaptureResult({
    required this.pidData,
    required this.fidData,
    required this.qualityScore,
    required this.template,
    required this.deviceInfo,
    required this.timestamp,
    this.success = true,
    this.error,
  });

  factory CaptureResult.fromMap(Map<String, dynamic> map) {
    return CaptureResult(
      pidData: map['pid_data'] ?? '',
      fidData: map['fid_data'] ?? '',
      qualityScore: map['quality_score'] ?? '0',
      template: map['template'] ?? '',
      deviceInfo: map['device_info'] ?? '',
      timestamp: map['timestamp'] ?? '',
      success: map['success'] ?? false,
      error: map['error'],
    );
  }

  CaptureResult copyWithError(String error) {
    return CaptureResult(
      pidData: pidData,
      fidData: fidData,
      qualityScore: qualityScore,
      template: template,
      deviceInfo: deviceInfo,
      timestamp: timestamp,
      success: false,
      error: error,
    );
  }
}

class FingerprintService {
  static const MethodChannel _channel = MethodChannel(
    'com.beingsevak.biometric',
  );
  static StreamSubscription? _eventSubscription;
  static final StreamController<Map<String, dynamic>> _eventController =
      StreamController<Map<String, dynamic>>.broadcast();

  /// Stream of events from the native side (device connect/disconnect, capture progress)
  static Stream<Map<String, dynamic>> get onEvent => _eventController.stream;

  /// Initialize the biometric plugin and listen for device events
  static Future<void> initialize() async {
    if (kIsWeb ||
        defaultTargetPlatform == TargetPlatform.windows ||
        defaultTargetPlatform == TargetPlatform.android) {
      return;
    }
    _eventSubscription?.cancel();
    _eventSubscription = const EventChannel('com.beingsevak.biometric/events')
        .receiveBroadcastStream()
        .listen((event) {
          if (event is Map) {
            _eventController.add(Map<String, dynamic>.from(event));
          }
        });
  }

  /// Dispose resources
  static void dispose() {
    _eventSubscription?.cancel();
    _eventSubscription = null;
  }

  /// Detect which biometric devices are currently connected/available
  static Future<List<DeviceInfo>> detectDevices() async {
    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.windows) {
      final service = await _findRdService();
      if (service != null) {
        return [
          const DeviceInfo(
            type: BiometricDeviceType.mantraMFS110,
            displayName: 'Mantra MFS110 RD Service',
            packageName: 'Mantra MFS110 AVDM',
            rdServicePackage: 'http://127.0.0.1:11100-11120',
            isAvailable: true,
          ),
        ];
      }
      return [];
    }
    try {
      final result = await _channel.invokeMethod<List>('detectDevices');
      if (result == null) return [];
      return result
          .map((e) => DeviceInfo.fromMap(Map<String, dynamic>.from(e)))
          .toList();
    } catch (e) {
      return [];
    }
  }

  /// Get the default (first available) device
  static Future<DeviceInfo?> getDefaultDevice() async {
    final devices = await detectDevices();
    if (devices.isEmpty) return null;
    return devices.firstWhere(
      (d) => d.isAvailable,
      orElse: () => devices.first,
    );
  }

  /// Initialize the RD Service for a specific device type
  /// Returns true if initialization succeeded
  static Future<bool> initializeDevice(BiometricDeviceType deviceType) async {
    try {
      final result = await _channel.invokeMethod('initializeDevice', {
        'device_type': deviceType.name,
      });
      return result == true;
    } catch (e) {
      return false;
    }
  }

  /// Capture a fingerprint using the specified or auto-detected device
  /// Returns the capture result with PID/FID data
  static Future<CaptureResult> capture({
    BiometricDeviceType? deviceType,
    int timeoutSeconds = 30,
  }) async {
    if (!kIsWeb &&
        (defaultTargetPlatform == TargetPlatform.windows ||
            defaultTargetPlatform == TargetPlatform.android)) {
      return captureViaRdService(timeoutSeconds: timeoutSeconds);
    }
    try {
      final result = await _channel.invokeMethod('capture', {
        'device_type': deviceType?.name,
        'timeout_seconds': timeoutSeconds,
      });
      return CaptureResult.fromMap(Map<String, dynamic>.from(result));
    } catch (e) {
      return const CaptureResult(
        pidData: '',
        fidData: '',
        qualityScore: '0',
        template: '',
        deviceInfo: '',
        timestamp: '',
        success: false,
      ).copyWithError(e.toString());
    }
  }

  /// Capture through the Mantra Windows RD Service installed by the vendor.
  /// The service listens on one of the local ports 11100-11120 and exposes
  /// the standard RDSERVICE, DEVICEINFO and CAPTURE methods.
  static Future<CaptureResult> captureViaRdService({
    int timeoutSeconds = 30,
  }) async {
    final service = await _findRdService();
    final serviceUri = service?['uri'] as Uri?;
    final capturePath = service?['capturePath'] as String?;
    if (serviceUri == null) {
      return const CaptureResult(
        pidData: '',
        fidData: '',
        qualityScore: '0',
        template: '',
        deviceInfo: '',
        timestamp: '',
        success: false,
        error: 'Mantra RD Service was not found on ports 11100-11120',
      );
    }

    final client = createRdClient(
      allowSelfSigned: serviceUri.scheme == 'https',
    );
    try {
      final options =
          '''<?xml version="1.0"?>
<PidOptions ver="1.0">
  <Opts fCount="1" fType="0" iCount="0" pCount="0" pgCount="2"
    format="0" pidVer="2.0" timeout="${timeoutSeconds * 1000}"
    pTimeout="20000" posh="UNKNOWN" env="P" />
  <CustOpts><Param name="mantrakey" value="" /></CustOpts>
</PidOptions>''';
      final response = await _rdRequest(
        client,
        'CAPTURE',
        serviceUri.resolve(capturePath ?? '/rd/capture'),
        body: options,
      ).timeout(Duration(seconds: timeoutSeconds + 5));

      final pidData = response.body;
      final errorCode = _xmlAttribute(pidData, 'Resp', 'errCode');
      final errorInfo =
          _xmlAttribute(pidData, 'Resp', 'errInfo') ??
          'Fingerprint capture failed';
      final quality = _xmlAttribute(pidData, 'Resp', 'qScore') ?? '0';
      final success =
          response.statusCode >= 200 &&
          response.statusCode < 300 &&
          errorCode == '0';

      return CaptureResult(
        pidData: success ? pidData : '',
        fidData: _extractFingerprintData(pidData),
        qualityScore: quality,
        template: _extractFingerprintData(pidData),
        deviceInfo: 'Mantra MFS110 RD Service',
        timestamp: DateTime.now().toIso8601String(),
        success: success,
        error: success ? null : '$errorInfo (code $errorCode)',
      );
    } catch (e) {
      return CaptureResult(
        pidData: '',
        fidData: '',
        qualityScore: '0',
        template: '',
        deviceInfo: '',
        timestamp: '',
        success: false,
        error: e.toString(),
      );
    } finally {
      client.close();
    }
  }

  static Future<Map<String, dynamic>?> _findRdService() async {
    for (final scheme in ['https', 'http']) {
      final client = createRdClient(allowSelfSigned: scheme == 'https');
      try {
        for (var port = 11100; port <= 11120; port++) {
          final uri = Uri.parse('$scheme://127.0.0.1:$port');
          try {
            final response = await _rdRequest(
              client,
              'RDSERVICE',
              uri,
            ).timeout(const Duration(seconds: 2));
            if (response.statusCode >= 200 &&
                response.statusCode < 300 &&
                response.body.contains('<RDService')) {
              final capturePath = RegExp(
                r'<Interface\b[^>]*\bpath="([^"]*?/rd/capture)"',
                caseSensitive: false,
              ).firstMatch(response.body)?.group(1);
              if (response.body.contains('Mantra') ||
                  capturePath == '/rd/capture') {
                return {
                  'uri': uri,
                  'capturePath': capturePath ?? '/rd/capture',
                };
              }
            }
          } catch (_) {}
        }
      } finally {
        client.close();
      }
    }
    return null;
  }

  static Future<http.Response> _rdRequest(
    http.Client client,
    String method,
    Uri uri, {
    String? body,
  }) async {
    final request = http.Request(method, uri)
      ..headers['Content-Type'] = 'text/xml; charset=utf-8'
      ..headers['Accept'] = 'text/xml';
    if (body != null) request.body = body;
    return http.Response.fromStream(await client.send(request));
  }

  static String? _xmlAttribute(String xml, String element, String attribute) {
    final match = RegExp(
      '<$element\\b[^>]*\\b$attribute="([^"]*)"',
      caseSensitive: false,
    ).firstMatch(xml);
    return match?.group(1);
  }

  static String _extractFingerprintData(String pidData) {
    final match = RegExp(
      r'<(?:BDB|FMR|FIR|FID|BIN|Data)[^>]*>([^<]+)</',
      caseSensitive: false,
    ).firstMatch(pidData);
    return match?.group(1) ?? '';
  }

  /// Verify a fingerprint against a stored template
  static Future<bool> verify({
    required String storedTemplate,
    BiometricDeviceType? deviceType,
    int timeoutSeconds = 30,
  }) async {
    try {
      final result = await _channel.invokeMethod('verify', {
        'stored_template': storedTemplate,
        'device_type': deviceType?.name,
        'timeout_seconds': timeoutSeconds,
      });
      return result == true;
    } catch (e) {
      return false;
    }
  }

  /// Stop any ongoing capture
  static Future<void> stopCapture() async {
    try {
      await _channel.invokeMethod('stopCapture');
    } catch (_) {}
  }

  /// Get device status (connected, ready, etc.)
  static Future<Map<String, dynamic>> getDeviceStatus() async {
    try {
      final result = await _channel.invokeMethod('getDeviceStatus');
      return Map<String, dynamic>.from(result ?? {});
    } catch (e) {
      return {'status': 'error', 'message': e.toString()};
    }
  }

  /// Get full diagnostics: installed RD services + connected USB devices
  static Future<Map<String, dynamic>> diagnose() async {
    try {
      final result = await _channel.invokeMethod('diagnose');
      return Map<String, dynamic>.from(result ?? {});
    } catch (e) {
      return {'error': e.toString()};
    }
  }

  /// Get list of all supported RD Service packages (for checking which are installed)
  static List<String> getSupportedRdServicePackages() {
    return [
      // Mantra
      'com.mantra.mfs100.rdservice',
      'com.mantra.mfs110.rdservice',
      // Morpho
      'com.scl.rdservice',
      'com.idemia.morpho.rdservice',
      // Startek
      'com.acpl.rdservice',
      // SecuGen
      'com.secugen.rdservice',
      // Precision
      'com.precision.rdservice',
      // ZKTeco
      'com.zkteco.rdservice',
    ];
  }

  /// Get display names for devices
  static String getDeviceDisplayName(BiometricDeviceType type) {
    switch (type) {
      case BiometricDeviceType.mantraMFS100:
        return 'Mantra MFS100';
      case BiometricDeviceType.mantraMFS110:
        return 'Mantra MFS110';
      case BiometricDeviceType.morphoMSO1300:
        return 'Morpho MSO1300';
      case BiometricDeviceType.startekFM2200:
        return 'Startek FM2200';
      case BiometricDeviceType.acplFM2200:
        return 'ACPL FM2200';
      case BiometricDeviceType.secugen:
        return 'SecuGen';
      case BiometricDeviceType.precision:
        return 'Precision';
      case BiometricDeviceType.zkteco:
        return 'ZKTeco';
      case BiometricDeviceType.generic:
        return 'Generic RD Device';
    }
  }
}
