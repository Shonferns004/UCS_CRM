import '../../core/lucide_icons.dart';
import 'dart:async';
import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_text_styles.dart';
import '../../services/api_service.dart';
import '../../services/fingerprint_service.dart';
import 'add_beneficiary_page.dart';
import 'beneficiary_detail_page.dart';

class FingerprintLookupPage extends StatefulWidget {
  final String name;
  final bool canAdd;

  const FingerprintLookupPage({
    super.key,
    this.name = 'Volunteer',
    this.canAdd = true,
  });

  @override
  State<FingerprintLookupPage> createState() => _FingerprintLookupPageState();
}

class _FingerprintLookupPageState extends State<FingerprintLookupPage> {
  bool _loading = false;
  String? _error;

  bool? _deviceConnected;
  StreamSubscription<Map<String, dynamic>>? _deviceEventSub;

  List<Map<String, dynamic>>? _templateCache;
  Map<String, dynamic>? _matchedBeneficiary;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _checkDevice());
    _deviceEventSub = FingerprintService.onEvent.listen(_handleDeviceEvent);
  }

  @override
  void dispose() {
    _deviceEventSub?.cancel();
    FingerprintService.stopCapture();
    super.dispose();
  }

  Future<void> _handleDeviceEvent(Map<String, dynamic> event) async {
    final type = event['type'];
    if (type == 'device_connected') {
      await _checkDevice();
      if (mounted && _deviceConnected == true) {
        setState(() => _error = null);
      }
    } else if (type == 'device_disconnected') {
      await FingerprintService.stopCapture();
      // Android briefly re-enumerates the USB bus on plug/unplug (and when
      // other apps touch the device), firing a spurious DETACHED. Do not mark
      // the device lost until a re-probe says it's truly gone.
      await Future<void>.delayed(const Duration(milliseconds: 400));
      if (!mounted) return;
      await _checkDevice();
    }
  }

  Future<void> _checkDevice() async {
    var connected = false;
    try {
      connected = await FingerprintService.ensureConnected();
    } catch (_) {
      connected = false;
    }
    if (!mounted) return;
    setState(() {
      _deviceConnected = connected;
      _error = connected ? null : 'Device not connected';
    });
  }

  Future<void> _findBeneficiary() async {
    if (_loading) return;
    if (_deviceConnected != true) {
      await _checkDevice();
      if (_deviceConnected != true) {
        return;
      }
    }
    setState(() {
      _loading = true;
      _error = null;
      _matchedBeneficiary = null;
    });

    try {
      await _findBeneficiaryRaw();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.toString().replaceFirst('Exception: ', '');
        _matchedBeneficiary = null;
      });
    }
  }

  Future<void> _cancelScanning() async {
    await FingerprintService.stopCapture();
    if (!mounted) return;
    setState(() {
      _loading = false;
      _error = null;
      _matchedBeneficiary = null;
    });
  }

  // Long-press on the fingerprint glyph opens the registration page (the
  // compact add button was removed from the greeting row).
  void _openAddBeneficiary() {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => const AddBeneficiaryPage()),
    );
  }

  Future<void> _findBeneficiaryRaw() async {
    // capture() reconnects on its own (`ensureConnected`), so no pre-check is
    // needed here - a stale/transient connection self-heals before the scan.
    final result = await FingerprintService.capture(
      deviceType: BiometricDeviceType.secugenHamsterPro20,
    );
    if (!result.success) {
      throw Exception(result.error ?? 'Fingerprint capture failed');
    }
    if (result.template.isEmpty) {
      throw Exception('No fingerprint template extracted from the scan');
    }

    final candidates = await _loadTemplates();
    if (candidates.isEmpty) {
      throw Exception(
        'No raw-format fingerprints enrolled on the server yet. '
        'Enroll a beneficiary first (with the SecuGen scanner).',
      );
    }

    final identify = await FingerprintService.sourceafisIdentify(
      result.template,
      candidates.map((c) => c['template'].toString()).toList(),
    );
    final matches = (identify['matches'] as List?) ?? [];
    if (matches.isEmpty) {
      throw Exception('No beneficiary found with this fingerprint. Try again.');
    }

    matches.sort((a, b) =>
        ((b as Map)['score'] as num).compareTo((a as Map)['score'] as num));
    final best = Map<String, dynamic>.from(matches.first as Map);
    final bestIndex = (best['index'] as num).toInt();
    final beneficiaryId = candidates[bestIndex]['beneficiary_id']?.toString();
    if (beneficiaryId == null) {
      throw Exception('Matched record has no beneficiary id');
    }

    final response = await ApiService.get('/beneficiaries/$beneficiaryId');
    if (!mounted) return;
    final profile = Map<String, dynamic>.from(response);
    setState(() {
      _loading = false;
      _matchedBeneficiary = profile;
      _error = null;
    });
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => BeneficiaryDetailPage(beneficiary: profile),
      ),
    );
    if (!mounted) return;
    setState(() => _matchedBeneficiary = null);
  }

  Future<List<Map<String, dynamic>>> _loadTemplates(
      {bool force = false}) async {
    final cache = _templateCache;
    final cacheValid = cache != null && cache.isNotEmpty;
    if (cacheValid && !force) return cache;
    try {
      final response = await ApiService.get(
        '/biometrics/templates',
        timeout: const Duration(minutes: 2),
      );
      final list = response['templates'] as List? ?? [];
      final items = list.map((e) => Map<String, dynamic>.from(e)).toList();
      _templateCache = items;
      return items;
    } finally {
      if (mounted) setState(() {});
    }
  }

  @override
  Widget build(BuildContext context) {
    final matched = _matchedBeneficiary != null;
    final bool deviceGrey = _deviceConnected != true;
    final Color accent = matched
        ? AppColors.successGreen
        : deviceGrey
            ? AppColors.disabled
            : _error == null
                ? AppColors.primaryBlue
                : AppColors.error;
    final Color accentSoft = matched
        ? AppColors.successGreenSoft
        : deviceGrey
            ? AppColors.surfaceSoft
            : _error == null
                ? AppColors.primaryBlueSoft
                : AppColors.errorSoft;

    final Color labelColor;
    final Color labelBg;
    if (deviceGrey) {
      labelColor = AppColors.textSecondary;
      labelBg = AppColors.surfaceSoft;
    } else if (_error != null) {
      labelColor = AppColors.error;
      labelBg = AppColors.errorSoft;
    } else {
      labelColor = AppColors.successGreen;
      labelBg = AppColors.successGreenSoft;
    }

    final hour = DateTime.now().hour;
    final greeting = hour < 12
        ? 'Good Morning'
        : hour < 17
            ? 'Good Afternoon'
            : 'Good Evening';

    return Scaffold(
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) {
            final centerY = constraints.maxHeight / 2;
            final String? stateLabel =
                (_error != null && _error != 'Device not connected')
                    ? _error
                    : null;
            return Stack(
              children: [
                Positioned(
                  top: 16,
                  left: 24,
                  right: 24,
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('BEING SEVAK',
                                style: AppTextStyles.pageLabel),
                            const SizedBox(height: 6),
                            Text(
                              '$greeting, ${widget.name} 👋',
                              style: AppTextStyles.pageTitle,
                            ),
                            const SizedBox(height: 4),
                            const Text(
                              'Together for a better tomorrow.',
                              style: AppTextStyles.pageSubtitle,
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                Center(
                  child: GestureDetector(
                    onTap: _loading ? _cancelScanning : _findBeneficiary,
                    onLongPress: widget.canAdd && !_loading
                        ? _openAddBeneficiary
                        : null,
                    behavior: HitTestBehavior.opaque,
                    child: AnimatedSwitcher(
                      duration: const Duration(milliseconds: 300),
                      transitionBuilder: (child, animation) =>
                          FadeTransition(opacity: animation, child: child),
                      child: _loading
                          ? _ScanningFingerprintIndicator(
                              key: const ValueKey('scanning'),
                              accent: accent,
                              accentSoft: accentSoft,
                            )
                          : _IdleFingerprintGlyph(
                              key: ValueKey(matched
                                  ? 'matched'
                                  : (_error == null ? 'idle' : 'error')),
                              accent: accent,
                              accentSoft: accentSoft,
                              matched: matched,
                              onTap: _findBeneficiary,
                            ),
                    ),
                  ),
                ),
                if (!_loading && stateLabel != null)
                  Positioned(
                    left: 32,
                    right: 32,
                    top: centerY + 165,
                    child: Align(
                      alignment: Alignment.topCenter,
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 200),
                        padding: const EdgeInsets.symmetric(
                            horizontal: 14, vertical: 8),
                        decoration: BoxDecoration(
                          color: labelBg,
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: Text(
                          stateLabel,
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            fontSize: 13.5,
                            fontWeight: FontWeight.w500,
                            color: labelColor,
                          ),
                        ),
                      ),
                    ),
                  ),
              ],
            );
          },
        ),
      ),
    );
  }
}

/// Idle fingerprint icon with a subtle pulsing ring and material ripple
/// to communicate that it is tappable.
class _IdleFingerprintGlyph extends StatefulWidget {
  final Color accent;
  final Color accentSoft;
  final bool matched;
  final VoidCallback onTap;

  const _IdleFingerprintGlyph({
    super.key,
    required this.accent,
    required this.accentSoft,
    required this.matched,
    required this.onTap,
  });

  @override
  State<_IdleFingerprintGlyph> createState() => _IdleFingerprintGlyphState();
}

class _IdleFingerprintGlyphState extends State<_IdleFingerprintGlyph>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1800),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, _) {
        final t = _controller.value;
        return SizedBox(
          width: 280,
          height: 280,
          child: Stack(
            alignment: Alignment.center,
            children: [
              if (!widget.matched)
                for (var i = 0; i < 3; i++) _buildRing(t, i),
              Material(
                color: widget.accentSoft,
                shape: const CircleBorder(),
                clipBehavior: Clip.antiAlias,
                child: InkWell(
                  onTap: widget.onTap,
                  customBorder: const CircleBorder(),
                  child: SizedBox(
                    width: 184,
                    height: 184,
                    child: Icon(
                      widget.matched
                          ? LucideIcons.checkCircle
                          : LucideIcons.fingerprint,
                      size: 88,
                      color: widget.accent,
                    ),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  /// An expanding, fading ring that radiates outward from the icon to
  /// signal the operator to tap it.
  Widget _buildRing(double t, int i) {
    final p = (t + i / 3) % 1.0;
    final scale = 0.55 + 0.9 * p;
    final opacity = (1 - p).clamp(0.0, 1.0) * 0.55;
    return Transform.scale(
      scale: scale,
      child: Opacity(
        opacity: opacity,
        child: Container(
          width: 192,
          height: 192,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            border: Border.all(color: widget.accent, width: 2),
          ),
        ),
      ),
    );
  }
}

class _ScanningFingerprintIndicator extends StatefulWidget {
  final Color accent;
  final Color accentSoft;

  const _ScanningFingerprintIndicator({
    super.key,
    required this.accent,
    required this.accentSoft,
  });

  @override
  State<_ScanningFingerprintIndicator> createState() =>
      _ScanningFingerprintIndicatorState();
}

class _ScanningFingerprintIndicatorState
    extends State<_ScanningFingerprintIndicator>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1600),
  )..repeat();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, _) {
        return SizedBox(
          width: 184,
          height: 184,
          child: Stack(
            alignment: Alignment.center,
            children: [
              for (var i = 0; i < 3; i++)
                Transform.scale(
                  scale: 0.6 + 0.4 * ((_controller.value + i * 0.33) % 1.0),
                  child: Container(
                    width: 184,
                    height: 184,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: widget.accentSoft,
                    ),
                  ),
                ),
              Container(
                width: 136,
                height: 136,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: widget.accentSoft,
                ),
                child: Icon(
                  LucideIcons.fingerprint,
                  size: 88,
                  color: widget.accent,
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}