import 'dart:async';
import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';
import '../../services/fingerprint_service.dart';
import '../../services/phone_biometric_service.dart';
import '../../services/api_service.dart';

class FingerprintCaptureScreen extends StatefulWidget {
  final String beneficiaryCode;
  final String beneficiaryName;
  final bool isVerification;
  const FingerprintCaptureScreen({
    super.key,
    required this.beneficiaryCode,
    required this.beneficiaryName,
    this.isVerification = false,
  });

  @override
  State<FingerprintCaptureScreen> createState() => _FingerprintCaptureScreenState();
}

class _FingerprintCaptureScreenState extends State<FingerprintCaptureScreen> {
  List<DeviceInfo> _devices = [];
  DeviceInfo? _selectedDevice;
  bool _detecting = true;
  bool _capturing = false;
  String? _statusMessage;
  String? _lastError;
  bool _errored = false;
  bool _captureComplete = false;
  String? _qualityScore;
  bool _showDiagnostics = false;
  Map<String, dynamic>? _diagnostics;
  bool _checkingRd = false;
  Map<String, dynamic>? _rdCheck;
  StreamSubscription<Map<String, dynamic>>? _eventSub;
  bool _phoneAvailable = false;
  bool _useRawCapture = false;

  @override
  void initState() {
    super.initState();
    _init();
    _checkPhoneBiometric();
  }

  Future<void> _checkPhoneBiometric() async {
    final ok = await PhoneBiometricService.isAvailable();
    if (mounted) setState(() => _phoneAvailable = ok);
  }

  Future<void> _captureWithPhone() async {
    setState(() {
      _capturing = true;
      _captureComplete = false;
      _qualityScore = null;
      _errored = false;
      _lastError = null;
      _statusMessage = 'Confirm with phone fingerprint...';
    });

    final ok = await PhoneBiometricService.authenticate();
    if (!mounted) return;

    setState(() {
      _capturing = false;
      _captureComplete = ok;
      _qualityScore = ok ? '100' : null;
      _errored = !ok;
      _lastError = ok ? null : 'Phone fingerprint did not match or was cancelled';
      _statusMessage = ok ? 'Phone fingerprint confirmed' : (_lastError ?? 'Failed');
    });

    if (ok) {
      await _savePhoneBiometric();
    }
  }

  Future<void> _savePhoneBiometric() async {
    try {
      await ApiService.post('/biometrics/enroll', body: {
        'beneficiary_code': widget.beneficiaryCode,
        'credential_reference': 'phone_biometric:${DateTime.now().millisecondsSinceEpoch}',
        'device_type': 'PHONE_FINGERPRINT',
        'device_name': 'Phone Fingerprint',
        'quality': 'GOOD',
        'finger_position': 'UNKNOWN',
      });

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Biometric saved successfully'), backgroundColor: AppTheme.success),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to save: $e'), backgroundColor: AppTheme.error),
      );
    }
  }

  Future<void> _init() async {
    await FingerprintService.initialize();
    _eventSub = FingerprintService.onEvent.listen(_onNativeEvent);
    await _detectDevices();
  }

  @override
  void dispose() {
    _eventSub?.cancel();
    FingerprintService.dispose();
    super.dispose();
  }

  void _onNativeEvent(Map<String, dynamic> event) {
    if (!mounted) return;
    switch (event['type']) {
      case 'device_connected':
        setState(() => _statusMessage = 'Biometric device connected');
        _detectDevices();
        break;
      case 'device_disconnected':
        setState(() {
          _statusMessage = 'Biometric device disconnected';
          _selectedDevice = null;
        });
        break;
      case 'device_ready':
        _detectDevices();
        break;
      case 'capture_started':
        setState(() => _statusMessage = 'Place finger on the scanner...');
        break;
      case 'capture_failed':
        setState(() {
          _statusMessage = event['error'] ?? 'Capture failed';
          _lastError = event['error'] ?? 'Capture failed';
          _errored = true;
          _capturing = false;
        });
        break;
      case 'capture_completed':
        setState(() => _capturing = false);
        break;
      case 'capture_stopped':
        setState(() => _capturing = false);
        break;
    }
  }

  Future<void> _detectDevices() async {
    setState(() => _detecting = true);
    final devices = await FingerprintService.detectDevices();

    if (!mounted) return;
    setState(() {
      _devices = devices;
      _detecting = false;
      final available = devices.where((d) => d.isAvailable).toList();
      if (available.isNotEmpty && _selectedDevice == null) {
        _selectedDevice = available.first;
        _statusMessage = 'Detected: ${available.first.displayName}';
      }
    });
  }

  Future<void> _runDiagnostics() async {
    setState(() => _showDiagnostics = true);
    _runRdCheck();
    final diag = await FingerprintService.diagnose();
    if (!mounted) return;
    setState(() => _diagnostics = diag);
  }

  Future<void> _runRdCheck() async {
    setState(() {
      _rdCheck = null;
      _checkingRd = true;
      _showDiagnostics = true;
    });
    final result = await FingerprintService.checkRdService(forceRefresh: true);
    if (!mounted) return;
    setState(() {
      _checkingRd = false;
      _rdCheck = result;
    });
  }

  Future<void> _startCapture() async {
    if (_useRawCapture) {
      await _startCaptureRaw();
      return;
    }

    var device = _selectedDevice;
    if (device == null && _devices.isNotEmpty) {
      final available = _devices.where((d) => d.isAvailable).toList();
      device = available.isNotEmpty ? available.first : _devices.first;
    }
    if (device == null) {
      setState(() => _statusMessage = 'No biometric device found. Connect a USB scanner or install the vendor RD Service app.');
      return;
    }

    setState(() {
      _selectedDevice = device;
      _capturing = true;
      _captureComplete = false;
      _qualityScore = null;
      _errored = false;
      _lastError = null;
      _statusMessage = 'Place finger on the scanner...';
    });

    final result = await FingerprintService.capture(
      deviceType: device.type,
    );

    if (!mounted) return;

    setState(() {
      _capturing = false;
      _captureComplete = result.success;
      _qualityScore = result.qualityScore;
      _errored = !result.success;
      _lastError = result.error;
      _statusMessage = result.success ? 'Fingerprint captured successfully' : (result.error ?? 'Capture failed');
    });

    if (result.success) {
      // Save to backend
      await _saveBiometric(result);
    }
  }

  /// Own-system raw capture: enrolls with two captures (repeat-scan for quality).
  Future<void> _startCaptureRaw() async {
    setState(() {
      _capturing = true;
      _captureComplete = false;
      _qualityScore = null;
      _errored = false;
      _lastError = null;
      _statusMessage = 'Place finger on the scanner (capture 1 of 2)...';
    });

    final first = await FingerprintService.capture(
      deviceType: BiometricDeviceType.mfs110Raw,
    );
    if (!mounted) return;

    if (!first.success) {
      setState(() {
        _capturing = false;
        _errored = true;
        _lastError = first.error;
        _statusMessage = first.error ?? 'Raw capture failed';
      });
      return;
    }

    if (!first.isRawCapture) {
      setState(() {
        _capturing = false;
        _errored = true;
        _lastError = 'No raw image returned (implementation pending Phase 0 protocol).';
        _statusMessage = 'Raw capture incomplete';
      });
      return;
    }

    setState(() => _statusMessage = 'Remove finger. Place again (capture 2 of 2)...');
    final second = await FingerprintService.capture(
      deviceType: BiometricDeviceType.mfs110Raw,
    );
    if (!mounted) return;

    setState(() {
      _capturing = false;
      _captureComplete = true;
      _qualityScore = first.qualityScore;
      _errored = !second.success;
      _lastError = second.success ? null : (second.error ?? 'Second capture failed');
      _statusMessage = second.success
          ? 'Fingerprint captured (2/2)'
          : 'First capture ok, second try failed — saving first capture';
    });

    await _saveBiometric(first);
  }

  Future<void> _saveBiometric(CaptureResult result) async {
    try {
      const requestTimeout = Duration(minutes: 1);
      if (result.isRawCapture) {
        await ApiService.post(
          '/biometrics/enroll',
          body: {
            'beneficiary_code': widget.beneficiaryCode,
            'device_type': 'MFS110_RAW',
            'device_name': 'Mantra MFS110 (Raw USB)',
            'image_b64': result.rawImage,
            'template_b64': result.template,
            'width': result.width,
            'height': result.height,
            'dpi': result.dpi,
            'quality_score': result.qualityScore,
            'finger_position': 'UNKNOWN',
          },
          timeout: requestTimeout,
        );
      } else {
        await ApiService.post('/biometrics/enroll', body: {
          'beneficiary_code': widget.beneficiaryCode,
          'pid_data': result.pidData,
          'fid_data': result.fidData,
          'template': result.template,
          'device_type': _selectedDevice?.type.name,
          'device_name': _selectedDevice?.displayName,
          'quality_score': result.qualityScore,
        });
      }

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Biometric saved successfully'), backgroundColor: AppTheme.success),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to save: $e'), backgroundColor: AppTheme.error),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.isVerification ? 'Verify Fingerprint' : 'Enroll Fingerprint'),
        backgroundColor: AppTheme.primary,
        foregroundColor: Colors.white,
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Beneficiary card
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: AppTheme.outline),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(widget.beneficiaryName, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                const SizedBox(height: 4),
                Text(widget.beneficiaryCode, style: const TextStyle(fontSize: 13, color: AppTheme.textSecondary)),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Capture source: vendor RD Service vs own raw USB system
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: AppTheme.outline),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Capture Source', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                const SizedBox(height: 12),
                SegmentedButton<bool>(
                  segments: const [
                    ButtonSegment(
                      value: false,
                      icon: Icon(Icons.wifi_tethering, size: 16),
                      label: Text('RD Service'),
                    ),
                    ButtonSegment(
                      value: true,
                      icon: Icon(Icons.usb, size: 16),
                      label: Text('Own System (Raw)'),
                    ),
                  ],
                  selected: {_useRawCapture},
                  onSelectionChanged: (selection) {
                    setState(() => _useRawCapture = selection.first);
                  },
                ),
                const SizedBox(height: 8),
                Text(
                  _useRawCapture
                      ? 'Raw USB capture stores the plain fingerprint image + SourceAFIS template directly to your system '
                          '(no UIDAI encryption). NOTE: capture protocol is pending Phase 0 documentation — expects a '
                          '"protocol not documented" error until then.'
                      : 'Uses the vendor RD Service app (UIDAI-encrypted PID payload).',
                  style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Phone fingerprint option
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: _phoneAvailable ? AppTheme.secondary : AppTheme.outline),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Row(
                  children: [
                    Icon(Icons.smartphone, size: 18, color: AppTheme.secondary),
                    SizedBox(width: 8),
                    Text('Phone Fingerprint', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  _phoneAvailable
                      ? 'Uses this phone\'s fingerprint sensor (no USB scanner needed).'
                      : 'Phone has no fingerprint enrolled. Add one in phone settings.',
                  style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary),
                ),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    onPressed: _phoneAvailable && !_capturing ? _captureWithPhone : null,
                    style: OutlinedButton.styleFrom(
                      side: const BorderSide(color: AppTheme.secondary),
                      foregroundColor: AppTheme.secondary,
                    ),
                    icon: const Icon(Icons.fingerprint, size: 18),
                    label: const Text('Scan with Phone Fingerprint'),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Device detection section
          _detecting
              ? const Center(child: Padding(
                  padding: EdgeInsets.all(24),
                  child: CircularProgressIndicator(),
                ))
              : Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: AppTheme.outline),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Biometric Device', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                      const SizedBox(height: 12),

                      if (_devices.isEmpty)
                        const Padding(
                          padding: EdgeInsets.symmetric(vertical: 8),
                          child: Text('No devices detected. Connect a biometric scanner via USB OTG.',
                              style: TextStyle(color: AppTheme.textSecondary, fontSize: 13)),
                        )
                      else ...[
                        if (_devices.every((d) => !d.isAvailable))
                          Container(
                            margin: const EdgeInsets.only(bottom: 10),
                            padding: const EdgeInsets.all(10),
                            decoration: BoxDecoration(
                              color: AppTheme.warning.withAlpha(18),
                              borderRadius: BorderRadius.circular(6),
                              border: Border.all(color: AppTheme.warning),
                            ),
                            child: const Text(
                              'No RD Service app detected. Connect the USB fingerprint scanner and install the matching vendor app '
                              '(e.g. Mantra MFS100, Startek, Lacara) to scan.',
                              style: TextStyle(fontSize: 12, color: AppTheme.warning),
                            ),
                          ),
                        ..._devices.map((device) => ListTile(
                          dense: true,
                          contentPadding: EdgeInsets.zero,
                          leading: Icon(
                            device.isAvailable ? Icons.usb : Icons.usb_off,
                            color: device.isAvailable ? AppTheme.success : AppTheme.textSecondary,
                          ),
                          title: Text(device.displayName, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500)),
                          subtitle: Text(
                            device.isAvailable ? 'Ready' : 'Not installed — tap to try (shows error)',
                            style: TextStyle(fontSize: 11, color: device.isAvailable ? AppTheme.success : AppTheme.textSecondary),
                          ),
                          trailing: device.isAvailable
                              ? Icon(
                                  _selectedDevice?.type == device.type ? Icons.radio_button_checked : Icons.radio_button_unchecked,
                                  color: _selectedDevice?.type == device.type ? AppTheme.secondary : AppTheme.textSecondary,
                                )
                              : null,
                          onTap: () => setState(() => _selectedDevice = device),
                        )),
                      ],

                      const SizedBox(height: 12),
                      OutlinedButton.icon(
                        onPressed: _detectDevices,
                        icon: const Icon(Icons.refresh, size: 16),
                        label: const Text('Re-scan Devices'),
                        style: OutlinedButton.styleFrom(
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                          textStyle: const TextStyle(fontSize: 12),
                        ),
                      ),
                    ],
                  ),
                ),
          const SizedBox(height: 16),

          // Fingerprint visualization
          Container(
            padding: const EdgeInsets.all(32),
            decoration: BoxDecoration(
              color: _captureComplete
                  ? AppTheme.success.withAlpha(15)
                  : _capturing
                      ? AppTheme.secondary.withAlpha(15)
                      : Colors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: _captureComplete
                    ? AppTheme.success
                    : _capturing
                        ? AppTheme.secondary
                        : AppTheme.outline,
              ),
            ),
            child: Column(
              children: [
                Icon(
                  _captureComplete ? Icons.check_circle : _capturing ? Icons.fingerprint : Icons.fingerprint,
                  size: 64,
                  color: _captureComplete
                      ? AppTheme.success
                      : _capturing
                          ? AppTheme.secondary
                          : AppTheme.textSecondary,
                ),
                const SizedBox(height: 12),
                Text(
                  _statusMessage ?? 'Select a device to begin',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: _errored ? FontWeight.w600 : FontWeight.w400,
                    color: _captureComplete ? AppTheme.success : _errored ? AppTheme.error : AppTheme.textSecondary,
                  ),
                ),
                if (_qualityScore != null && _captureComplete) ...[
                  const SizedBox(height: 8),
                  Text('Quality: $_qualityScore%',
                      style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: AppTheme.success)),
                ],
              ],
            ),
          ),
          const SizedBox(height: 24),

          // Capture button
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: _capturing ? null : _startCapture,
              icon: _capturing
                  ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Icon(Icons.fingerprint, size: 20),
              label: Text(_captureComplete ? 'Capture Again' : _capturing ? 'Scanning...' : 'Scan Fingerprint'),
            ),
          ),
          const SizedBox(height: 12),

          // Error details (shown in full when scanning fails)
          if (_lastError != null)
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppTheme.error.withAlpha(12),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: AppTheme.error),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(Icons.error_outline, color: AppTheme.error, size: 20),
                  const SizedBox(width: 10),
                  Expanded(child: Text(_lastError!, style: const TextStyle(color: AppTheme.error, fontSize: 12.5))),
                ],
              ),
            ),
          const SizedBox(height: 12),

          // Diagnostics
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _runDiagnostics,
                  icon: const Icon(Icons.bug_report_outlined, size: 16),
                  label: const Text('Diagnostics'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _runRdCheck,
                  icon: const Icon(Icons.wifi_tethering, size: 16),
                  label: const Text('Check RD'),
                ),
              ),
            ],
          ),
          if (_showDiagnostics) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: AppTheme.outline),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: _buildDiagnostics(),
              ),
            ),
          ],
        ],
      ),
    );
  }

  List<Widget> _buildDiagnostics() {
    final diag = _diagnostics;
    if (diag == null) {
      return const [Center(child: Padding(padding: EdgeInsets.all(20), child: CircularProgressIndicator()))];
    }
    if (diag['error'] != null) {
      return [Text(diag['error'].toString(), style: const TextStyle(fontSize: 12, color: AppTheme.error))];
    }
    final installed = (diag['installed_rd_services'] as List?) ?? [];
    final usb = (diag['usb_devices'] as List?) ?? [];

    final rd = _rdCheck;
    final rdSection = <Widget>[
      const Text('RD SERVICE CONNECTION', style: TextStyle(fontSize: 11, letterSpacing: 1, color: AppTheme.textSecondary)),
      const SizedBox(height: 6),
      if (_checkingRd)
        const Padding(
          padding: EdgeInsets.symmetric(vertical: 6),
          child: Row(children: [
            SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2)),
            SizedBox(width: 8),
            Text('Detecting RD Service...', style: TextStyle(fontSize: 12)),
          ]),
        )
      else if (rd == null)
        const Text('Not checked yet', style: TextStyle(fontSize: 12, color: AppTheme.textSecondary))
      else if (rd['found'] == true)
        Padding(
          padding: const EdgeInsets.only(bottom: 6),
          child: Row(
            children: [
              const Icon(Icons.check_circle, size: 14, color: AppTheme.success),
              const SizedBox(width: 6),
              Expanded(child: Text(rd['uri'].toString(), style: const TextStyle(fontSize: 12))),
            ],
          ),
        )
      else ...[
        const Icon(Icons.cancel, size: 14, color: AppTheme.error),
        const SizedBox(height: 6),
        Text(
          rd['message']?.toString() ?? 'Not found',
          style: const TextStyle(fontSize: 12, color: AppTheme.error),
        ),
        const SizedBox(height: 6),
        Text(
          'Hosts tried: ${(rd['hosts'] as List?)?.join(', ') ?? 'none'}',
          style: const TextStyle(fontSize: 11, color: AppTheme.textSecondary),
        ),
        const SizedBox(height: 4),
        Text(
          (rd['errors'] as List?)?.join('\n') ?? 'No errors recorded',
          style: const TextStyle(fontSize: 11, color: AppTheme.textSecondary, height: 1.4),
        ),
      ],
      const SizedBox(height: 12),
    ];

    return [
      ...rdSection,
      const Text('INSTALLED RD SERVICE APPS', style: TextStyle(fontSize: 11, letterSpacing: 1, color: AppTheme.textSecondary)),
      const SizedBox(height: 6),
      if (installed.isEmpty)
        const Text('None installed', style: TextStyle(fontSize: 13, color: AppTheme.textSecondary))
      else
        ...installed.map((s) {
          final m = Map<String, dynamic>.from(s);
          final ok = m['installed'] == true;
          final activities = (m['activities'] as List?) ?? [];
          return Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(ok ? Icons.check_circle : Icons.cancel, size: 14, color: ok ? AppTheme.success : AppTheme.error),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        '${m['type']}  (${m['package_name']})',
                        style: const TextStyle(fontSize: 12),
                      ),
                    ),
                  ],
                ),
                if (ok && activities.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(left: 20),
                    child: Text(
                      activities.map((a) => Map<String, dynamic>.from(a)['name']).join('\n'),
                      style: const TextStyle(fontSize: 10, color: AppTheme.textSecondary, height: 1.4),
                    ),
                  ),
                if (ok && activities.isEmpty)
                  const Padding(
                    padding: EdgeInsets.only(left: 20),
                    child: Text('(no exported activities visible)', style: TextStyle(fontSize: 10, color: AppTheme.textSecondary)),
                  ),
              ],
            ),
          );
        }),
      const SizedBox(height: 12),
      const Text('CONNECTED USB DEVICES', style: TextStyle(fontSize: 11, letterSpacing: 1, color: AppTheme.textSecondary)),
      const SizedBox(height: 6),
      if (usb.isEmpty)
        const Text('No USB device detected. Check OTG cable/adapter and plug the scanner.',
            style: TextStyle(fontSize: 13, color: AppTheme.error))
      else
        ...usb.map((d) {
          final m = Map<String, dynamic>.from(d);
          return Padding(
            padding: const EdgeInsets.only(bottom: 4),
            child: Row(
              children: [
                const Icon(Icons.usb, size: 14, color: AppTheme.secondary),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    '${m['name']}  (${m['vendor_id_hex']}:${m['product_id_hex']})',
                    style: const TextStyle(fontSize: 12),
                  ),
                ),
              ],
            ),
          );
        }),
      if (usb.isNotEmpty) ...[
        const SizedBox(height: 8),
        Text(
          usb.any((d) => d['vendor_id'] == 3118 || d['vendor_id'] == 11279)
              ? 'Mantra scanner connected OK.'
              : 'No Mantra scanner (0x0C2E / 0x2C0F) found in the USB list.',
          style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: usb.any((d) => d['vendor_id'] == 3118 || d['vendor_id'] == 11279) ? AppTheme.success : AppTheme.warning),
        ),
      ],
    ];
  }
}