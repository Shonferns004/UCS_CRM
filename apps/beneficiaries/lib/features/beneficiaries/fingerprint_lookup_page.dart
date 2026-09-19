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
  bool _useRawCapture = true;

  /// Cached raw-format templates for on-device 1:N matching.
  List<Map<String, dynamic>>? _templateCache;
  bool _refreshingTemplates = false;

  Future<void> _findBeneficiary() async {
    setState(() {
      _loading = true;
      _error = null;
      _status = 'Checking biometric device...';
    });

    try {
      if (_useRawCapture) {
        await _findBeneficiaryRaw();
      } else {
        await _findBeneficiaryRd();
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.toString().replaceFirst('Exception: ', '');
        _status = 'No beneficiary found';
      });
    }
  }

  /// Own-system flow: raw USB capture -> on-device SourceAFIS 1:N match.
  Future<void> _findBeneficiaryRaw() async {
    await FingerprintService.rawConnect();
    setState(() => _status = 'Place the finger on the scanner...');
    final result = await FingerprintService.capture(
      deviceType: BiometricDeviceType.mfs110Raw,
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
        'Enroll a beneficiary first (with "Own System (Raw)" capture source).',
      );
    }

    setState(() => _status = 'Matching against ${candidates.length} enrolled fingerprint(s)...');
    final identify = await FingerprintService.sourceafisIdentify(
      result.template,
      candidates.map((c) => c['template'].toString()).toList(),
    );
    final matches = (identify['matches'] as List?) ?? [];
    if (matches.isEmpty) {
      throw Exception('No beneficiary matched this fingerprint. Try a clearer scan.');
    }

    matches.sort((a, b) => ((b as Map)['score'] as num).compareTo((a as Map)['score'] as num));
    final best = Map<String, dynamic>.from(matches.first as Map);
    final bestIndex = (best['index'] as num).toInt();
    final beneficiaryId = candidates[bestIndex]['beneficiary_id']?.toString();
    if (beneficiaryId == null) {
      throw Exception('Matched record has no beneficiary id');
    }

    setState(() => _status = 'Match found (score ${(best['score'] as num).toStringAsFixed(3)}). Opening profile...');
    final response = await ApiService.get('/beneficiaries/$beneficiaryId');
    if (!mounted) return;
    Navigator.pushReplacement(
      context,
      MaterialPageRoute(
        builder: (_) => BeneficiaryDetailPage(
          beneficiary: Map<String, dynamic>.from(response),
        ),
      ),
    );
  }

  /// Legacy flow via the vendor RD Service.
  Future<void> _findBeneficiaryRd() async {
    final devices = await FingerprintService.detectDevices();
    final available = devices.where((device) => device.isAvailable).toList();
    if (available.isEmpty) {
      final rdCheck = await FingerprintService.checkRdService();
      if (rdCheck['found'] != true) {
        throw Exception(
          'MFS110 RD Service was not found. Open the RD Service app on this '
          'phone, make sure scanning is enabled and this app is whitelisted, '
          'then try again.',
        );
      }
    }

    setState(() => _status = 'Place the finger on the scanner...');
    final result = await FingerprintService.capture(
      deviceType: available.first.type,
    );
    if (!result.success) {
      throw Exception(result.error ?? 'Fingerprint capture failed');
    }

    final template = result.template.isNotEmpty
        ? result.template
        : result.fidData;
    if (template.isEmpty) {
      throw Exception('The scanner returned no fingerprint template');
    }

    setState(() => _status = 'Finding beneficiary...');
    final response = await ApiService.post(
      '/biometrics/identify',
      body: {'template': template, 'fid_data': result.fidData},
    );
    final beneficiary = Map<String, dynamic>.from(
      response['beneficiary'] ?? {},
    );
    if (!mounted) return;
    Navigator.pushReplacement(
      context,
      MaterialPageRoute(
        builder: (_) => BeneficiaryDetailPage(beneficiary: beneficiary),
      ),
    );
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

  Future<void> _checkRdService() async {
    setState(() {
      _loading = true;
      _error = null;
      _status = 'Detecting RD Service...';
    });
    try {
      final info = await FingerprintService.checkRdService(forceRefresh: true);
      if (!mounted) return;
      if (info['found'] == true) {
        setState(() {
          _loading = false;
          _status = 'RD Service detected: ${info['uri']}';
        });
      } else {
        setState(() {
          _loading = false;
          _status = 'RD Service not found';
          _error = info['message']?.toString();
        });
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _status = 'RD Service check failed';
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
                if (_error != null) ...[
                  const SizedBox(height: 10),
                  Text(
                    _error!,
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontSize: 13, color: AppTheme.error),
                  ),
                ],
                const SizedBox(height: 24),

                // Capture source toggle
                SegmentedButton<bool>(
                  segments: const [
                    ButtonSegment(
                      value: true,
                      icon: Icon(Icons.usb, size: 16),
                      label: Text('Own System (Raw)'),
                    ),
                    ButtonSegment(
                      value: false,
                      icon: Icon(Icons.wifi_tethering, size: 16),
                      label: Text('RD Service'),
                    ),
                  ],
                  selected: {_useRawCapture},
                  onSelectionChanged: (selection) {
                    setState(() => _useRawCapture = selection.first);
                  },
                ),
                const SizedBox(height: 12),

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
                Row(
                  children: [
                    Expanded(
                      child: TextButton.icon(
                        onPressed: _loading || _refreshingTemplates ? null : _refreshTemplates,
                        icon: Icon(
                          _refreshingTemplates ? Icons.downloading : Icons.download,
                          size: 18,
                        ),
                        label: Text(_refreshingTemplates ? 'Loading templates...' : 'Refresh Enrolled Templates'),
                      ),
                    ),
                    Expanded(
                      child: TextButton.icon(
                        onPressed: _loading ? null : _checkRdService,
                        icon: const Icon(Icons.wifi_tethering, size: 18),
                        label: const Text('Check RD Service'),
                      ),
                    ),
                  ],
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
