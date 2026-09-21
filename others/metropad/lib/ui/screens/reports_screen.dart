import 'package:flutter/material.dart';

import '../../core/api_client.dart';
import '../../core/constants.dart';
import '../../core/formatters.dart';
import '../../core/theme.dart';
import '../../services/admin_service.dart';
import '../layout/main_layout.dart';
import '../widgets/common.dart';

class ReportsScreen extends StatefulWidget {
  const ReportsScreen({super.key});
  @override
  State<ReportsScreen> createState() => _ReportsScreenState();
}

class _ReportsScreenState extends State<ReportsScreen> {
  String _type = 'station';
  String? _id;
  bool _loading = false;
  Map<String, dynamic>? _result;
  Object? _error;

  Future<void> _generate() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final params = <String, dynamic>{};
      if (_id != null && _id!.isNotEmpty) params['id'] = _id;
      final res = await ReportService.getReport(_type, params: params);
      if (!mounted) return;
      setState(() {
        _result = res;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppScaffold(
      selected: 'reports',
      title: 'Reports',
      subtitle: 'Generate station, machine & network reports',
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            elevation: 0,
            margin: EdgeInsets.zero,
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Report Type',
                      style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 8),
                  DropdownButtonFormField<String>(
                    initialValue: _type,
                    items: [
                      for (final t in AppConstants.reportTypes)
                        DropdownMenuItem(value: t, child: Text(toTitleCase(t))),
                    ],
                    onChanged: (v) => setState(() => _type = v!),
                  ),
                  const SizedBox(height: 14),
                  TextField(
                    onChanged: (v) => setState(() => _id = v),
                    decoration: const InputDecoration(
                      isDense: true,
                      labelText: 'ID (optional)',
                      hintText: 'Station / machine / line id',
                    ),
                  ),
                  const SizedBox(height: 14),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: _loading ? null : _generate,
                          icon: const Icon(Icons.receipt_long, size: 18),
                          label: const Text('Generate'),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: () {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                  content: Text(
                                      'File export will be available on desktop builds')),
                            );
                          },
                          icon: const Icon(Icons.download, size: 18),
                          label: const Text('Export'),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          if (_loading)
            const LoadingSpinner(message: 'Generating report...')
          else if (_error != null)
            ErrorState(
                message: toApiException(_error!).message, onRetry: _generate)
          else if (_result != null)
            Card(
              elevation: 0,
              margin: EdgeInsets.zero,
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(toTitleCase('$_type report'),
                        style: const TextStyle(
                            fontSize: 15, fontWeight: FontWeight.w700)),
                    const SizedBox(height: 12),
                    _kv('Total Machines', '${_result!['totalMachines'] ?? '—'}'),
                    _kv('Active', '${_result!['activeMachines'] ?? '—'}'),
                    _kv('Inactive', '${_result!['inactiveMachines'] ?? '—'}'),
                    _kv('Maintenance', '${_result!['maintenanceMachines'] ?? '—'}'),
                    _kv('Low Stock', '${_result!['lowStockMachines'] ?? '—'}'),
                    _kv('Total Refills (Month)',
                        '${_result!['refillsThisMonth'] ?? '—'}'),
                    _kv('Pads Refilled (Month)',
                        '${_result!['padsRefilledThisMonth'] ?? '—'}'),
                    _kv('Total Stations', '${_result!['totalStations'] ?? '—'}'),
                    _kv('Total Lines', '${_result!['totalLines'] ?? '—'}'),
                    const SizedBox(height: 12),
                    if (_result!.isNotEmpty)
                      Text(jsonPreview(_result!),
                          style: const TextStyle(
                              fontSize: 11,
                              color: AppColors.textLight,
                              fontFamily: 'monospace')),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _kv(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        children: [
          SizedBox(width: 190, child: Text(label, style: const TextStyle(color: AppColors.textLight, fontSize: 13))),
          Expanded(child: Text(value, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600))),
        ],
      ),
    );
  }

  String jsonPreview(Map<String, dynamic> map) {
    final lines = map.entries.map((e) => '  ${e.key}: ${e.value}');
    return '{\n${lines.join(',\n')}\n}';
  }
}