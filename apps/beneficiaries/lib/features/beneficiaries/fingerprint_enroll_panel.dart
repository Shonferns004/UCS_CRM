import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';
import '../../services/api_service.dart';
import '../../services/fingerprint_service.dart';

/// A single captured fingerprint (buffered before the beneficiary exists).
class CapturedFingerprint {
  final String fingerPosition;
  final String rawImage;
  final String template;
  final int width;
  final int height;
  final double dpi;
  final String qualityScore;

  const CapturedFingerprint({
    required this.fingerPosition,
    required this.rawImage,
    required this.template,
    required this.width,
    required this.height,
    required this.dpi,
    required this.qualityScore,
  });

  Map<String, dynamic> toEnrollBody() => {
        'device_type': 'SECUGEN_RAW',
        'device_name': 'SecuGen Hamster Pro 20 (Raw USB)',
        'image_b64': rawImage,
        'template_b64': template,
        'width': width,
        'height': height,
        'dpi': dpi,
        'quality_score': qualityScore,
        'finger_position': fingerPosition,
      };
}

/// Compact fingerprint enrollment used directly on the registration page.
/// Captures up to [targetFingerprints] fingers, rejects already-enrolled
/// fingerprints, and calls [onDone] when the user taps Done.
///
/// When [collectOnly] is true the panel buffers the captures locally and
/// reports them through [onCaptured] (used before the beneficiary is created,
/// so enrollments are posted together with registration). Otherwise each
/// capture is enrolled via the API immediately.
class FingerprintEnrollPanel extends StatefulWidget {
  final String? beneficiaryCode;
  final String? beneficiaryName;
  final bool collectOnly;
  final VoidCallback? onDone;
  final ValueChanged<List<CapturedFingerprint>>? onCaptured;

  const FingerprintEnrollPanel({
    super.key,
    this.beneficiaryCode,
    this.beneficiaryName,
    this.collectOnly = false,
    this.onDone,
    this.onCaptured,
  });

  @override
  State<FingerprintEnrollPanel> createState() => _FingerprintEnrollPanelState();
}

class _FingerprintEnrollPanelState extends State<FingerprintEnrollPanel> {
  static const int targetFingerprints = 4;
  static const double matchThreshold = 40;

  static const List<String> fingerOptions = [
    'RIGHT_THUMB',
    'RIGHT_INDEX',
    'RIGHT_MIDDLE',
    'RIGHT_RING',
    'RIGHT_LITTLE',
    'LEFT_THUMB',
    'LEFT_INDEX',
    'LEFT_MIDDLE',
    'LEFT_RING',
    'LEFT_LITTLE',
  ];

  final List<String> _enrolledFingers = [];
  final List<CapturedFingerprint> _captured = [];
  String? _selectedFinger;
  bool _capturing = false;
  bool _captureComplete = false;
  String? _statusMessage;
  String? _lastError;
  bool _errored = false;
  String? _qualityScore;

  @override
  void initState() {
    super.initState();
    FingerprintService.initialize();
    _detect();
  }

  @override
  void dispose() {
    FingerprintService.dispose();
    super.dispose();
  }

  Future<void> _detect() async {
    final devices = await FingerprintService.detectDevices();
    if (!mounted) return;
    final available = devices.where((d) => d.isAvailable).toList();
    if (available.isNotEmpty) {
      setState(() => _statusMessage = 'Scanner ready. Pick a finger and scan.');
    } else {
      setState(() => _statusMessage = 'Connect the SecuGen Hamster Pro 20 via USB-C to scan.');
    }
  }

  Future<void> _startCapture() async {
    final devices = await FingerprintService.detectDevices();
    if (!mounted) return;
    final available = devices.where((d) => d.isAvailable).toList();
    if (available.isEmpty) {
      setState(() {
        _errored = true;
        _lastError = 'SecuGen scanner not connected. Check the USB-C cable and try again.';
        _statusMessage = 'Scanner not detected';
      });
      return;
    }
    await _startCaptureRaw();
  }

  Future<void> _startCaptureRaw() async {
    setState(() {
      _capturing = true;
      _captureComplete = false;
      _qualityScore = null;
      _errored = false;
      _lastError = null;
      _statusMessage = 'Place finger on the scanner (capture 1 of 2)...';
    });

    final finger = _selectedFinger;
    if (finger == null) {
      setState(() {
        _capturing = false;
        _errored = true;
        _lastError = 'Select which finger you are enrolling first.';
        _statusMessage = 'No finger selected';
      });
      return;
    }
    if (_enrolledFingers.contains(finger)) {
      setState(() {
        _capturing = false;
        _errored = true;
        _lastError = 'This finger is already enrolled. Pick a different finger.';
        _statusMessage = 'Finger already enrolled';
      });
      return;
    }
    if (_enrolledFingers.length >= targetFingerprints) {
      setState(() {
        _capturing = false;
        _errored = true;
        _lastError = 'All $targetFingerprints fingerprints captured. Tap Done to finish.';
        _statusMessage = 'Enrollment complete';
      });
      return;
    }

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

    setState(() => _statusMessage = 'Checking if this fingerprint is already enrolled...');
    final isDuplicate = await _isDuplicateFingerprint(first.template);
    if (!mounted) return;
    if (isDuplicate) {
      setState(() {
        _capturing = false;
        _captureComplete = false;
        _qualityScore = null;
        _errored = true;
        _lastError = 'This fingerprint is already enrolled. Try a different finger.';
        _statusMessage = 'Fingerprint already exists';
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

    await _saveBiometric(first);
  }

  Future<void> _saveBiometric(CaptureResult result) async {
    if (widget.collectOnly) {
      // Buffer locally — enrollment is posted with registration.
      if (!mounted) return;
      if (_selectedFinger != null) {
        final savedFinger = _selectedFinger!;
        setState(() {
          if (!_enrolledFingers.contains(savedFinger)) {
            _enrolledFingers.add(savedFinger);
            _captured.add(CapturedFingerprint(
              fingerPosition: savedFinger,
              rawImage: result.rawImage,
              template: result.template,
              width: result.width,
              height: result.height,
              dpi: result.dpi,
              qualityScore: result.qualityScore,
            ));
          }
          // Auto-advance to the next un-enrolled finger.
          final next =
              fingerOptions.where((f) => !_enrolledFingers.contains(f)).toList();
          _selectedFinger = next.isNotEmpty ? next.first : null;
          _statusMessage = _enrolledFingers.length >= targetFingerprints
              ? 'All $targetFingerprints fingerprints scanned.'
              : 'Fingerprint ${_enrolledFingers.length} of $targetFingerprints scanned. '
                  'Next: ${next.isNotEmpty ? _fingerLabel(next.first) : 'Done'} — tap another finger to change it.';
        });
        widget.onCaptured?.call(List.unmodifiable(_captured));
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Fingerprint captured'), backgroundColor: AppTheme.success),
        );
      }
      return;
    }

    try {
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
          'finger_position': _selectedFinger ?? 'UNKNOWN',
        },
        timeout: const Duration(minutes: 1),
      );

      if (!mounted) return;
      if (_selectedFinger != null) {
        final savedFinger = _selectedFinger!;
        setState(() {
          if (!_enrolledFingers.contains(savedFinger)) {
            _enrolledFingers.add(savedFinger);
          }
          // Auto-advance to the next un-enrolled finger.
          final next =
              fingerOptions.where((f) => !_enrolledFingers.contains(f)).toList();
          _selectedFinger = next.isNotEmpty ? next.first : null;
          _statusMessage = _enrolledFingers.length >= targetFingerprints
              ? 'All $targetFingerprints fingerprints saved.'
              : 'Fingerprint ${_enrolledFingers.length} of $targetFingerprints saved. '
                  'Next: ${next.isNotEmpty ? _fingerLabel(next.first) : 'Done'} — tap another finger to change it.';
        });
      }
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Fingerprint saved'), backgroundColor: AppTheme.success),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _errored = true;
        _lastError = e.toString().replaceFirst('Exception: ', '');
        _statusMessage = 'Failed to save';
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to save: $e'), backgroundColor: AppTheme.error),
      );
    }
  }

  /// Fetch all enrolled templates and check none matches this fingerprint.
  Future<bool> _isDuplicateFingerprint(String template) async {
    try {
      final response = await ApiService.get(
        '/biometrics/templates',
        timeout: const Duration(minutes: 2),
      );
      final list = response['templates'] as List? ?? [];
      final candidates = list
          .map((e) => (Map<String, dynamic>.from(e)['template']?.toString() ?? ''))
          .where((t) => t.isNotEmpty)
          .toList();
      if (candidates.isEmpty) return false;
      final result = await FingerprintService.sourceafisIdentify(
        template,
        candidates,
        threshold: matchThreshold,
      );
      final matches = (result['matches'] as List?) ?? [];
      return matches.isNotEmpty;
    } catch (_) {
      return false;
    }
  }

  String _fingerLabel(String position) {
    return position
        .split('_')
        .map((w) => w.isEmpty ? w : '${w[0]}${w.substring(1).toLowerCase()}')
        .join(' ');
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AppTheme.outline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('Fingerprint Enrollment',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
              Text('${_enrolledFingers.length}/$targetFingerprints',
                  style: const TextStyle(fontSize: 13, color: AppTheme.secondary, fontWeight: FontWeight.w700)),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            widget.collectOnly
                ? 'Scan $targetFingerprints fingers first — registration unlocks afterwards.'
                : 'Scan up to $targetFingerprints fingers for this beneficiary.',
            style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary),
          ),
          const SizedBox(height: 16),

          // Scan status box
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: _captureComplete
                  ? AppTheme.success.withAlpha(15)
                  : _capturing
                      ? AppTheme.secondary.withAlpha(15)
                      : AppTheme.surface.withAlpha(40),
              borderRadius: BorderRadius.circular(10),
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
                  size: 44,
                  color: _captureComplete
                      ? AppTheme.success
                      : _capturing
                          ? AppTheme.secondary
                          : AppTheme.textSecondary,
                ),
                const SizedBox(height: 10),
                Text(
                  _statusMessage ?? 'Connect the scanner and tap Scan Fingerprint',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: _errored ? FontWeight.w600 : FontWeight.w400,
                    color: _captureComplete
                        ? AppTheme.success
                        : _errored
                            ? AppTheme.error
                            : AppTheme.textSecondary,
                  ),
                ),
                if (_qualityScore != null && _captureComplete) ...[
                  const SizedBox(height: 6),
                  Text('Quality: $_qualityScore%',
                      style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: AppTheme.success)),
                ],
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Finger selector
          const Text('Select Finger',
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: fingerOptions.map((finger) {
              final alreadyDone = _enrolledFingers.contains(finger);
              final selected = _selectedFinger == finger;
              return ChoiceChip(
                label: Text(_fingerLabel(finger)),
                selected: selected,
                disabledColor: AppTheme.success.withAlpha(30),
                onSelected: alreadyDone ? null : (v) => setState(() => _selectedFinger = v ? finger : null),
                avatar: alreadyDone
                    ? const Icon(Icons.check_circle, size: 18, color: AppTheme.success)
                    : null,
                selectedColor: AppTheme.secondary.withAlpha(40),
              );
            }).toList(),
          ),
          const SizedBox(height: 16),

          // Scan button (hidden once all fingerprints are captured)
          if (_enrolledFingers.length < targetFingerprints)
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: _capturing ? null : _startCapture,
                icon: _capturing
                    ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Icon(Icons.fingerprint, size: 20),
                label: Text(
                  _capturing
                      ? 'Scanning...'
                      : (_enrolledFingers.isEmpty ? 'Scan Fingerprint' : 'Scan Next Finger'),
                ),
              ),
            ),

          if (_lastError != null) ...[
            const SizedBox(height: 12),
            Container(
              width: double.infinity,
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
          ],

          // Done button (enabled only after all fingerprints are scanned,
// not used in collect-only mode — the parent form owns the action)
          if (!widget.collectOnly && _enrolledFingers.isNotEmpty) ...[
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: _enrolledFingers.length >= targetFingerprints
                    ? widget.onDone
                    : null,
                style: FilledButton.styleFrom(
                  backgroundColor: _enrolledFingers.length >= targetFingerprints
                      ? AppTheme.success
                      : AppTheme.secondary,
                ),
                icon: const Icon(Icons.check, size: 18),
                label: Text(_enrolledFingers.length >= targetFingerprints
                    ? 'Done & Register'
                    : 'Done & Register (${_enrolledFingers.length}/$targetFingerprints)'),
              ),
            ),
          ],
        ],
      ),
    );
  }
}