import 'package:flutter/material.dart';

import '../../core/constants.dart';
import '../../core/formatters.dart';
import '../../core/theme.dart';
import '../../models/metro.dart';
import '../../models/machine.dart';
import '../../services/machine_service.dart';
import '../../services/metro_service.dart';
import '../../state/app_state.dart';
import '../widgets/data_table.dart';
import '../widgets/filter_bar.dart';
import '../widgets/modals.dart';
import '../widgets/status_badge.dart';
import 'machine_detail_screen.dart';
import 'paged_list_screen.dart';

Future<List<MetroLine>> loadLines() async {
  try {
    return await MetroLineService.getAll(params: {'limit': 1000}).then((p) => p.items);
  } catch (_) {
    return const [];
  }
}

Future<List<Station>> loadStations() async {
  try {
    return await StationService.getAll(params: {'limit': 1000}).then((p) => p.items);
  } catch (_) {
    return const [];
  }
}

Future<List<Machine>> loadAllMachines() async {
  try {
    return await MachineService.getAll(params: {'limit': 1000}).then((p) => p.items);
  } catch (_) {
    return const [];
  }
}

class MachinesScreen extends StatefulWidget {
  const MachinesScreen({super.key});
  @override
  State<MachinesScreen> createState() => _MachinesScreenState();
}

class _MachinesScreenState extends State<MachinesScreen> {
  @override
  Widget build(BuildContext context) {
    return PagedListScreen<Machine>(
      slug: 'machines',
      title: 'Machines',
      subtitle: 'Manage machines across stations',
      filters: [
        const FilterDef(key: 'search', label: 'Machines', type: FilterType.search),
        FilterDef(
          key: 'status',
          label: 'Status',
          options: AppConstants.machineStatuses.map((s) => humanizeLabel(s)).toList(),
        ),
        const FilterDef(
          key: 'line_id',
          label: 'Line',
          options: AppConstants.displayLineIds,
        ),
      ],
      addLabel: 'Add Machine',
      canAdd: () => AppState.auth.canManage,
      onAdd: _addMachine,
      onRowTap: (m) => Navigator.push(
        context,
        MaterialPageRoute(builder: (_) => MachineDetailScreen(id: m.id)),
      ),
      fetch: (page, limit, filters) async {
        final params = <String, dynamic>{'page': page, 'limit': limit};
        final search = filters['search'];
        final status = filters['status'];
        final line = filters['line_id'];
        if (search != null && search.isNotEmpty) params['search'] = search;
        if (status != null && status.isNotEmpty) params['status'] = status;
        if (line != null && line.isNotEmpty) params['line_id'] = line;
        return MachineService.getAll(params: params);
      },
      columns: () => [
        TableColumn<Machine>('Machine', cell: (c, m) => cellText(m.machineId, bold: true)),
        TableColumn<Machine>('Station', cell: (c, m) => cellText(m.stationName)),
        TableColumn<Machine>('Line', cell: (c, m) => lineCell(m.lineName)),
        TableColumn<Machine>(
          'Stock',
          cell: (c, m) => Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              cellText('${m.currentStock ?? 0}/${m.capacity ?? 0}'),
              const SizedBox(width: 6),
              StatusBadge(stockLevel(m.currentStock)),
            ],
          ),
        ),
        TableColumn<Machine>('Status', cell: (c, m) => statusCell(m.status)),
        TableColumn<Machine>(
          '',
          cell: (c, m) => RowActions([
            IconActionButton(
              Icons.more_vert,
              onTap: () => _showActions(c, m),
            ),
          ]),
        ),
      ],
    );
  }

  Future<void> _addMachine(BuildContext context) async {
    final lines = await loadLines();
    final stations = await loadStations();
    if (!context.mounted) return;
    final machineId = TextEditingController();
    String? lineId = lines.isNotEmpty ? lines.first.id : null;
    String? stationId = stations.isNotEmpty ? stations.first.id : null;
    final location = TextEditingController();
    final capacity = TextEditingController(text: '200');
    final threshold = TextEditingController(text: '10');
    String machineType = AppConstants.machineTypes.first;
    String status = 'ACTIVE';

    await showFormModal(
      context,
      title: 'Add Machine',
      builder: (ctx, setState) {
        return SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Add Machine',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
              const SizedBox(height: 16),
              FormFieldWrap(
                label: 'Machine ID',
                required: true,
                child: TextField(controller: machineId),
              ),
              const SizedBox(height: 12),
              FormFieldWrap(
                label: 'Line',
                required: true,
                child: DropdownButtonFormField<String>(
                  initialValue: lineId,
                  isExpanded: true,
                  items: [
                    for (final l in lines)
                      DropdownMenuItem(value: l.id, child: Text(l.name)),
                  ],
                  onChanged: (v) => setState(() => lineId = v),
                ),
              ),
              const SizedBox(height: 12),
              FormFieldWrap(
                label: 'Station',
                required: true,
                child: DropdownButtonFormField<String>(
                  initialValue: stationId,
                  isExpanded: true,
                  items: [
                    for (final s in stations)
                      DropdownMenuItem(value: s.id, child: Text(s.name)),
                  ],
                  onChanged: (v) => setState(() => stationId = v),
                ),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: FormFieldWrap(
                      label: 'Location',
                      child: TextField(controller: location),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: FormFieldWrap(
                      label: 'Type',
                      child: DropdownButtonFormField<String>(
                        initialValue: machineType,
                        items: [
                          for (final t in AppConstants.machineTypes)
                            DropdownMenuItem(value: t, child: Text(t)),
                        ],
                        onChanged: (v) => setState(() => machineType = v!),
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
                      label: 'Capacity',
                      child: TextField(
                        controller: capacity,
                        keyboardType: TextInputType.number,
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: FormFieldWrap(
                      label: 'Low Stock Threshold',
                      child: TextField(
                        controller: threshold,
                        keyboardType: TextInputType.number,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              FormFieldWrap(
                label: 'Status',
                child: DropdownButtonFormField<String>(
                  initialValue: status,
                  items: [
                    for (final s in AppConstants.machineStatuses)
                      DropdownMenuItem(value: s, child: Text(humanizeLabel(s))),
                  ],
                  onChanged: (v) => setState(() => status = v!),
                ),
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
                      final err = validateRequired(machineId.text, 'Machine ID');
                      if (err != null || stationId == null) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(content: Text(err ?? 'Please select a station')),
                        );
                        return;
                      }
                      final msg = await apiRun(context, () async {
                        await MachineService.create(Machine.fromJson({
                          'machine_id': machineId.text.trim(),
                          'station_id': stationId,
                          'line_id': lineId,
                          'location': location.text.trim(),
                          'machine_type': machineType,
                          'capacity': int.tryParse(capacity.text) ?? 200,
                          'low_stock_threshold': int.tryParse(threshold.text) ?? 10,
                          'status': status,
                        }));
                      }, success: 'Machine created');
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
          ),
        );
      },
    );
  }

  void _showActions(BuildContext context, Machine m) {
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
                title: Text(m.machineId,
                    style: const TextStyle(fontWeight: FontWeight.w700)),
                subtitle: Text(m.stationName),
              ),
              const Divider(height: 1),
              if (AppState.auth.canManage)
                ListTile(
                  leading: const Icon(Icons.refresh),
                  title: const Text('Mark Refill'),
                  onTap: () {
                    Navigator.pop(ctx);
                    _addRefill(context, m);
                  },
                ),
              if (AppState.auth.canManage)
                ListTile(
                  leading: const Icon(Icons.toggle_on_outlined),
                  title: const Text('Change Status'),
                  onTap: () {
                    Navigator.pop(ctx);
                    _changeStatus(context, m);
                  },
                ),
              if (AppState.auth.isAdmin)
                ListTile(
                  leading: const Icon(Icons.delete_outline, color: AppColors.danger),
                  title: const Text('Delete', style: TextStyle(color: AppColors.danger)),
                  onTap: () async {
                    Navigator.pop(ctx);
                    final ok = await showConfirmDialog(
                      context,
                      title: 'Delete Machine',
                      message: 'Delete ${m.machineId}? This cannot be undone.',
                    );
                    if (!ok || !context.mounted) return;
                    final msg = await apiRun(
                      context,
                      () => MachineService.remove(m.id),
                      success: 'Machine deleted',
                    );
                    if (msg == null) {
                      Navigator.pop(context);
                    } else {
                      context.mounted
                          ? ScaffoldMessenger.of(context)
                              .showSnackBar(SnackBar(content: Text(msg)))
                          : null;
                    }
                  },
                ),
            ],
          ),
        );
      },
    );
  }

  Future<void> _addRefill(BuildContext context, Machine m) async {
    final qty = TextEditingController();
    final remark = TextEditingController();
    await showFormModal(
      context,
      title: 'Add Refill',
      builder: (ctx, setState) {
        return Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Refill — ${m.machineId}',
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
            const SizedBox(height: 4),
            Text(m.stationName,
                style: const TextStyle(color: AppColors.textLight, fontSize: 13)),
            const SizedBox(height: 16),
            FormFieldWrap(
              label: 'Refill Quantity',
              required: true,
              child: TextField(controller: qty, keyboardType: TextInputType.number),
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
                    final q = int.tryParse(qty.text.trim());
                    if (q == null || q <= 0) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Enter a valid quantity')),
                      );
                      return;
                    }
                    final msg = await apiRun(context, () async {
                      await RefillService.create({
                        'machine_id': m.id,
                        'refill_quantity': q,
                        'remark': remark.text.trim(),
                        'refill_date':
                            DateTime.now().toIso8601String().substring(0, 10),
                        'reported_by': AppState.auth.user?.email,
                      });
                    }, success: 'Refill recorded');
                    if (msg == null) {
                      Navigator.pop(ctx);
                    } else {
                      ScaffoldMessenger.of(context)
                          .showSnackBar(SnackBar(content: Text(msg)));
                    }
                  },
                  child: const Text('Save Refill'),
                ),
              ],
            ),
          ],
        );
      },
    );
  }

  Future<void> _changeStatus(BuildContext context, Machine m) async {
    final reason = TextEditingController();
    String status = m.status;
    await showFormModal(
      context,
      title: 'Change Status',
      builder: (ctx, setState) {
        return Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Change Status',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
            const SizedBox(height: 16),
            FormFieldWrap(
              label: 'Status',
              child: DropdownButtonFormField<String>(
                initialValue: status,
                items: [
                  for (final s in AppConstants.machineStatuses)
                    DropdownMenuItem(value: s, child: Text(humanizeLabel(s))),
                ],
                onChanged: (v) => setState(() => status = v!),
              ),
            ),
            const SizedBox(height: 12),
            FormFieldWrap(
              label: 'Reason',
              child: TextField(controller: reason),
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
                    final msg = await apiRun(
                      context,
                      () => MachineService.changeStatus(
                          m.id, status, reason.text.trim()),
                      success: 'Status updated',
                    );
                    if (msg == null) {
                      Navigator.pop(ctx);
                    } else {
                      ScaffoldMessenger.of(context)
                          .showSnackBar(SnackBar(content: Text(msg)));
                    }
                  },
                  child: const Text('Update'),
                ),
              ],
            ),
          ],
        );
      },
    );
  }
}