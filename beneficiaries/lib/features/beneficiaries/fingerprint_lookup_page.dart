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

  Future<void> _findBeneficiary() async {
    setState(() {
      _loading = true;
      _error = null;
      _status = 'Checking biometric device...';
    });

    try {
      final devices = await FingerprintService.detectDevices();
      final available = devices.where((device) => device.isAvailable).toList();
      if (available.isEmpty) {
        throw Exception(
          'MFS110 RD Service was not found. Check the scanner and RD Service, then try again.',
        );
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
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.toString().replaceFirst('Exception: ', '');
        _status = 'No beneficiary found';
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
