import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../services/fro_api.dart';
import '../theme.dart';
import '../widgets/skeleton.dart';

class LeadIncentivePage extends StatefulWidget {
  const LeadIncentivePage({super.key});

  @override
  State<LeadIncentivePage> createState() => _LeadIncentivePageState();
}

class _LeadIncentivePageState extends State<LeadIncentivePage> {
  String _date = DateFormat('yyyy-MM-dd').format(DateTime.now());
  Map<String, dynamic>? _summary;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final r = await FroApi.leadIncentiveSummary(_date);
      if (!mounted) return;
      setState(() {
        _summary = r;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Lead Incentive')),
      body: _loading
          ? ListView(
              padding: const EdgeInsets.all(16),
              children: const [SkeletonBlock(height: 120)],
            )
          : _error != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(_error!, textAlign: TextAlign.center, style: const TextStyle(fontSize: 13, color: AppColors.inkSoft)),
                        const SizedBox(height: 12),
                        ElevatedButton(onPressed: _load, child: const Text('Retry')),
                      ],
                    ),
                  ),
                )
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      Row(
                        children: [
                          IconButton(
                            icon: const Icon(Icons.chevron_left),
                            onPressed: () {
                              final d = DateTime.tryParse(_date) ?? DateTime.now();
                              setState(() => _date = DateFormat('yyyy-MM-dd').format(d.subtract(const Duration(days: 1))));
                              _load();
                            },
                          ),
                          Expanded(
                            child: Text(
                              DateFormat('dd MMM yyyy').format(DateTime.parse(_date)),
                              textAlign: TextAlign.center,
                              style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
                            ),
                          ),
                          IconButton(
                            icon: const Icon(Icons.chevron_right),
                            onPressed: () {
                              final d = DateTime.tryParse(_date) ?? DateTime.now();
                              setState(() => _date = DateFormat('yyyy-MM-dd').format(d.add(const Duration(days: 1))));
                              _load();
                            },
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(20),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: AppColors.line),
                        ),
                        child: Column(
                          children: [
                            const Text('Total Incentive', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.inkSoft)),
                            const SizedBox(height: 6),
                            Text(
                              formatCurrency((_summary?['total'] ?? _summary?['incentive']) as num?),
                              style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w800, color: AppColors.sage),
                            ),
                            if (_summary?['leads'] != null) ...[
                              const SizedBox(height: 8),
                              Text(
                                '${_summary!['leads']} leads',
                                style: const TextStyle(fontSize: 13, color: AppColors.inkSoft),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
    );
  }
}
