import 'package:flutter/material.dart';

import '../../core/constants.dart';
import '../../core/formatters.dart';
import '../../core/theme.dart';
import '../../models/refill.dart';
import '../../services/stock_service.dart';
import '../../state/app_state.dart';
import '../widgets/data_table.dart';
import '../widgets/filter_bar.dart';
import '../widgets/modals.dart';
import 'paged_list_screen.dart';

class MaintenanceScreen extends StatelessWidget {
  const MaintenanceScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return PagedListScreen<MaintenanceRecord>(
      slug: 'maintenance',
      title: 'Maintenance',
      subtitle: 'Machine maintenance & repair records',
      filters: [
        const FilterDef(key: 'search', label: 'Machines', type: FilterType.search),
        FilterDef(
          key: 'status',
          label: 'Status',
          options: AppConstants.maintenanceStatuses.map((s) => humanizeLabel(s)).toList(),
        ),
      ],
      fetch: (page, limit, filters) async {
        final params = <String, dynamic>{'page': page, 'limit': limit};
        final search = filters['search'];
        final status = filters['status'];
        if (search != null && search.isNotEmpty) params['search'] = search;
        if (status != null && status.isNotEmpty) {
          params['status'] = AppConstants.maintenanceStatuses.firstWhere(
            (s) => humanizeLabel(s) == status,
            orElse: () => status,
          );
        }
        return MaintenanceService.getAll(params: params);
      },
      addLabel: 'Add Record',
      canAdd: () => AppState.auth.canManage,
      onAdd: _addRecord,
      onRowTap: (r) => _actions(context, r),
      columns: () => [
        TableColumn<MaintenanceRecord>('Date', cell: (c, r) => cellText(formatDateStr(r.reportedDate))),
        TableColumn<MaintenanceRecord>('Machine', cell: (c, r) => cellText(r.machineCode, bold: true)),
        TableColumn<MaintenanceRecord>('Station', cell: (c, r) => cellText(r.stationName)),
        TableColumn<MaintenanceRecord>('Problem', cell: (c, r) => cellText(r.problem)),
        TableColumn<MaintenanceRecord>('Priority', cell: (c, r) => statusCell(r.priority)),
        TableColumn<MaintenanceRecord>('Technician', cell: (c, r) => cellText(r.technician)),
        TableColumn<MaintenanceRecord>('Status', cell: (c, r) => statusCell(r.status)),
      ],
    );
  }

  Future<void> _addRecord(BuildContext context) async {
    if (!context.mounted) return;
    final machineId = TextEditingController();
    final problem = TextEditingController();
    final technician = TextEditingController();
    final remark = TextEditingController();
    String? priority = 'MEDIUM';
    await showFormModal(
      context,
      title: 'Add Maintenance Record',
      builder: (ctx, setState) {
        return Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Add Maintenance Record',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
            const SizedBox(height: 16),
            FormFieldWrap(
              label: 'Machine',
              required: true,
              child: TextField(controller: machineId),
            ),
            const SizedBox(height: 12),
            FormFieldWrap(
              label: 'Problem',
              required: true,
              child: TextField(controller: problem),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: FormFieldWrap(
                    label: 'Priority',
                    child: DropdownButtonFormField<String>(
                      initialValue: priority,
                      items: [
                        for (final p in AppConstants.maintenancePriorities)
                          DropdownMenuItem(value: p, child: Text(humanizeLabel(p))),
                      ],
                      onChanged: (v) => setState(() => priority = v!),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: FormFieldWrap(
                    label: 'Technician',
                    child: TextField(controller: technician),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            FormFieldWrap(
              label: 'Remark',
              child: TextField(controller: remark),
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
                      await MaintenanceService.create({
                        'machine_id': machineId.text.trim(),
                        'problem': problem.text.trim(),
                        'priority': priority,
                        'technician': technician.text.trim(),
                        'remark': remark.text.trim(),
                        'reported_date':
                            DateTime.now().toIso8601String().substring(0, 10),
                        'reported_by': AppState.auth.user?.email,
                      });
                    }, success: 'Maintenance record created');
                    if (msg == null) {
                      Navigator.pop(ctx);
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
        );
      },
    );
  }

  Future<void> _actions(BuildContext context, MaintenanceRecord record) async {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: AppColors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) {
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                title: Text(record.machineCode,
                    style: const TextStyle(fontWeight: FontWeight.w700)),
                subtitle: Text(record.problem),
              ),
              const Divider(height: 1),
              for (final s in ['IN_PROGRESS', 'RESOLVED', 'CLOSED'])
                ListTile(
                  leading: Icon(Icons.circle, color: statusColor(s), size: 12),
                  title: Text('Set status: ${humanizeLabel(s)}'),
                  onTap: () async {
                    Navigator.pop(ctx);
                    if (!AppState.auth.canManage) return;
                    final msg = await apiRun(
                      context,
                      () => MaintenanceService.update(record.id, {'status': s}),
                      success: 'Status updated',
                    );
                    if (msg != null) {
                      ScaffoldMessenger.of(context)
                          .showSnackBar(SnackBar(content: Text(msg)));
                    }
                  },
                ),
            ],
          ),
        );
      },
    );
  }
}