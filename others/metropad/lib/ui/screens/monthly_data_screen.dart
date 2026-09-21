import 'package:flutter/material.dart';

import '../../core/api_client.dart';
import '../../core/constants.dart';
import '../../core/formatters.dart';
import '../../core/theme.dart';
import '../../models/monthly.dart';
import '../../services/admin_service.dart';
import '../../state/app_state.dart';
import '../layout/main_layout.dart';
import '../widgets/common.dart';
import '../widgets/data_table.dart';
import '../widgets/modals.dart';

class MonthlyDataScreen extends StatefulWidget {
  const MonthlyDataScreen({super.key});
  @override
  State<MonthlyDataScreen> createState() => _MonthlyDataScreenState();
}

class _MonthlyDataScreenState extends State<MonthlyDataScreen> {
  int _year = DateTime.now().year;
  int _month = DateTime.now().month;
  bool _loading = true;
  Object? _error;
  MonthlyRecordsResponse? _data;

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
      final data = await MonthlyDataService.getRecords(
        params: {'year': _year, 'month': _month},
      );
      if (!mounted) return;
      setState(() {
        _data = data;
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
    final s = _data?.summary ?? const {};
    return AppScaffold(
      selected: 'monthly-data',
      title: 'Monthly Data',
      subtitle: 'Monthly station & machine review records',
      actions: [
        if (AppState.auth.canManage)
          FilledButton.icon(
            onPressed: () => _addRecord(context),
            icon: const Icon(Icons.add, size: 18),
            label: const Text('Add Record'),
          ),
      ],
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Card(
              elevation: 0,
              margin: const EdgeInsets.only(bottom: 12),
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Row(
                  children: [
                    SizedBox(
                      width: 110,
                      child: DropdownButtonFormField<int>(
                        initialValue: _year,
                        decoration: const InputDecoration(isDense: true),
                        items: [
                          for (var y = DateTime.now().year; y >= 2024; y--)
                            DropdownMenuItem(value: y, child: Text('$y')),
                        ],
                        onChanged: (v) {
                          if (v == null) return;
                          setState(() => _year = v);
                          _load();
                        },
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: DropdownButtonFormField<int>(
                        initialValue: _month,
                        decoration: const InputDecoration(isDense: true),
                        items: [
                          for (var mo = 1; mo <= 12; mo++)
                            DropdownMenuItem(
                                value: mo, child: Text(AppConstants.months[mo - 1])),
                        ],
                        onChanged: (v) {
                          if (v == null) return;
                          setState(() => _month = v);
                          _load();
                        },
                      ),
                    ),
                  ],
                ),
              ),
            ),
            if (_loading)
              const LoadingSpinner(message: 'Loading monthly data...')
            else if (_error != null)
              ErrorState(
                  message: toApiException(_error!).message, onRetry: _load)
            else ...[
              GridView.count(
                crossAxisCount: MediaQuery.of(context).size.width > 700 ? 4 : 2,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                mainAxisSpacing: 10,
                crossAxisSpacing: 10,
                childAspectRatio: 1.5,
                children: [
                  KpiCard(title: 'Machines', value: formatNumber(num.tryParse('${s['totalMachines'] ?? ''}')), icon: Icons.memory, color: AppColors.primary),
                  KpiCard(title: 'Pads Refilled', value: formatNumber(num.tryParse('${s['totalPads'] ?? ''}')), icon: Icons.refresh, color: AppColors.info),
                  KpiCard(title: 'Cash Collected (₹)', value: formatRupee(num.tryParse('${s['totalCash'] ?? ''}')), icon: Icons.payments, color: AppColors.success),
                  KpiCard(title: 'Records', value: formatNumber(num.tryParse('${s['totalCount'] ?? ''}')), icon: Icons.receipt_long, color: AppColors.teal),
                ],
              ),
              const SizedBox(height: 16),
              DataTableWidget<MonthlyRecord>(
                items: _data!.rows,
                emptyMessage: 'No records for this month.',
                columns: [
                  TableColumn<MonthlyRecord>('Date', cell: (c, r) => cellText(formatDateStr(r.recordDate))),
                  TableColumn<MonthlyRecord>('Station', cell: (c, r) => cellText(r.stationName, bold: true)),
                  TableColumn<MonthlyRecord>('Machine', cell: (c, r) => cellText(r.machineId)),
                  TableColumn<MonthlyRecord>('Status', cell: (c, r) => statusCell(r.machineStatus)),
                  TableColumn<MonthlyRecord>('Pads Refilled', cell: (c, r) => cellText(formatNumber(r.padsRefilled))),
                  TableColumn<MonthlyRecord>('Cash (₹)', cell: (c, r) => cellText(formatRupee(r.cashCollected))),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  Future<void> _addRecord(BuildContext context) async {
    final cash = TextEditingController();
    final pads = TextEditingController();
    final notes = TextEditingController();
    final machineId = TextEditingController();
    final stationId = TextEditingController();
    String status = 'WORKING';
    String issue = 'NONE';
    await showFormModal(
      context,
      title: 'Add Monthly Record',
      builder: (ctx, setState) {
        return SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Add Monthly Record',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: FormFieldWrap(
                      label: 'Station ID',
                      child: TextField(controller: stationId),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: FormFieldWrap(
                      label: 'Machine ID',
                      child: TextField(controller: machineId),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: FormFieldWrap(
                      label: 'Machine Status',
                      child: DropdownButtonFormField<String>(
                        initialValue: status,
                        items: [
                          for (final t in AppConstants.monthlyMachineStatuses)
                            DropdownMenuItem(value: t, child: Text(humanizeLabel(t))),
                        ],
                        onChanged: (v) => setState(() => status = v!),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: FormFieldWrap(
                      label: 'Issue Type',
                      child: DropdownButtonFormField<String>(
                        initialValue: issue,
                        items: [
                          for (final t in AppConstants.monthlyIssueTypes)
                            DropdownMenuItem(value: t, child: Text(humanizeLabel(t))),
                        ],
                        onChanged: (v) => setState(() => issue = v!),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: FormFieldWrap(
                      label: 'Pads Refilled',
                      child: TextField(controller: pads, keyboardType: TextInputType.number),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: FormFieldWrap(
                      label: 'Cash Collected (₹)',
                      child: TextField(controller: cash, keyboardType: TextInputType.number),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              FormFieldWrap(
                label: 'Notes',
                child: TextField(controller: notes, maxLines: 2),
              ),
              const SizedBox(height: 20),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  OutlinedButton(
                    onPressed: () => Navigator.pop(ctx),
                    child: const Text('Cancel'),
                  ),
                  const SizedBox(width: 10),
                  FilledButton(
                    onPressed: () async {
                      final msg = await apiRun(context, () async {
                        await MonthlyDataService.create({
                          'year_month': '$_year-${_month.toString().padLeft(2, '0')}',
                          'record_date': '$_year-${_month.toString().padLeft(2, '0')}-15',
                          'station_id': stationId.text.trim(),
                          'machine_id': machineId.text.trim(),
                          'machine_status': status,
                          'issue_type': issue,
                          'pads_refilled': int.tryParse(pads.text.trim()),
                          'cash_collected': int.tryParse(cash.text.trim()),
                          'notes': notes.text.trim(),
                          'recorded_by': AppState.auth.user?.email,
                        });
                      }, success: 'Record added');
                      if (msg == null) {
                        Navigator.pop(ctx);
                        _load();
                      } else {
                        ScaffoldMessenger.of(context)
                            .showSnackBar(SnackBar(content: Text(msg)));
                      }
                    },
                    child: const Text('Save'),
                  ),
                ],
              ),
            ],
          ),
        );
      },
    );
  }
}