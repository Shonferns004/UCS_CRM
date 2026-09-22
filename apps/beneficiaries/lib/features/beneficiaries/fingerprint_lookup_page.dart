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
  bool _refreshingTemplates = false;
  Map<String, dynamic>? _matchedBeneficiary;
  double? _matchScore;

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
        _matchScore = null;
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
    setState(() {
      _loading = false;
      _matchedBeneficiary = Map<String, dynamic>.from(response);
      _matchScore = (best['score'] as num).toDouble();
      _status = 'Match found (score ${(best['score'] as num).toStringAsFixed(3)})';
      _error = null;
    });
  }

  /// Fetch enrolled raw-format templates from the backend and cache them.
  Future<List<Map<String, dynamic>>> _loadTemplates({bool force = false}) async {
    final cache = _templateCache;
    final cacheValid = cache != null && cache.isNotEmpty;
    if (cacheValid && !force) return cache;

    setState(() {
      _refreshingTemplates = true;
      _status = 'Downloading enrolled fingerprints...';
    });
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
      if (mounted) setState(() => _refreshingTemplates = false);
    }
  }

  Future<void> _refreshTemplates() async {
    setState(() {
      _refreshingTemplates = true;
      _error = null;
    });
    try {
      final items = await _loadTemplates(force: true);
      if (!mounted) return;
      setState(() {
        _refreshingTemplates = false;
        _status = 'Enrolled fingerprints loaded: ${items.length}';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _refreshingTemplates = false;
        _status = 'Failed to load enrolled fingerprints';
        _error = e.toString().replaceFirst('Exception: ', '');
      });
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
                Icon(
                  _loading ? Icons.fingerprint : Icons.person_search,
                  size: 72,
                  color: _error == null ? AppTheme.secondary : AppTheme.error,
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
                if (_matchedBeneficiary != null) ...[
                  const SizedBox(height: 16),
                  _MatchedBeneficiaryCard(
                    beneficiary: _matchedBeneficiary!,
                    score: _matchScore ?? 0,
                  ),
                  const SizedBox(height: 8),
                  OutlinedButton.icon(
                    onPressed: () => Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => BeneficiaryDetailPage(
                          beneficiary: _matchedBeneficiary!,
                        ),
                      ),
                    ),
                    icon: const Icon(Icons.person, size: 18),
                    label: const Text('Open Full Profile'),
                  ),
                ],
                if (_error != null) ...[
                  const SizedBox(height: 10),
                  Text(
                    _error!,
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontSize: 12, color: AppTheme.error, height: 1.5),
                  ),
                ],
                const SizedBox(height: 24),

                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
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
                        : const Icon(Icons.fingerprint),
                    label: Text(_loading ? 'Scanning...' : 'Scan Fingerprint'),
                  ),
                ),
                const SizedBox(height: 8),
                TextButton.icon(
                  onPressed: _loading || _refreshingTemplates ? null : _refreshTemplates,
                  icon: Icon(
                    _refreshingTemplates ? Icons.downloading : Icons.download,
                    size: 18,
                  ),
                  label: Text(_refreshingTemplates ? 'Loading templates...' : 'Refresh Enrolled Templates'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          const Text(
            'The beneficiary must already have an enrolled fingerprint. Use Search Beneficiary to enroll a new fingerprint.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 12, color: AppTheme.textSecondary),
          ),
        ],
      ),
    );
  }
}

class _MatchedBeneficiaryCard extends StatelessWidget {
  final Map<String, dynamic> beneficiary;
  final double score;
  const _MatchedBeneficiaryCard({required this.beneficiary, required this.score});

  @override
  Widget build(BuildContext context) {
    final name = beneficiary['full_name'] ?? 'Unknown';
    final code = beneficiary['beneficiary_code'] ?? '';
    final mobile = beneficiary['mobile'] ?? '—';
    final city = beneficiary['city'] ?? '';

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppTheme.success.withAlpha(12),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppTheme.success),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              CircleAvatar(
                radius: 18,
                backgroundColor: AppTheme.success.withAlpha(40),
                child: Text(name.isNotEmpty ? name[0].toUpperCase() : '?',
                    style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppTheme.success)),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(name.toString(), style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                    Text(code.toString(), style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: AppTheme.success,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text('Match ${score.toStringAsFixed(1)}',
                    style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: Colors.white)),
              ),
            ],
          ),
          const Divider(height: 18),
          _row('Mobile', mobile.toString()),
          _row('City', city.toString()),
        ],
      ),
    );
  }

  Widget _row(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        children: [
          SizedBox(
            width: 90,
            child: Text(label, style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
          ),
          Text(value, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}