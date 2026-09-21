import 'package:flutter/material.dart';

import '../../core/api_client.dart';
import '../../core/constants.dart';
import '../../core/formatters.dart';
import '../../core/theme.dart';
import '../../models/machine.dart';
import '../../models/refill.dart';
import '../../services/machine_service.dart';
import '../../services/stock_service.dart';
import '../widgets/common.dart';
import '../widgets/data_table.dart';

class MachineDetailScreen extends StatefulWidget {
  final String id;
  const MachineDetailScreen({super.key, required this.id});
  @override
  State<MachineDetailScreen> createState() => _MachineDetailScreenState();
}

class _MachineDetailScreenState extends State<MachineDetailScreen> {
  bool _loading = true;
  Object? _error;
  Machine? _machine;
  List<Refill> _refills = [];
  List<MachineStatusHistory> _history = [];
  List<StockIssue> _issues = [];
  List<MaintenanceRecord> _maintenance = [];

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
      final m = await MachineService.getById(widget.id);
      final results = await Future.wait([
        RefillService.getByMachine(widget.id).catchError((_) => <Refill>[]),
        MachineService.getStatusHistory(widget.id).then((p) => p.items).catchError((_) => <MachineStatusHistory>[]),
        StockIssueService.getByMachine(widget.id).catchError((_) => <StockIssue>[]),
        MaintenanceService.getByMachine(widget.id).catchError((_) => <MaintenanceRecord>[]),
      ]);
      if (!mounted) return;
      setState(() {
        _machine = m;
        _refills = results[0] as List<Refill>;
        _history = results[1] as List<MachineStatusHistory>;
        _issues = results[2] as List<StockIssue>;
        _maintenance = results[3] as List<MaintenanceRecord>;
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
    return DefaultTabController(
      length: 4,
      child: Scaffold(
        appBar: AppBar(
          leading: IconButton(
            icon: const Icon(Icons.arrow_back),
            onPressed: () => Navigator.pop(context),
          ),
          title: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(_machine?.machineId ?? 'Machine'),
              if (_machine != null)
                Text(
                  _machine!.stationName,
                  style: const TextStyle(fontSize: 12, color: AppColors.textLight),
                ),
            ],
          ),
          bottom: const TabBar(
            isScrollable: true,
            tabs: [
              Tab(text: 'Overview'),
              Tab(text: 'Refills'),
              Tab(text: 'Status History'),
              Tab(text: 'Issues & Maintenance'),
            ],
          ),
        ),
        body: _loading
            ? const LoadingSpinner(message: 'Loading machine...')
            : _error != null
                ? ErrorState(
                    message: toApiException(_error!).message, onRetry: _load)
                : TabBarView(
                    children: [
                      _overview(),
                      _refillsTab(),
                      _historyTab(),
                      _issuesTab(),
                    ],
                  ),
      ),
    );
  }

  Widget _overview() {
    final m = _machine!;
    final pct = m.stockPercentage;
    return ListView(
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
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(m.machineId,
                        style: const TextStyle(
                            fontSize: 16, fontWeight: FontWeight.w700)),
                    statusCell(m.status),
                  ],
                ),
                const SizedBox(height: 4),
                Text(m.location.isNotEmpty ? m.location : m.stationName,
                    style: const TextStyle(color: AppColors.textLight)),
                const SizedBox(height: 12),
                ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: LinearProgressIndicator(
                    value: (pct ?? 0) / 100,
                    minHeight: 10,
                    backgroundColor: AppColors.sidebarHover,
                    color: pct != null && pct <= AppConstants.lowStockThreshold
                        ? AppColors.warning
                        : AppColors.success,
                  ),
                ),
                const SizedBox(height: 6),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('${formatNumber(m.currentStock)} / ${formatNumber(m.capacity)} pads',
                        style: const TextStyle(fontSize: 13)),
                    Text('${(pct ?? 0).toStringAsFixed(0)}%',
                        style: const TextStyle(fontSize: 13)),
                  ],
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),
        GridView.count(
          crossAxisCount: MediaQuery.of(context).size.width > 700 ? 4 : 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 10,
          crossAxisSpacing: 10,
          childAspectRatio: 1.5,
          children: [
            KpiCard(title: 'Refills', value: '${m.refillCount}', icon: Icons.refresh, color: AppColors.info),
            KpiCard(title: 'Issues', value: '${m.issueCount}', icon: Icons.warning_amber, color: AppColors.warning),
            KpiCard(title: 'Maintenance', value: '${m.maintenanceCount}', icon: Icons.build, color: AppColors.orange),
            KpiCard(title: 'Type', value: m.machineType, icon: Icons.memory, color: AppColors.primary),
          ],
        ),
        const SizedBox(height: 16),
        _infoRow('Installation Date', formatDateStr(m.installationDate)),
        _infoRow('Last Refill', formatDateTimeStr(m.lastRefillAt)),
        _infoRow('Last Maintenance', formatDateTimeStr(m.lastMaintenanceAt)),
        _infoRow('Line', m.lineName),
        _infoRow('Station', m.stationName),
        _infoRow('Low Stock Threshold', '${m.lowStockThreshold ?? AppConstants.lowStockThreshold}'),
        if (m.remark.isNotEmpty) _infoRow('Remark', m.remark),
      ],
    );
  }

  Widget _infoRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 160,
            child: Text(label,
                style: const TextStyle(color: AppColors.textLight, fontSize: 13)),
          ),
          Expanded(
            child: Text(value == '—' || value.isEmpty ? '—' : value,
                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
          ),
        ],
      ),
    );
  }

  Widget _refillsTab() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        DataTableWidget<Refill>(
          items: _refills,
          columns: [
            TableColumn<Refill>('Date', cell: (c, r) => cellText(formatDateStr(r.refillDate))),
            TableColumn<Refill>('Previous', cell: (c, r) => cellText(formatNumber(r.previousStock))),
            TableColumn<Refill>('Refilled', cell: (c, r) => cellText(formatNumber(r.refillQuantity), bold: true)),
            TableColumn<Refill>('New Stock', cell: (c, r) => cellText(formatNumber(r.newStock))),
            TableColumn<Refill>('Cash', cell: (c, r) => cellText(formatRupee(r.cashCollected))),
            TableColumn<Refill>('By', cell: (c, r) => cellText(r.refilledBy)),
          ],
        ),
      ],
    );
  }

  Widget _historyTab() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        DataTableWidget<MachineStatusHistory>(
          items: _history,
          columns: [
            TableColumn<MachineStatusHistory>('Changed At', cell: (c, h) => cellText(formatDateTimeStr(h.changedAt))),
            TableColumn<MachineStatusHistory>('From', cell: (c, h) => statusCell(h.previousStatus)),
            TableColumn<MachineStatusHistory>('To', cell: (c, h) => statusCell(h.newStatus)),
            TableColumn<MachineStatusHistory>('Reason', cell: (c, h) => cellText(h.reason)),
            TableColumn<MachineStatusHistory>('By', cell: (c, h) => cellText(h.changedByName.isEmpty ? h.changedBy : h.changedByName)),
          ],
        ),
      ],
    );
  }

  Widget _issuesTab() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text('Stock Issues',
            style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
        const SizedBox(height: 8),
        DataTableWidget<StockIssue>(
          items: _issues,
          emptyMessage: 'No stock issues.',
          columns: [
            TableColumn<StockIssue>('Date', cell: (c, i) => cellText(formatDateStr(i.reportDate))),
            TableColumn<StockIssue>('Type', cell: (c, i) => cellText(i.issueType)),
            TableColumn<StockIssue>('Missing', cell: (c, i) => cellText(formatNumber(i.missingQuantity))),
            TableColumn<StockIssue>('Status', cell: (c, i) => statusCell(i.status)),
          ],
        ),
        const SizedBox(height: 16),
        const Text('Maintenance',
            style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
        const SizedBox(height: 8),
        DataTableWidget<MaintenanceRecord>(
          items: _maintenance,
          emptyMessage: 'No maintenance records.',
          columns: [
            TableColumn<MaintenanceRecord>('Date', cell: (c, r) => cellText(formatDateStr(r.reportedDate))),
            TableColumn<MaintenanceRecord>('Problem', cell: (c, r) => cellText(r.problem)),
            TableColumn<MaintenanceRecord>('Priority', cell: (c, r) => statusCell(r.priority)),
            TableColumn<MaintenanceRecord>('Status', cell: (c, r) => statusCell(r.status)),
          ],
        ),
      ],
    );
  }
}