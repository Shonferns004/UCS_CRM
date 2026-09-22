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
  StreamSubscription<Map<String, dynamic>>? _eventSub;
  bool _phoneAvailable = false;

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
    final diag = await FingerprintService.diagnose();
    if (!mounted) return;
    setState(() => _diagnostics = diag);
  }

  Future<void> _startCapture() async {
    final devices = await FingerprintService.detectDevices();
    if (!mounted) return;
    final available = devices.where((d) => d.isAvailable).toList();
    if (available.isEmpty) {
      final diag = await FingerprintService.diagnose();
      if (!mounted) return;
      final usb = (diag['usb_devices'] as List?) ?? [];
      setState(() {
        _diagnostics = diag;
        _showDiagnostics = true;
        _statusMessage = usb.isEmpty
            ? 'SecuGen not found: no USB devices visible. Check the USB-C cable and that the '
              'phone supports USB host mode.'
            : 'SecuGen (0x1162) not found. Devices seen: '
              '${usb.map((d) => "${d['name']} ${d['vendor_id_hex']}:${d['product_id_hex']}").join(', ')}';
        _errored = true;
      });
      return;
    }
    await _startCaptureRaw();
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
      deviceType: BiometricDeviceType.secugenHamsterPro20,
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
        _lastError = 'No raw image returned. The SecuGen FDx SDK may not be bundled.';
        _statusMessage = 'Raw capture incomplete';
      });
      return;
    }

    setState(() => _statusMessage = 'Remove finger. Place again (capture 2 of 2)...');
    final second = await FingerprintService.capture(
      deviceType: BiometricDeviceType.secugenHamsterPro20,
    );
    if (!mounted) return;

    double? selfScore;
    if (first.template.isNotEmpty && second.template.isNotEmpty) {
      final check = await FingerprintService.sourceafisVerify(
        first.template,
        second.template,
      );
      final s = check['score'];
      if (s is num) selfScore = s.toDouble();
    }

    if (!first.success) {
      setState(() {
        _capturing = false;
        _errored = true;
        _lastError = first.error ?? 'Raw capture failed';
        _statusMessage = 'Enrollment failed';
      });
      return;
    }

    if (!second.success) {
      setState(() {
        _capturing = false;
        _errored = true;
        _lastError = second.error ?? 'Second capture failed';
        _statusMessage = 'Enrollment failed — retry';
      });
      return;
    }

    if (selfScore == null || selfScore < 40) {
      setState(() {
        _capturing = false;
        _errored = true;
        _lastError = selfScore == null
            ? 'Could not compare the two scans. Retry.'
            : 'The two scans did not match (score ${selfScore.toStringAsFixed(1)}). '
                'Keep the SAME finger flat and steady for both scans, then retry.';
        _statusMessage = 'Enrollment failed';
      });
      return;
    }

    setState(() {
      _capturing = false;
      _captureComplete = true;
      _qualityScore = first.qualityScore;
      _errored = false;
      _lastError = null;
      _statusMessage = 'Fingerprint captured (2/2) — saving...';
    });

    await _saveBiometric(first, second);
  }

  Future<void> _saveBiometric(CaptureResult result, CaptureResult? second) async {
    try {
      const requestTimeout = Duration(minutes: 1);
      await _postBiometric(result, requestTimeout);
      final secondOk =
          second != null && second.success && second.template.isNotEmpty;
      if (secondOk) await _postBiometric(second, requestTimeout);

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

  Future<void> _postBiometric(CaptureResult result, Duration requestTimeout) async {
    await ApiService.post(
      '/biometrics/enroll',
      body: {
        'beneficiary_code': widget.beneficiaryCode,
        'device_type': 'SECUGEN_RAW',
        'device_name': 'SecuGen Hamster Pro 20 (Raw USB)',
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

          // Capture source: SecuGen raw USB
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: AppTheme.outline),
            ),
            child: const Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Capture Source', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                SizedBox(height: 12),
                Row(
                  children: [
                    Icon(Icons.usb, size: 18, color: AppTheme.secondary),
                    SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'SecuGen Hamster Pro 20 (Raw USB). Direct USB capture '
                        'stores the fingerprint image + SourceAFIS template '
                        'directly to your system (no RD Service, no UIDAI '
                        'encryption).',
                        style: TextStyle(fontSize: 12, color: AppTheme.textSecondary),
                      ),
                    ),
                  ],
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
                          child: Text('No devices detected. Connect the SecuGen Hamster Pro 20 via USB-C.',
                              style: TextStyle(color: AppTheme.textSecondary, fontSize: 13)),
                        )
                      else
                        ..._devices.map((device) => ListTile(
                          dense: true,
                          contentPadding: EdgeInsets.zero,
                          leading: Icon(
                            device.isAvailable ? Icons.usb : Icons.usb_off,
                            color: device.isAvailable ? AppTheme.success : AppTheme.textSecondary,
                          ),
                          title: Text(device.displayName, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500)),
                          subtitle: Text(
                            device.isAvailable ? 'Ready' : 'Not available',
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
                  _captureComplete ? Icons.check_circle : Icons.fingerprint,
                  size: 64,
                  color: _captureComplete
                      ? AppTheme.success
                      : _capturing
                          ? AppTheme.secondary
                          : AppTheme.textSecondary,
                ),
                const SizedBox(height: 12),
                Text(
                  _statusMessage ?? 'Connect the scanner and tap Scan Fingerprint',
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
          OutlinedButton.icon(
            onPressed: _runDiagnostics,
            icon: const Icon(Icons.bug_report_outlined, size: 16),
            label: const Text('Diagnostics'),
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
    final usb = (diag['usb_devices'] as List?) ?? [];

    return [
      const Text('CONNECTED USB DEVICES', style: TextStyle(fontSize: 11, letterSpacing: 1, color: AppTheme.textSecondary)),
      const SizedBox(height: 6),
      if (usb.isEmpty)
        const Text('No USB device detected. Check the USB-C cable and plug the scanner in again.',
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
          usb.any((d) => d['vendor_id'] == 0x1162)
              ? 'SecuGen scanner connected OK.'
              : 'No SecuGen vendor 0x1162 in the USB list (showing first device as fallback).',
          style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: usb.any((d) => d['vendor_id'] == 0x1162) ? AppTheme.success : AppTheme.warning),
        ),
      ],
    ];
  }
}