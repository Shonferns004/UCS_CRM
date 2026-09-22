import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';
import '../../services/api_service.dart';
import '../../services/fingerprint_service.dart';
import 'beneficiary_detail_page.dart';

class FingerprintLookupPage extends StatefulWidget {
  const FingerprintLookupPage({super.key});

  @override
  State<FingerprintLookupPage> createState() => _FingerprintLookupPageState();
}

class _FingerprintLookupPageState extends State<FingerprintLookupPage> {
  bool _loading = false;
  String _status = 'Place a beneficiary finger on the scanner';
  String? _error;

  /// Cached raw-format templates for on-device 1:N matching.
  List<Map<String, dynamic>>? _templateCache;
  Map<String, dynamic>? _matchedBeneficiary;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _findBeneficiary();
    });
  }

  Future<void> _findBeneficiary() async {
    setState(() {
      _loading = true;
      _error = null;
      _status = 'Checking biometric device...';
    });

    try {
      await _findBeneficiaryRaw();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.toString().replaceFirst('Exception: ', '');
        _status = 'No beneficiary found';
        _matchedBeneficiary = null;
      });
    }
  }

  /// Own-system flow: raw USB capture -> on-device SourceAFIS 1:N match.
  Future<void> _findBeneficiaryRaw() async {
    await FingerprintService.rawConnect();
    setState(() => _status = 'Place the finger on the scanner...');
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

    setState(() => _status = 'Matching against ${candidates.length} enrolled fingerprint(s)...');
    final identify = await FingerprintService.sourceafisIdentify(
      result.template,
      candidates.map((c) => c['template'].toString()).toList(),
    );
    final matches = (identify['matches'] as List?) ?? [];
    if (matches.isEmpty) {
      throw Exception('No beneficiary found with this fingerprint. Try again.');
    }

    matches.sort((a, b) => ((b as Map)['score'] as num).compareTo((a as Map)['score'] as num));
    final best = Map<String, dynamic>.from(matches.first as Map);
    final bestIndex = (best['index'] as num).toInt();
    final beneficiaryId = candidates[bestIndex]['beneficiary_id']?.toString();
    if (beneficiaryId == null) {
      throw Exception('Matched record has no beneficiary id');
    }

    setState(() => _status = 'Match found (score ${(best['score'] as num).toStringAsFixed(3)}). Fetching profile...');
    final response = await ApiService.get('/beneficiaries/$beneficiaryId');
    if (!mounted) return;
    final profile = Map<String, dynamic>.from(response);
    setState(() {
      _loading = false;
      _matchedBeneficiary = profile;
      _status = 'Match found — opening profile...';
      _error = null;
    });
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => BeneficiaryDetailPage(beneficiary: profile),
      ),
    );
    if (!mounted) return;
    setState(() {
      _matchedBeneficiary = null;
      _status = 'Place a beneficiary finger on the scanner';
      _error = null;
      _loading = false;
    });
  }

  /// Fetch enrolled raw-format templates from the backend and cache them.
  Future<List<Map<String, dynamic>>> _loadTemplates({bool force = false}) async {
    final cache = _templateCache;
    final cacheValid = cache != null && cache.isNotEmpty;
    if (cacheValid && !force) return cache;

    setState(() {});
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
    return Scaffold(
      appBar: AppBar(
        title: const Text('Find by Fingerprint'),
        backgroundColor: AppTheme.primary,
        foregroundColor: Colors.white,
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppTheme.outline),
            ),
            child: Column(
              children: [
                AnimatedSwitcher(
                  duration: const Duration(milliseconds: 400),
                  transitionBuilder: (child, animation) =>
                      FadeTransition(opacity: animation, child: child),
                  child: _loading
                      ? const _ScanningFingerprintIndicator(
                          key: ValueKey('scanning'),
                        )
                      : Icon(
                          _matchedBeneficiary != null
                              ? Icons.check_circle
                              : Icons.fingerprint,
                          key: ValueKey(_error == null ? 'idle' : 'error'),
                          size: 72,
                          color: _matchedBeneficiary != null
                              ? AppTheme.success
                              : _error == null
                                  ? AppTheme.secondary
                                  : AppTheme.error,
                        ),
                ),
                const SizedBox(height: 16),
                Text(
                  _status,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 10),
                  Text(
                    _error!,
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontSize: 12, color: AppTheme.error, height: 1.5),
                  ),
                ],
                const SizedBox(height: 16),
                ElevatedButton.icon(
                  onPressed: _loading ? null : _findBeneficiary,
                  icon: _loading
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Icon(Icons.fingerprint, size: 18),
                  label: Text(_loading ? 'Scanning...' : 'Scan Another Finger'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          const Text(
            'Place the beneficiary finger flat on the scanner. The page scans automatically when opened and opens the matching profile.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 12, color: AppTheme.textSecondary),
          ),
        ],
      ),
    );
  }
}

class _ScanningFingerprintIndicator extends StatefulWidget {
  const _ScanningFingerprintIndicator({super.key});

  @override
  State<_ScanningFingerprintIndicator> createState() => _ScanningFingerprintIndicatorState();
}

class _ScanningFingerprintIndicatorState extends State<_ScanningFingerprintIndicator>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1500),
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
          width: 120,
          height: 120,
          child: Stack(
            alignment: Alignment.center,
            children: [
              // Pulsing outer rings
              for (var i = 0; i < 3; i++)
                Transform.scale(
                  scale: 0.6 + 0.4 * ((_controller.value + i * 0.33) % 1.0),
                  child: Container(
                    width: 110,
                    height: 110,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: AppTheme.secondary.withAlpha(((1 - (_controller.value + i * 0.33) % 1.0) * 120).round()),
                        width: 2,
                      ),
                    ),
                  ),
                ),
              // Fingerprint icon
              Container(
                width: 76,
                height: 76,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: AppTheme.secondary.withAlpha(25),
                ),
                child: const Icon(
                  Icons.fingerprint,
                  size: 46,
                  color: AppTheme.secondary,
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}