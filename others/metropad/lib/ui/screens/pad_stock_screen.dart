import 'package:flutter/material.dart';

import '../../core/api_client.dart';
import '../../core/constants.dart';
import '../../core/formatters.dart';
import '../../core/theme.dart';
import '../../models/stock.dart';
import '../../services/stock_service.dart';
import '../layout/main_layout.dart';
import '../widgets/common.dart';
import '../widgets/data_table.dart';

class PadStockScreen extends StatefulWidget {
  const PadStockScreen({super.key});
  @override
  State<PadStockScreen> createState() => _PadStockScreenState();
}

class _PadStockScreenState extends State<PadStockScreen> {
  bool _loading = true;
  Object? _error;
  StockSummary? _summary;
  MonthlyStock? _monthly;
  List<StationStock> _stationWise = [];
  int _year = DateTime.now().year;
  int _month = DateTime.now().month;

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
      final results = await Future.wait([
        StockService.getSummary(),
        StockService.getStationWise(),
        StockService.getMonthly(_year, _month),
      ]);
      if (!mounted) return;
      setState(() {
        _summary = results[0] as StockSummary;
        _stationWise = results[1] as List<StationStock>;
        _monthly = results[2] as MonthlyStock;
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

  Future<void> _loadMonthly() async {
    try {
      final m = await StockService.getMonthly(_year, _month);
      if (!mounted) return;
      setState(() => _monthly = m);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(toApiException(e).message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: AppScaffold(
        selected: 'pad-stock',
        title: 'Pad Stock',
        subtitle: 'Central & machine-level pad inventory',
        body: Column(
          children: [
            Container(
              color: AppColors.white,
              child: const TabBar(
                tabs: [Tab(text: 'Overview'), Tab(text: 'Monthly')],
              ),
            ),
            Expanded(
              child: _loading
                  ? const LoadingSpinner(message: 'Loading stock...')
                  : _error != null
                      ? ErrorState(
                          message: toApiException(_error!).message,
                          onRetry: _load,
                        )
                      : TabBarView(
                          children: [_overviewTab(), _monthlyTab()],
                        ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _overviewTab() {
    final s = _summary!;
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          GridView.count(
            crossAxisCount: MediaQuery.of(context).size.width > 700 ? 4 : 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 10,
            crossAxisSpacing: 10,
            childAspectRatio: 1.5,
            children: [
              KpiCard(title: 'Initial Stock', value: formatNumber(s.initialStock), icon: Icons.inventory_2, color: AppColors.primary),
              KpiCard(title: 'Distributed', value: formatNumber(s.totalDistributed), icon: Icons.local_shipping, color: AppColors.info),
              KpiCard(title: 'Distributed (₹)', value: formatRupee(s.totalDistributed), icon: Icons.currency_rupee, color: AppColors.success),
              KpiCard(title: 'Remaining Central', value: formatNumber(s.remainingCentral), icon: Icons.warehouse, color: AppColors.warning),
              KpiCard(title: 'Machine Pads', value: formatNumber(s.totalMachinePads), icon: Icons.memory, color: AppColors.teal),
              KpiCard(title: 'Value in Machines (₹)', value: formatRupee(s.totalMachineValue), icon: Icons.money, color: AppColors.purple),
              KpiCard(title: 'Low Stock', value: formatNumber(s.lowStockMachines), icon: Icons.warning_amber, color: AppColors.warning),
              KpiCard(title: 'Empty', value: formatNumber(s.emptyMachines), icon: Icons.block, color: AppColors.danger),
            ],
          ),
          const SizedBox(height: 16),
          const Text('Station-wise Stock',
              style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          DataTableWidget<StationStock>(
            items: _stationWise,
            columns: [
              TableColumn<StationStock>('Machine', cell: (c, r) => cellText(r.machineId, bold: true)),
              TableColumn<StationStock>('Station', cell: (c, r) => cellText(r.stationName)),
              TableColumn<StationStock>('Stock', cell: (c, r) => cellText(formatNumber(r.currentStock))),
              TableColumn<StationStock>('Capacity', cell: (c, r) => cellText(formatNumber(r.capacity))),
              TableColumn<StationStock>('Stock Value (₹)', cell: (c, r) => cellText(formatRupee(r.stockValue))),
              TableColumn<StationStock>('Status', cell: (c, r) => statusCell(r.stockStatus)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _monthlyTab() {
    final m = _monthly!;
    final dist = m.distributedInMonth ?? 0;
    return RefreshIndicator(
      onRefresh: _loadMonthly,
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
                        _loadMonthly();
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
                          DropdownMenuItem(value: mo, child: Text(AppConstants.months[mo - 1])),
                      ],
                      onChanged: (v) {
                        if (v == null) return;
                        setState(() => _month = v);
                        _loadMonthly();
                      },
                    ),
                  ),
                ],
              ),
            ),
          ),
          GridView.count(
            crossAxisCount: MediaQuery.of(context).size.width > 700 ? 4 : 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 10,
            crossAxisSpacing: 10,
            childAspectRatio: 1.5,
            children: [
              KpiCard(title: 'Opening Central', value: formatNumber(m.openingCentral), icon: Icons.warehouse_outlined, color: AppColors.primary),
              KpiCard(title: 'Distributed (Month)', value: formatNumber(dist), icon: Icons.local_shipping, color: AppColors.info),
              KpiCard(title: 'Distributed (₹)', value: formatRupee(m.distributedMonthValue), icon: Icons.sell, color: AppColors.success),
              KpiCard(title: 'Closing Central', value: formatNumber(m.closingCentral), icon: Icons.inventory, color: AppColors.warning),
              KpiCard(title: 'Machine Pads', value: formatNumber(m.totalMachinePads), icon: Icons.memory, color: AppColors.teal),
              KpiCard(title: 'Machine Value (₹)', value: formatRupee(m.totalMachineValue), icon: Icons.money, color: AppColors.purple),
              KpiCard(title: 'Cash Collected (₹)', value: formatRupee(m.totalCashCollected), icon: Icons.payments, color: AppColors.success),
              KpiCard(title: 'Pending Refill', value: formatNumber(m.machinesPending), icon: Icons.schedule, color: AppColors.orange),
            ],
          ),
          const SizedBox(height: 16),
          const Text('Machine-wise Refills',
              style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          DataTableWidget<MonthlyStationStock>(
            items: m.stationList,
            emptyMessage: 'No monthly refill data for this month.',
            columns: [
              TableColumn<MonthlyStationStock>('Date', cell: (c, r) => cellText(r.refillDate)),
              TableColumn<MonthlyStationStock>('Machine', cell: (c, r) => cellText(r.machineId, bold: true)),
              TableColumn<MonthlyStationStock>('Station', cell: (c, r) => cellText(r.stationName)),
              TableColumn<MonthlyStationStock>('Quantity', cell: (c, r) => cellText(formatNumber(r.refillQuantity))),
              TableColumn<MonthlyStationStock>('Value (₹)', cell: (c, r) => cellText(formatRupee(r.stockValue))),
              TableColumn<MonthlyStationStock>('Cash (₹)', cell: (c, r) => cellText(formatRupee(r.cashCollected))),
              TableColumn<MonthlyStationStock>('Status', cell: (c, r) => statusCell(r.machineStatus.isEmpty ? 'PENDING' : r.machineStatus)),
            ],
          ),
        ],
      ),
    );
  }
}