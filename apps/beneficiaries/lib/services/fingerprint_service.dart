import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// Supported biometric device families.
enum BiometricDeviceType {
  secugenHamsterPro20,
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

  /// Raw-mode payload: 8-bit grayscale frame (base64) + image geometry.
  final String rawImage;
  final int width;
  final int height;
  final double dpi;

  const CaptureResult({
    required this.pidData,
    required this.fidData,
    required this.qualityScore,
    required this.template,
    required this.deviceInfo,
    required this.timestamp,
    this.success = true,
    this.error,
    this.rawImage = '',
    this.width = 0,
    this.height = 0,
    this.dpi = 500,
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
      rawImage: map['raw_image'] ?? map['image_b64'] ?? '',
      width: (map['width'] as num?)?.toInt() ?? 0,
      height: (map['height'] as num?)?.toInt() ?? 0,
      dpi: (map['dpi'] as num?)?.toDouble() ?? 500,
    );
  }

  bool get isRawCapture => success && rawImage.isNotEmpty && width > 0 && height > 0;

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
      rawImage: rawImage,
      width: width,
      height: height,
      dpi: dpi,
    );
  }
}

class FingerprintService {
  static const MethodChannel _channel = MethodChannel(
    'com.beingsevak.biometric',
  );
  static StreamSubscription? _eventSubscription;
  static int _listenerCount = 0;
  static final StreamController<Map<String, dynamic>> _eventController =
      StreamController<Map<String, dynamic>>.broadcast();

  /// Stream of events from the native side (device connect/disconnect, capture progress)
  static Stream<Map<String, dynamic>> get onEvent => _eventController.stream;

  /// Initialize the biometric plugin and listen for device events.
  /// Reference-counted so multiple screens can init/dispose safely.
  static Future<void> initialize() async {
    if (kIsWeb || defaultTargetPlatform == TargetPlatform.windows) {
      return;
    }
    _listenerCount++;
    if (_eventSubscription != null) return;
    _eventSubscription = const EventChannel('com.beingsevak.biometric/events')
        .receiveBroadcastStream()
        .listen((event) {
          if (event is Map) {
            _eventController.add(Map<String, dynamic>.from(event));
          }
        });
  }

  /// Release resources. Only tears down the native subscription when the last
  /// consumer calls this.
  static void dispose() {
    if (_listenerCount > 0) _listenerCount--;
    if (_listenerCount > 0 || _eventSubscription == null) return;
    _eventSubscription?.cancel();
    _eventSubscription = null;
  }

  /// Detect which SecuGen device is currently connected (raw USB).
  static Future<List<DeviceInfo>> detectDevices() async {
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

  /// Verify the SecuGen SDK connection is live, re-opening it if needed.
  ///
  /// A device being physically present is NOT enough - the SDK USB handle
  /// (`sdkUsb.isConnected`) is what actually captures frames, and Android
  /// re-enumerates the USB bus briefly on plug/unplug (or when another app
  /// pokes the device), which drops that handle while the cable is still in.
  /// This retries so a transient detach never looks like a real disconnect.
  static Future<bool> ensureConnected({
    int retries = 2,
    Duration retryDelay = const Duration(milliseconds: 300),
  }) async {
    for (var attempt = 0; attempt <= retries; attempt++) {
      final info = await rawGetInfo();
      if (info['connected'] == true) return true;

      final conn = await rawConnect();
      if (conn['connected'] == true) return true;

      // Device is only considered still attached if we can see it on the USB
      // bus. If present, give the stack a moment to settle and retry instead
      // of failing immediately.
      final present = (await detectDevices()).any((d) => d.isAvailable);
      if (!present) return false;

      if (attempt < retries) await Future<void>.delayed(retryDelay);
    }
    return false;
  }

  /// Capture a fingerprint using the SecuGen Hamster Pro 20 over raw USB.
  static Future<CaptureResult> capture({
    BiometricDeviceType? deviceType,
    int timeoutSeconds = 30,
  }) {
    return captureViaSecugenRaw(timeoutSeconds: timeoutSeconds);
  }

  /// Raw USB capture path: direct access to the SecuGen Hamster Pro 20,
  /// no vendor RD Service required.
  static Future<CaptureResult> captureViaSecugenRaw({
    int timeoutSeconds = 30,
  }) async {
    try {
      if (!await ensureConnected()) {
        return const CaptureResult(
          pidData: '',
          fidData: '',
          qualityScore: '0',
          template: '',
          deviceInfo: '',
          timestamp: '',
          success: false,
        ).copyWithError(
          'Unable to connect to the SecuGen Hamster Pro 20. Reconnect the USB cable and retry.',
        );
      }

      var raw = await _channel.invokeMethod<Map>('rawCapture', {
        'timeout_seconds': timeoutSeconds,
      });
      var m = Map<String, dynamic>.from(raw ?? {});
      if (m['success'] != true) {
        final err = m['error']?.toString() ?? '';
        // The connection can drop between the check and the capture (USB
        // re-enumeration). Reopen the device and retry the scan once.
        if (err.contains('not connected') ||
            err.contains('OpenDevice') ||
            err.contains('Device not found')) {
          await ensureConnected(retries: 1);
          raw = await _channel.invokeMethod<Map>('rawCapture', {
            'timeout_seconds': timeoutSeconds,
          });
          m = Map<String, dynamic>.from(raw ?? {});
        }
      }
      if (m['success'] != true) {
        return const CaptureResult(
          pidData: '',
          fidData: '',
          qualityScore: '0',
          template: '',
          deviceInfo: '',
          timestamp: '',
          success: false,
        ).copyWithError(m['error']?.toString() ?? 'Raw capture failed');
      }

      final pixels = m['image_b64']?.toString() ?? '';
      final width = (m['width'] as num?)?.toInt() ?? 0;
      final height = (m['height'] as num?)?.toInt() ?? 0;
      final dpi = (m['dpi'] as num?)?.toDouble() ?? 500;
      var template = m['template']?.toString() ?? '';
      if (template.isEmpty && pixels.isNotEmpty && width > 0 && height > 0) {
        template = await sourceafisExtract(pixels, width, height, dpi);
      }

      return CaptureResult(
        pidData: '',
        fidData: template,
        qualityScore: m['quality_score']?.toString() ?? '0',
        template: template,
        deviceInfo: 'SecuGen Hamster Pro 20 (Raw USB)',
        timestamp: DateTime.now().toIso8601String(),
        success: true,
        rawImage: pixels,
        width: width,
        height: height,
        dpi: dpi,
      );
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

  /// Connect to the SecuGen Hamster Pro 20 over raw USB (returns connection map).
  static Future<Map<String, dynamic>> rawConnect() async {
    try {
      final r = await _channel.invokeMethod<Map>('rawConnect');
      return Map<String, dynamic>.from(r ?? {});
    } catch (e) {
      return {'connected': false, 'error': e.toString()};
    }
  }

  /// Disconnect the raw USB device.
  static Future<void> rawDisconnect() async {
    try {
      await _channel.invokeMethod<Map>('rawDisconnect');
    } catch (_) {}
  }

  /// Current raw USB device info (endpoints, geometry, permission).
  static Future<Map<String, dynamic>> rawGetInfo() async {
    try {
      final r = await _channel.invokeMethod<Map>('rawGetInfo');
      return Map<String, dynamic>.from(r ?? {});
    } catch (e) {
      return {'error': e.toString()};
    }
  }

  /// Extract a SourceAFIS template (base64) from a raw 8-bit grayscale frame.
  static Future<String> sourceafisExtract(
    String imageBase64,
    int width,
    int height,
    double dpi,
  ) async {
    final r = await _channel.invokeMethod<Map>('sourceafisExtract', {
      'pixels': imageBase64,
      'width': width,
      'height': height,
      'dpi': dpi,
    });
    final m = Map<String, dynamic>.from(r ?? {});
    if (m['success'] != true) {
      throw Exception(m['error']?.toString() ?? 'Template extraction failed');
    }
    return m['template']?.toString() ?? '';
  }

  /// 1:1 match. Returns {matched, score}.
  static Future<Map<String, dynamic>> sourceafisVerify(
    String probeTemplate,
    String candidateTemplate, {
    double threshold = 40,
  }) async {
    final r = await _channel.invokeMethod<Map>('sourceafisVerify', {
      'probe_template': probeTemplate,
      'candidate_template': candidateTemplate,
      'threshold': threshold,
    });
    return Map<String, dynamic>.from(r ?? {});
  }

  /// 1:N match on-device. Returns {matches: [{index, score}], count}.
  static Future<Map<String, dynamic>> sourceafisIdentify(
    String probeTemplate,
    List<String> candidateTemplates, {
    double threshold = 40,
  }) async {
    final r = await _channel.invokeMethod<Map>('sourceafisIdentify', {
      'probe_template': probeTemplate,
      'candidate_templates': candidateTemplates,
      'threshold': threshold,
    });
    return Map<String, dynamic>.from(r ?? {});
  }

  /// Stop any ongoing capture
  static Future<void> stopCapture() async {
    try {
      await _channel.invokeMethod('stopCapture');
    } catch (_) {}
  }

  /// Get device status (connected, device ids, etc.)
  static Future<Map<String, dynamic>> getDeviceStatus() async {
    try {
      final result = await _channel.invokeMethod('getDeviceStatus');
      return Map<String, dynamic>.from(result ?? {});
    } catch (e) {
      return {'status': 'error', 'message': e.toString()};
    }
  }

  /// Get diagnostics for the connected USB devices.
  static Future<Map<String, dynamic>> diagnose() async {
    try {
      final result = await _channel.invokeMethod('diagnose');
      return Map<String, dynamic>.from(result ?? {});
    } catch (e) {
      return {'error': e.toString()};
    }
  }
}