import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';
import '../../services/api_service.dart';
import 'fingerprint_capture_screen.dart';

class BeneficiaryDetailPage extends StatefulWidget {
  final Map<String, dynamic> beneficiary;
  const BeneficiaryDetailPage({super.key, required this.beneficiary});

  @override
  State<BeneficiaryDetailPage> createState() => _BeneficiaryDetailPageState();
}

class _BeneficiaryDetailPageState extends State<BeneficiaryDetailPage> {
  late Map<String, dynamic> _b;
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    _b = widget.beneficiary;
    if (_b['fingerprint_status'] == null && _b['id'] != null) _refresh();
  }

  Future<void> _refresh() async {
    try {
      final result = await ApiService.get('/beneficiaries/${_b['id']}');
      if (mounted) setState(() => _b = result);
    } catch (_) {}
  }

  Future<void> _enrollFingerprint() async {
    if (_b['beneficiary_code'] == null) return;
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => FingerprintCaptureScreen(
          beneficiaryCode: _b['beneficiary_code'],
          beneficiaryName: _b['full_name'] ?? _b['first_name'] ?? 'Beneficiary',
        ),
      ),
    );
    _refresh();
  }

  Future<void> _checkIn() async {
    setState(() => _loading = true);
    try {
      await ApiService.post('/programs/check-in', body: {
        'beneficiary_code': _b['beneficiary_code'],
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Checked in successfully'), backgroundColor: AppTheme.success),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString()), backgroundColor: AppTheme.error),
      );
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _issueBenefit() async {
    setState(() => _loading = true);
    try {
      await ApiService.post('/distributions', body: {
        'beneficiary_code': _b['beneficiary_code'],
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Benefit issued'), backgroundColor: AppTheme.success),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString()), backgroundColor: AppTheme.error),
      );
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final name = _b['full_name'] ?? _b['first_name'] ?? 'Unknown';
    final code = _b['beneficiary_code'] ?? '';
    final status = _b['status'] ?? 'ACTIVE';
    final mobile = _b['mobile'] ?? '';
    final city = _b['city'] ?? '';
    final categories = (_b['categories'] as List?)?.map((c) => c['name'] ?? c).join(', ') ?? '';

    return Scaffold(
      appBar: AppBar(
        title: Text(name),
        backgroundColor: AppTheme.primary,
        foregroundColor: Colors.white,
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Header card
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: AppTheme.outline),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    CircleAvatar(
                      radius: 24,
                      backgroundColor: AppTheme.secondary.withAlpha(30),
                      child: Text(name.isNotEmpty ? name[0].toUpperCase() : '?',
                          style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: AppTheme.secondary)),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(name, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                          Text(code, style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                _infoRow('Status', status),
                if (mobile.isNotEmpty) _infoRow('Mobile', mobile),
                if (city.isNotEmpty) _infoRow('City', city),
                if (categories.isNotEmpty) _infoRow('Categories', categories),
                _infoRow('Fingerprint', _b['fingerprint_status'] ?? 'PENDING'),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Action buttons
          Row(
            children: [
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: _loading ? null : _checkIn,
                  icon: _loading
                      ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : const Icon(Icons.how_to_reg, size: 18),
                  label: const Text('Check In'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: _loading ? null : _issueBenefit,
                  icon: const Icon(Icons.inventory_2, size: 18),
                  label: const Text('Issue Benefit'),
                  style: ElevatedButton.styleFrom(backgroundColor: AppTheme.success),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: _enrollFingerprint,
            style: OutlinedButton.styleFrom(
              minimumSize: const Size.fromHeight(48),
              side: const BorderSide(color: AppTheme.secondary),
              foregroundColor: AppTheme.secondary,
            ),
            icon: const Icon(Icons.fingerprint, size: 20),
            label: Text(
              'Enroll Fingerprint',
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
          ),
          const SizedBox(height: 12),

          // Assistance history
          if ((_b['assistance'] as List?)?.isNotEmpty == true)
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
                  const Text('Assistance History', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 8),
                  ...(_b['assistance'] as List).map((a) => Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Row(
                      children: [
                        const Icon(Icons.check_circle, size: 14, color: AppTheme.success),
                        const SizedBox(width: 8),
                        Expanded(child: Text(a['assistance_type'] ?? '', style: const TextStyle(fontSize: 13))),
                        Text(a['provided_date'] ?? '', style: const TextStyle(fontSize: 11, color: AppTheme.textSecondary)),
                      ],
                    ),
                  )),
                ],
              ),
            ),
        ],
      ),
    );
  }

  Widget _infoRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 100,
            child: Text(label, style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary, fontWeight: FontWeight.w500)),
          ),
          Expanded(child: Text(value, style: const TextStyle(fontSize: 13))),
        ],
      ),
    );
  }
}
