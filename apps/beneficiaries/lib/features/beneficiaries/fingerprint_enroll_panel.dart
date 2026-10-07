import '../../core/lucide_icons.dart';
import 'package:flutter/material.dart';
import 'dart:async';

import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_skeleton.dart';
import '../../core/widgets/app_snackbar.dart';
import '../../services/api_service.dart';
import '../../services/fingerprint_service.dart';

/// A single captured fingerprint buffered before the beneficiary exists.
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

  Map<String, dynamic> toEnrollBody() {
    return {
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
}

/// Fingerprint enrollment panel.
///
/// Features:
/// - Captures up to [targetFingerprints] fingerprints.
/// - Prevents selecting an already captured finger.
/// - Checks biometric template duplicates locally.
/// - Checks biometric template duplicates against server.
/// - Preserves state while the parent page scrolls/rebuilds.
/// - In collectOnly mode, buffers fingerprints and sends them to parent.
/// - In normal mode, enrolls fingerprints immediately.
class FingerprintEnrollPanel extends StatefulWidget {
  final String? beneficiaryCode;
  final String? beneficiaryName;
  final bool collectOnly;
  final VoidCallback? onDone;
  final ValueChanged<List<CapturedFingerprint>>? onCaptured;

  /// Finger positions already enrolled for an existing beneficiary.
  final List<String> alreadyEnrolledFingers;

  const FingerprintEnrollPanel({
    super.key,
    this.beneficiaryCode,
    this.beneficiaryName,
    this.collectOnly = false,
    this.onDone,
    this.onCaptured,
    this.alreadyEnrolledFingers = const [],
  });

  @override
  State<FingerprintEnrollPanel> createState() => _FingerprintEnrollPanelState();
}

class _FingerprintEnrollPanelState extends State<FingerprintEnrollPanel>
    with AutomaticKeepAliveClientMixin {
  static const int targetFingerprints = 3;

  /// SourceAFIS matching threshold.
  static const double matchThreshold = 40;

  /// Minimum acceptable scanner quality.
  static const double qualityThreshold = 55;

  /// Maximum attempts for a poor-quality capture.
  static const int maxCaptureAttempts = 3;

  static const Duration duplicateCheckTimeout = Duration(minutes: 2);

  /// Only these fingers can be selected.
  static const List<String> fingerOptions = [
    'RIGHT_THUMB',
    'LEFT_THUMB',
    'RIGHT_INDEX',
    'LEFT_INDEX',
    'RIGHT_MIDDLE',
    'LEFT_MIDDLE',
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

  bool _checkingDuplicate = false;

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();

    _enrolledFingers.addAll(
      widget.alreadyEnrolledFingers
          .map((e) => e.trim().toUpperCase())
          .where((e) => e.isNotEmpty),
    );

    _setInitialFinger();

    FingerprintService.initialize();

    _detect();
  }

  void _setInitialFinger() {
    final next = fingerOptions.firstWhere(
      (finger) => !_enrolledFingers.contains(finger),
      orElse: () => '',
    );

    _selectedFinger = next.isEmpty ? null : next;
  }

  @override
  void dispose() {
    FingerprintService.stopCapture();
    FingerprintService.dispose();
    super.dispose();
  }

  // ---------------------------------------------------------------------------
  // DEVICE DETECTION
  // ---------------------------------------------------------------------------

  Future<void> _detect() async {
    try {
      final devices = await FingerprintService.detectDevices();

      if (!mounted) return;

      final available = devices.where((d) => d.isAvailable).toList();

      if (available.isNotEmpty) {
        setState(() {
          _statusMessage = _enrolledFingers.length >= targetFingerprints
              ? 'All fingerprints captured.'
              : 'Scanner ready. Select a finger and scan.';
        });
      } else {
        setState(() {
          _statusMessage =
              'Connect the SecuGen Hamster Pro 20 via USB-C to scan.';
        });
      }
    } catch (e) {
      if (!mounted) return;

      setState(() {
        _errored = true;
        _lastError = 'Unable to detect fingerprint scanner.';
        _statusMessage = 'Scanner detection failed';
      });
    }
  }

  // ---------------------------------------------------------------------------
  // START CAPTURE
  // ---------------------------------------------------------------------------

  Future<void> _startCapture() async {
    if (_capturing) return;

    final finger = _selectedFinger;

    if (finger == null) {
      setState(() {
        _errored = true;
        _lastError = 'Please select a finger before scanning.';
        _statusMessage = 'No finger selected';
      });
      return;
    }

    if (_enrolledFingers.contains(finger)) {
      setState(() {
        _errored = true;
        _lastError =
            '${_fingerLabel(finger)} is already captured. Please select another finger.';
        _statusMessage = 'Finger already captured';
      });
      return;
    }

    if (_enrolledFingers.length >= targetFingerprints) {
      setState(() {
        _errored = true;
        _lastError =
            'All $targetFingerprints fingerprints have already been captured.';
        _statusMessage = 'Enrollment complete';
      });
      return;
    }

    try {
      final devices = await FingerprintService.detectDevices();

      if (!mounted) return;

      final available = devices.where((d) => d.isAvailable).toList();

      if (available.isEmpty) {
        setState(() {
          _errored = true;
          _lastError =
              'SecuGen scanner not connected. Check the USB-C cable and try again.';
          _statusMessage = 'Scanner not detected';
        });
        return;
      }

      await _startCaptureRaw(finger);
    } catch (e) {
      if (!mounted) return;

      setState(() {
        _capturing = false;
        _errored = true;
        _lastError = e.toString().replaceFirst('Exception: ', '').trim();
        _statusMessage = 'Unable to start scanner';
      });
    }
  }

  // ---------------------------------------------------------------------------
  // RAW CAPTURE
  // ---------------------------------------------------------------------------

  Future<void> _startCaptureRaw(String finger) async {
    if (_capturing) return;

    setState(() {
      _capturing = true;
      _captureComplete = false;
      _qualityScore = null;
      _errored = false;
      _lastError = null;
      _statusMessage = 'Place ${_fingerLabel(finger)} on the scanner...';
    });

    CaptureResult? accepted;

    try {
      for (var attempt = 1; attempt <= maxCaptureAttempts; attempt++) {
        if (!mounted) return;

        if (attempt > 1) {
          setState(() {
            _statusMessage =
                'Quality too low. Keep ${_fingerLabel(finger)} flat and steady '
                '(attempt $attempt of $maxCaptureAttempts)...';
          });
        }

        final result = await FingerprintService.capture(
          deviceType: BiometricDeviceType.secugenHamsterPro20,
        );

        if (!mounted) return;

        if (!result.success) {
          setState(() {
            _capturing = false;
            _errored = true;
            _lastError = result.error ?? 'Fingerprint capture failed.';
            _statusMessage = 'Scan failed';
          });
          return;
        }

        if (!result.isRawCapture) {
          setState(() {
            _capturing = false;
            _errored = true;
            _lastError =
                'No raw fingerprint image returned. '
                'Please check the SecuGen FDx SDK configuration.';
            _statusMessage = 'Raw capture incomplete';
          });
          return;
        }

        final quality = double.tryParse(result.qualityScore) ?? 0;

        if (quality > 0 && quality < qualityThreshold) {
          continue;
        }

        accepted = result;
        break;
      }

      if (accepted == null) {
        if (!mounted) return;

        setState(() {
          _capturing = false;
          _errored = true;
          _lastError =
              'Could not get a clear fingerprint after '
              '$maxCaptureAttempts attempts. '
              'Clean the sensor and place the finger flat and steady.';
          _statusMessage = 'Enrollment failed';
        });

        return;
      }

      // ---------------------------------------------------------------
      // DUPLICATE CHECK
      // ---------------------------------------------------------------

      setState(() {
        _checkingDuplicate = true;
        _statusMessage = 'Checking fingerprint uniqueness...';
      });

      final isDuplicate = await _isDuplicateFingerprint(accepted.template);

      if (!mounted) return;

      setState(() {
        _checkingDuplicate = false;
      });

      if (isDuplicate) {
        setState(() {
          _capturing = false;
          _captureComplete = false;
          _qualityScore = null;
          _errored = true;
          _lastError =
              'This physical fingerprint is already registered. '
              'Please place a different finger.';
          _statusMessage = 'Duplicate fingerprint detected';
        });

        return;
      }

      // ---------------------------------------------------------------
      // ACCEPT CAPTURE
      // ---------------------------------------------------------------

      final acceptedResult = accepted;

      setState(() {
        _capturing = false;
        _captureComplete = true;
        _qualityScore = acceptedResult.qualityScore;
        _errored = false;
        _lastError = null;
        _statusMessage = '${_fingerLabel(finger)} captured successfully.';
      });

      await _saveBiometric(acceptedResult, fingerPosition: finger);

      if (!mounted) return;

      _prepareNextFinger();
    } catch (e) {
      if (!mounted) return;

      setState(() {
        _capturing = false;
        _checkingDuplicate = false;
        _errored = true;
        _lastError = e.toString().replaceFirst('Exception: ', '').trim();
        _statusMessage = 'Fingerprint capture failed';
      });
    }
  }

  // ---------------------------------------------------------------------------
  // CANCEL CAPTURE
  // ---------------------------------------------------------------------------

  Future<void> _cancelCapture() async {
    try {
      await FingerprintService.stopCapture();
    } catch (_) {}

    if (!mounted) return;

    setState(() {
      _capturing = false;
      _checkingDuplicate = false;
      _captureComplete = false;
      _errored = false;
      _lastError = null;

      if (_selectedFinger != null) {
        _statusMessage =
            'Scanning cancelled. Ready for ${_fingerLabel(_selectedFinger!)}.';
      } else {
        _statusMessage = 'Scanning cancelled.';
      }
    });
  }

  // ---------------------------------------------------------------------------
  // PREPARE NEXT FINGER
  // ---------------------------------------------------------------------------

  void _prepareNextFinger() {
    if (!mounted) return;

    if (_enrolledFingers.length >= targetFingerprints) {
      setState(() {
        _selectedFinger = null;
        _captureComplete = true;
        _capturing = false;
        _statusMessage =
            'All $targetFingerprints fingerprints captured successfully.';
      });

      return;
    }

    final next = fingerOptions
        .where((finger) => !_enrolledFingers.contains(finger))
        .toList();

    if (next.isEmpty) {
      setState(() {
        _selectedFinger = null;
        _statusMessage = 'No more available fingers.';
      });

      return;
    }

    setState(() {
      _selectedFinger = next.first;
      _capturing = false;
      _captureComplete = false;
      _statusMessage =
          '${_fingerLabel(next.first)} is ready. Tap Scan Fingerprint.';
    });
  }

  // ---------------------------------------------------------------------------
  // SAVE BIOMETRIC
  // ---------------------------------------------------------------------------

  Future<void> _saveBiometric(
    CaptureResult result, {
    required String fingerPosition,
  }) async {
    final savedFinger = fingerPosition;

    // -----------------------------------------------------------------------
    // COLLECT ONLY
    // -----------------------------------------------------------------------

    if (widget.collectOnly) {
      if (!mounted) return;

      setState(() {
        final alreadyCaptured = _captured.any(
          (item) => item.fingerPosition == savedFinger,
        );

        if (!alreadyCaptured) {
          _enrolledFingers.add(savedFinger);

          _captured.add(
            CapturedFingerprint(
              fingerPosition: savedFinger,
              rawImage: result.rawImage,
              template: result.template,
              width: result.width,
              height: result.height,
              dpi: result.dpi,
              qualityScore: result.qualityScore,
            ),
          );
        }
      });

      widget.onCaptured?.call(List.unmodifiable(_captured));

      if (mounted) {
        showAppSnackbar(
          context,
          '${_fingerLabel(savedFinger)} captured successfully.',
          success: true,
        );
      }

      return;
    }

    // -----------------------------------------------------------------------
    // IMMEDIATE API ENROLLMENT
    // -----------------------------------------------------------------------

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
          'finger_position': savedFinger,
        },
        timeout: const Duration(minutes: 1),
      );

      if (!mounted) return;

      setState(() {
        if (!_enrolledFingers.contains(savedFinger)) {
          _enrolledFingers.add(savedFinger);
        }

        _statusMessage = _enrolledFingers.length >= targetFingerprints
            ? 'All $targetFingerprints fingerprints saved.'
            : '${_fingerLabel(savedFinger)} saved successfully.';
      });

      showAppSnackbar(
        context,
        '${_fingerLabel(savedFinger)} saved successfully.',
        success: true,
      );
    } catch (e) {
      if (!mounted) return;

      setState(() {
        _errored = true;
        _lastError = e.toString().replaceFirst('Exception: ', '').trim();
        _statusMessage = 'Failed to save fingerprint';
      });

      showAppSnackbar(context, 'Failed to save fingerprint: $e', error: true);
    }
  }

  // ---------------------------------------------------------------------------
  // LOCAL DUPLICATE CHECK
  // ---------------------------------------------------------------------------

  Future<bool> _isLocalDuplicateFingerprint(String template) async {
    if (_captured.isEmpty) {
      return false;
    }

    final existingTemplates = _captured
        .map((fingerprint) => fingerprint.template)
        .where((template) => template.isNotEmpty)
        .toList();

    if (existingTemplates.isEmpty) {
      return false;
    }

    try {
      final result = await FingerprintService.sourceafisIdentify(
        template,
        existingTemplates,
        threshold: matchThreshold,
      );

      final matches = (result['matches'] as List?) ?? [];

      return matches.isNotEmpty;
    } catch (e) {
      debugPrint('Local fingerprint duplicate check failed: $e');

      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // SERVER DUPLICATE CHECK
  // ---------------------------------------------------------------------------

  Future<bool> _isDuplicateFingerprint(String template) async {
    // First check fingerprints already captured during
    // this registration.
    final localDuplicate = await _isLocalDuplicateFingerprint(template);

    if (localDuplicate) {
      return true;
    }

    // Then check fingerprints already stored in database.
    try {
      final response = await ApiService.get(
        '/biometrics/templates',
        timeout: duplicateCheckTimeout,
      );

      final rawTemplates = response['templates'] as List? ?? [];

      final candidates = rawTemplates
          .map((item) {
            final map = Map<String, dynamic>.from(item as Map);

            return map['template']?.toString() ?? '';
          })
          .where((template) => template.isNotEmpty)
          .toList();

      if (candidates.isEmpty) {
        return false;
      }

      final result = await FingerprintService.sourceafisIdentify(
        template,
        candidates,
        threshold: matchThreshold,
      );

      final matches = (result['matches'] as List?) ?? [];

      return matches.isNotEmpty;
    } catch (e) {
      debugPrint('Server fingerprint duplicate check failed: $e');

      // VERY IMPORTANT:
      //
      // Do not silently accept a fingerprint if duplicate
      // verification failed.
      //
      // Returning true forces the operator to retry instead
      // of potentially creating duplicate biometric records.
      return true;
    }
  }

  // ---------------------------------------------------------------------------
  // FINGER LABEL
  // ---------------------------------------------------------------------------

  String _fingerLabel(String position) {
    return position
        .split('_')
        .map(
          (word) => word.isEmpty
              ? word
              : '${word[0]}${word.substring(1).toLowerCase()}',
        )
        .join(' ');
  }

  // ---------------------------------------------------------------------------
  // BUILD
  // ---------------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    super.build(context);

    final allCaptured = _enrolledFingers.length >= targetFingerprints;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppTheme.outline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // -------------------------------------------------------------------
          // HEADER
          // -------------------------------------------------------------------

          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Fingerprint Enrollment',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
              ),
              Text(
                '${_enrolledFingers.length}/$targetFingerprints',
                style: const TextStyle(
                  fontSize: 13,
                  color: AppTheme.secondary,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),

          const SizedBox(height: 4),

          Text(
            widget.collectOnly
                ? 'Scan $targetFingerprints different fingers before registration.'
                : 'Scan up to $targetFingerprints different fingers for this beneficiary.',
            style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary),
          ),

          const SizedBox(height: 16),

          // -------------------------------------------------------------------
          // SCAN STATUS
          // -------------------------------------------------------------------
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: _captureComplete
                  ? AppTheme.success.withAlpha(15)
                  : _capturing
                  ? AppTheme.secondary.withAlpha(15)
                  : _errored
                  ? AppTheme.error.withAlpha(10)
                  : AppTheme.surface.withAlpha(40),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: _captureComplete
                    ? AppTheme.success
                    : _capturing
                    ? AppTheme.secondary
                    : _errored
                    ? AppTheme.error
                    : AppTheme.outline,
              ),
            ),
            child: Column(
              children: [
                Icon(
                  _captureComplete
                      ? LucideIcons.checkCircle
                      : _checkingDuplicate
                      ? LucideIcons.search
                      : LucideIcons.fingerprint,
                  size: 44,
                  color: _captureComplete
                      ? AppTheme.success
                      : _capturing || _checkingDuplicate
                      ? AppTheme.secondary
                      : _errored
                      ? AppTheme.error
                      : AppTheme.textSecondary,
                ),

                const SizedBox(height: 10),

                Text(
                  _statusMessage ?? 'Connect the scanner and select a finger.',
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
                  Text(
                    'Quality: $_qualityScore%',
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                      color: AppTheme.success,
                    ),
                  ),
                ],
              ],
            ),
          ),

          const SizedBox(height: 16),

          // -------------------------------------------------------------------
          // SELECT FINGER
          // -------------------------------------------------------------------
          const Text(
            'Select Finger',
            style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
          ),

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
                selectedColor: AppTheme.secondary.withAlpha(40),

                onSelected: alreadyDone || _capturing
                    ? null
                    : (value) {
                        if (!value) return;

                        setState(() {
                          _selectedFinger = finger;
                          _captureComplete = false;
                          _errored = false;
                          _lastError = null;
                          _qualityScore = null;
                          _statusMessage =
                              '${_fingerLabel(finger)} selected. '
                              'Tap Scan Fingerprint.';
                        });
                      },

                avatar: alreadyDone
                    ? const Icon(
                        LucideIcons.checkCircle,
                        size: 18,
                        color: AppTheme.success,
                      )
                    : selected
                    ? const Icon(LucideIcons.fingerprint, size: 18)
                    : null,
              );
            }).toList(),
          ),

          const SizedBox(height: 14),

          // -------------------------------------------------------------------
          // FINGER STATUS
          // -------------------------------------------------------------------
          const SizedBox(height: 16),

          // -------------------------------------------------------------------
          // SCAN BUTTON
          // -------------------------------------------------------------------
          if (!allCaptured)
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: _capturing || _checkingDuplicate
                    ? null
                    : _startCapture,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primaryBlueSoft,
                  foregroundColor: AppColors.addBeneficiaryText,
                  disabledBackgroundColor: AppColors.primaryBlueSoft.withValues(
                    alpha: 0.5,
                  ),
                  disabledForegroundColor: AppColors.addBeneficiaryText
                      .withValues(alpha: 0.5),
                ),
                icon: _capturing
                    ? const SkeletonBox(
                        width: 16,
                        height: 16,
                        borderRadius: 5,
                        baseColor: Color(0x262563EB),
                        shineColor: Color(0xFF2563EB),
                      )
                    : _checkingDuplicate
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(LucideIcons.fingerprint, size: 20),
                label: Text(
                  _capturing
                      ? 'Scanning...'
                      : _checkingDuplicate
                      ? 'Checking Fingerprint...'
                      : 'Scan Fingerprint',
                ),
              ),
            ),

          // -------------------------------------------------------------------
          // CANCEL
          // -------------------------------------------------------------------
          if (_capturing) ...[
            const SizedBox(height: 10),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: _cancelCapture,
                icon: const Icon(LucideIcons.xCircle, size: 18),
                label: const Text('Cancel Scanning'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: AppTheme.error,
                  side: const BorderSide(color: AppTheme.error),
                ),
              ),
            ),
          ],

          // -------------------------------------------------------------------
          // ERROR
          // -------------------------------------------------------------------
          if (_lastError != null) ...[
            const SizedBox(height: 12),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppTheme.error.withAlpha(12),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AppTheme.error),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(
                    LucideIcons.alertCircle,
                    color: AppTheme.error,
                    size: 20,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      _lastError!,
                      style: const TextStyle(
                        color: AppTheme.error,
                        fontSize: 12.5,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],

          // -------------------------------------------------------------------
          // COMPLETE MESSAGE
          // -------------------------------------------------------------------
          if (allCaptured) ...[
            const SizedBox(height: 14),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: AppTheme.success.withAlpha(15),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppTheme.success),
              ),
              child: Row(
                children: [
                  const Icon(
                    LucideIcons.checkCircle,
                    color: AppTheme.success,
                    size: 22,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'All $targetFingerprints fingerprints captured successfully.',
                      style: const TextStyle(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w600,
                        color: AppTheme.success,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],

          // -------------------------------------------------------------------
          // DONE BUTTON
          // -------------------------------------------------------------------
          if (!widget.collectOnly && _enrolledFingers.isNotEmpty) ...[
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: allCaptured ? widget.onDone : null,
                style: FilledButton.styleFrom(
                  backgroundColor: allCaptured
                      ? AppTheme.success
                      : AppTheme.secondary,
                ),
                icon: const Icon(LucideIcons.check, size: 18),
                label: Text(
                  allCaptured
                      ? 'Done & Register'
                      : 'Done & Register '
                            '(${_enrolledFingers.length}/$targetFingerprints)',
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
