import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'rd_http_client.dart';
import 'rd_port_scanner.dart';

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
  mfs110Raw,
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
  static final StreamController<Map<String, dynamic>> _eventController =
      StreamController<Map<String, dynamic>>.broadcast();

  static Map<String, dynamic>? _cachedService;
  static DateTime? _cachedServiceAt;
  static const Duration _cacheLifetime = Duration(seconds: 15);
  static final List<String> _scanErrors = <String>[];

  /// Ports probed first (fast path) before falling back to a full range scan.
  static const List<int> _knownPorts = <int>[
    11101,
    11100,
    11102,
    11103,
    11104,
    11105,
    11106,
    11107,
    11108,
    11109,
    11110,
    11111,
    11112,
    11113,
    11114,
    11115,
    11116,
    11117,
    11118,
    11119,
    11120,
    8443,
    8080,
    443,
  ];

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
            rdServicePackage: 'Auto-detect (any local port)',
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
    if (deviceType == BiometricDeviceType.mfs110Raw) {
      return captureViaMfs110Raw(timeoutSeconds: timeoutSeconds);
    }
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
/// Raw USB capture path ("Own System", no vendor RD Service).
  ///
  /// Phase A: connect/enumerate work; `rawCapture` returns a clear error until
  /// the MFS110 USB protocol is documented (Phase 0) and implemented (Phase 1).
  static Future<CaptureResult> captureViaMfs110Raw({
    int timeoutSeconds = 30,
  }) async {
    try {
      final info = await _channel.invokeMethod<Map>('rawGetInfo');
      final infoMap = Map<String, dynamic>.from(info ?? {});
      if (infoMap['connected'] != true) {
        final conn = await _channel.invokeMethod<Map>('rawConnect');
        final connMap = Map<String, dynamic>.from(conn ?? {});
        if (connMap['connected'] != true) {
          return const CaptureResult(
            pidData: '',
            fidData: '',
            qualityScore: '0',
            template: '',
            deviceInfo: '',
            timestamp: '',
            success: false,
          ).copyWithError(connMap['error']?.toString() ?? 'Unable to connect to the MFS110');
        }
      }

      final raw = await _channel.invokeMethod<Map>('rawCapture', {
        'timeout_seconds': timeoutSeconds,
      });
      final m = Map<String, dynamic>.from(raw ?? {});
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
        deviceInfo: 'Mantra MFS110 (Raw USB)',
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

  /// Connect to the MFS110 over raw USB (returns connection map).
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

  /// Capture through the Mantra RD Service.
  ///
  /// The service listens on a local port (usually 11100-11120). If the first
  /// attempt fails, discovery is repeated with the cache cleared in case the
  /// RD Service restarted on a different port.
  static Future<CaptureResult> captureViaRdService({
    int timeoutSeconds = 30,
  }) async {
    var result = await _captureOnce(timeoutSeconds: timeoutSeconds);
    if (!result.success &&
        (_cachedService != null || result.error != 'rd_not_found')) {
      _cachedService = null;
      _cachedServiceAt = null;
      result = await _captureOnce(timeoutSeconds: timeoutSeconds);
    }
    return result;
  }

  static Future<CaptureResult> _captureOnce({
    required int timeoutSeconds,
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
        error: 'rd_not_found',
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
        deviceInfo: 'Mantra MFS110 RD Service ($serviceUri)',
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

  /// Find the active Mantra RD Service.
  ///
  /// Two-stage discovery:
  /// 1. Fast path: probe the well-known RD ports on every local host.
  /// 2. Full scan: if that fails, scan all TCP ports 1-65535 on each local
  ///    host (closed localhost ports refuse instantly, so this is quick) and
  ///    confirm any open port with an RDSERVICE probe.
  ///
  /// The confirmed endpoint is cached for the session.
  static Future<Map<String, dynamic>?> _findRdService() async {
    final validated = await _validatedCachedService();
    if (validated != null) return validated;

    final now = DateTime.now();
    Map<String, dynamic>? found;
    for (final host in await _candidateHosts()) {
      for (final scheme in const ['https', 'http']) {
        final client = createRdClient(allowSelfSigned: scheme == 'https');
        try {
          for (final port in _knownPorts) {
            final hit = await _probeRdService(
              client,
              Uri.parse('$scheme://$host:$port'),
            );
            if (hit != null) {
              found = hit;
              break;
            }
          }
        } finally {
          client.close();
        }
        if (found != null) break;
      }
      if (found != null) break;
    }

    if (found == null) {
      for (final host in await _candidateHosts()) {
        found = await _findRdServiceByScanning(host);
        if (found != null) break;
      }
    }

    if (found != null) {
      _cachedService = found;
      _cachedServiceAt = now;
    }
    return found;
  }

  /// Returns the cached endpoint only while it still responds to an
  /// RDSERVICE probe; otherwise clears the cache so discovery reruns
  /// (the RD Service may have restarted on a different port).
  static Future<Map<String, dynamic>?> _validatedCachedService() async {
    final service = _cachedService;
    final at = _cachedServiceAt;
    if (service == null || at == null) return null;
    if (DateTime.now().difference(at) > _cacheLifetime) {
      _cachedService = null;
      _cachedServiceAt = null;
      return null;
    }
    final uri = service['uri'] as Uri?;
    if (uri == null) {
      _cachedService = null;
      _cachedServiceAt = null;
      return null;
    }
    final client = createRdClient(allowSelfSigned: uri.scheme == 'https');
    try {
      final valid = await _probeRdService(client, uri);
      if (valid != null) {
        _cachedService = valid;
        _cachedServiceAt = DateTime.now();
        return valid;
      }
    } finally {
      client.close();
    }
    _cachedService = null;
    _cachedServiceAt = null;
    return null;
  }

  /// Hosts to probe: loopback (v4 + v6) plus, on Android, the device's local
  /// IPs (some RD Service apps bind to the device IP instead of localhost).
  static Future<List<String>> _candidateHosts() async {
    final hosts = <String>{'127.0.0.1', 'localhost', '::1'};
    if (defaultTargetPlatform == TargetPlatform.android) {
      try {
        final result =
            await _channel.invokeMethod<List>('getLocalIpAddresses');
        if (result != null) {
          hosts.addAll(result.whereType<String>());
        }
      } catch (_) {}
    }
    return hosts.toList();
  }

  /// Send an RDSERVICE probe and return the service info if [uri] is a
  /// valid Mantra RD Service endpoint, otherwise null.
  static Future<Map<String, dynamic>?> _probeRdService(
    http.Client client,
    Uri uri,
  ) async {
    try {
      final response = await _rdRequest(
        client,
        'RDSERVICE',
        uri,
      ).timeout(const Duration(milliseconds: 800));
      if (response.statusCode >= 200 &&
          response.statusCode < 300 &&
          RegExp(
            r'<RDService\b',
            caseSensitive: false,
          ).hasMatch(response.body)) {
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
    } catch (e) {
      _recordScanError(uri, e);
    }
    return null;
  }

  /// Full range TCP scan on [host]; every open port is confirmed with an
  /// RDSERVICE probe until a valid RD Service is found.
  static Future<Map<String, dynamic>?> _findRdServiceByScanning(
    String host,
  ) async {
    final candidates = <Map<String, dynamic>>[];
    await scanOpenTcpPorts(
      host,
      concurrency: 512,
      connectTimeout: const Duration(milliseconds: 60),
      onOpen: (port) async {
        final hit = await _probeOpenPort(host, port);
        if (hit != null) {
          candidates.add(hit);
          return true;
        }
        return false;
      },
    );
    return candidates.isEmpty ? null : candidates.first;
  }

  static Future<Map<String, dynamic>?> _probeOpenPort(
    String host,
    int port,
  ) async {
    for (final scheme in const ['https', 'http']) {
      final client = createRdClient(allowSelfSigned: scheme == 'https');
      try {
        final hit = await _probeRdService(
          client,
          Uri.parse('$scheme://$host:$port'),
        );
        if (hit != null) return hit;
      } finally {
        client.close();
      }
    }
    return null;
  }

  static void _recordScanError(Uri uri, Object error) {
    _scanErrors.add('${uri.scheme}://${uri.host}:${uri.port}: $error');
    if (_scanErrors.length > 20) {
      _scanErrors.removeRange(0, _scanErrors.length - 20);
    }
  }

  /// Run RD Service detection and report the result for diagnostics.
  /// [forceRefresh] bypasses the session cache on Android.
  static Future<Map<String, dynamic>> checkRdService({
    bool forceRefresh = false,
  }) async {
    if (forceRefresh || defaultTargetPlatform != TargetPlatform.android) {
      _cachedService = null;
      _cachedServiceAt = null;
      _scanErrors.clear();
    }
    final service = await _findRdService();
    if (service == null) {
      return {
        'found': false,
        'hosts': await _candidateHosts(),
        'errors': List<String>.from(_scanErrors),
        'message':
            'No Mantra RD Service found. Make sure the RD Service app is '
            'running and has whitelisted this app '
            '(com.beingsevak.beneficiaries).',
      };
    }
    return {
      'found': true,
      'uri': (service['uri'] as Uri).toString(),
      'capturePath': service['capturePath'],
    };
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
      case BiometricDeviceType.mfs110Raw:
        return 'Mantra MFS110 (Raw USB)';
      case BiometricDeviceType.generic:
        return 'Generic RD Device';
    }
  }
}
