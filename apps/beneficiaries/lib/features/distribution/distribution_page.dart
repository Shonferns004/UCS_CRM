import '../../core/lucide_icons.dart';
import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_skeleton.dart';
import '../../services/api_service.dart';
import '../beneficiaries/qr_scanner_page.dart';

class DistributionPage extends StatefulWidget {
  const DistributionPage({super.key});

  @override
  State<DistributionPage> createState() => _DistributionPageState();
}

class _DistributionPageState extends State<DistributionPage> {
  List<dynamic> _distributions = [];
  bool _loading = true;
  String? _selectedProgramId;

  @override
  void initState() {
    super.initState();
    _loadDistributions();
  }

  Future<void> _loadDistributions() async {
    setState(() => _loading = true);
    try {
      final result = await ApiService.get('/distributions', queryParams: {
        'program_id': ?_selectedProgramId,
      });
      setState(() => _distributions = result['data'] ?? result['distributions'] ?? []);
    } catch (_) {}
    setState(() => _loading = false);
  }

  Future<void> _issueBenefit() async {
    Navigator.push(context, MaterialPageRoute(builder: (_) => const QrScannerPage()));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Distributions'),
        actions: [
          IconButton(
            onPressed: _issueBenefit,
            icon: const Icon(LucideIcons.scanLine),
            tooltip: 'Scan & Issue',
          ),
        ],
      ),
body: _loading
          ? const SkeletonList()
          : RefreshIndicator(
              onRefresh: _loadDistributions,
child: _distributions.isEmpty
                  ? ListView(
                      padding: const EdgeInsets.symmetric(vertical: 60, horizontal: 24),
                      children: [
                        Icon(LucideIcons.package, size: 44, color: AppTheme.textSecondary.withAlpha(120)),
                        const SizedBox(height: 12),
                        const Text('No distributions yet',
                            textAlign: TextAlign.center,
                            style: TextStyle(fontSize: 15, color: AppTheme.textSecondary)),
                      ],
                    )
                  : ListView.separated(
                      padding: const EdgeInsets.all(16),
                      itemCount: _distributions.length,
                      separatorBuilder: (_, _) => const SizedBox(height: 8),
                      itemBuilder: (ctx, i) => _distributionCard(_distributions[i]),
                    ),
            ),
    );
  }

  Widget _distributionCard(Map<String, dynamic> d) {
    final number = d['distribution_number'] ?? '';
    final beneficiary = d['beneficiaries']?['full_name'] ?? d['beneficiary_code'] ?? '';
    final date = d['distribution_date'] ?? '';
    final status = d['status'] ?? 'PENDING';
    final items = (d['items'] as List?) ?? [];

    Color statusColor;
    switch (status) {
      case 'COMPLETED': statusColor = AppTheme.success; break;
      case 'PARTIAL': statusColor = AppTheme.warning; break;
      case 'CANCELLED': statusColor = AppTheme.error; break;
      default: statusColor = AppTheme.secondary;
    }

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppTheme.outline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(beneficiary, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: statusColor.withAlpha(25),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(status, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: statusColor)),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(number, style: const TextStyle(fontSize: 11, color: AppTheme.textSecondary)),
          Text(date, style: const TextStyle(fontSize: 11, color: AppTheme.textSecondary)),
          if (items.isNotEmpty) ...[
            const SizedBox(height: 8),
            Wrap(
              spacing: 6,
              runSpacing: 4,
              children: items.map((item) => Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: AppTheme.surface,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text('${item['item_name'] ?? item['name'] ?? ''}', style: const TextStyle(fontSize: 10)),
              )).toList(),
            ),
          ],
        ],
      ),
    );
  }
}


