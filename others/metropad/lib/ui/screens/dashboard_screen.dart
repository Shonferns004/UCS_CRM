import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../../core/api_client.dart';
import '../../core/mumbai_metro.dart';
import '../../core/theme.dart';
import '../../models/dashboard.dart';
import '../../services/dashboard_service.dart';
import '../../state/app_state.dart';
import '../layout/main_layout.dart';
import '../widgets/common.dart';
import '../widgets/data_table.dart';
import '../widgets/status_badge.dart';
import 'screens.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});
  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  bool _loading = true;
  Object? _error;
  DashboardOverview? _overview;
  String _selectedLine = 'all';

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
      final overview = await DashboardService.getOverview();
      if (!mounted) return;
      setState(() {
        _overview = overview;
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

  void _go(String slug) {
    Navigator.pushReplacement(
      context,
      MaterialPageRoute(builder: (_) => screenFor(slug)),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AppScaffold(
      selected: 'dashboard',
      body: _loading || _overview == null
          ? _loading && _overview == null
              ? const LoadingSpinner(message: 'Loading...')
              : Center(
                  child: ErrorState(
                    message: toApiException(_error!).message,
                    onRetry: _load,
                  ),
                )
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  _hero(),
                  const SizedBox(height: 16),
                  _kpis(),
                  const SizedBox(height: 16),
                  _alertsRow(),
                  const SizedBox(height: 16),
                  _recentRefills(),
                  const SizedBox(height: 16),
                  _chart(),
                  const SizedBox(height: 16),
                  _mapCard(),
                ],
              ),
            ),
    );
  }

  Widget _hero() {
    final stats = _overview!.stats;
    final name = AppState.auth.user?.name ?? '';
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [AppColors.primary, AppColors.primaryLight],
        ),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Good to see you, $name',
            style: const TextStyle(
              color: Colors.white,
              fontSize: 18,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 4),
          const Text(
            'Here is the overview of your metro pad machines.',
            style: TextStyle(color: Colors.white70, fontSize: 13),
          ),
          const SizedBox(height: 20),
          Row(
            children: [
              _heroStat('Total Machines', '${stats.totalMachines}'),
              _heroStat('Active', '${stats.activeMachines}',
                  sub: '${stats.activePercentage}%'),
              _heroStat('Refills (Month)', '${stats.padsRefilledThisMonth}'),
            ],
          ),
        ],
      ),
    );
  }

  Widget _heroStat(String label, String value, {String? sub}) {
    return Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label,
              style: const TextStyle(color: Colors.white70, fontSize: 12)),
          const SizedBox(height: 2),
          Text(
            value,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 20,
              fontWeight: FontWeight.w800,
            ),
          ),
          if (sub != null)
            Text(sub,
                style:
                    const TextStyle(color: Colors.white70, fontSize: 12)),
        ],
      ),
    );
  }

  Widget _kpis() {
    final s = _overview!.stats;
    final cards = [
      KpiCard(
        title: 'Total Machines',
        value: '${s.totalMachines}',
        icon: Icons.memory,
        color: AppColors.primary,
      ),
      KpiCard(
        title: 'Active Machines',
        value: '${s.activeMachines}',
        icon: Icons.check_circle,
        color: AppColors.success,
      ),
      KpiCard(
        title: 'Refills (This Month)',
        value: '${s.padsRefilledThisMonth}',
        icon: Icons.refresh,
        color: AppColors.info,
        onClick: () => _go('refills'),
      ),
      KpiCard(
        title: 'Low Stock Alerts',
        value: '${s.lowStockMachines}',
        icon: Icons.warning_amber,
        color: AppColors.warning,
        onClick: () => _go('refills'),
      ),
      KpiCard(
        title: 'Inactive Machines',
        value: '${s.inactiveMachines}',
        icon: Icons.block,
        color: AppColors.danger,
      ),
      KpiCard(
        title: 'Maintenance Due',
        value: '${s.maintenanceMachines}',
        icon: Icons.build,
        color: AppColors.orange,
      ),
      KpiCard(
        title: 'Metro Lines',
        value: '${s.totalMetroLines}',
        icon: Icons.directions_transit,
        color: AppColors.purple,
        onClick: () => _go('metro-lines'),
      ),
      KpiCard(
        title: 'Stations',
        value: '${s.totalStations}',
        icon: Icons.location_on,
        color: AppColors.teal,
        onClick: () => _go('stations'),
      ),
    ];
    return GridView.count(
      crossAxisCount: MediaQuery.of(context).size.width > 700 ? 4 : 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 10,
      crossAxisSpacing: 10,
      childAspectRatio: 1.5,
      children: cards,
    );
  }

  Widget _alertsRow() {
    final lowStock = _overview!.lowStock;
    final attention = _overview!.attention;
    return Column(
      children: [
        _alertCard(
          'Low Stock Alerts',
          Icons.warning_amber,
          AppColors.warning,
          lowStock,
        ),
        const SizedBox(height: 16),
        _alertCard(
          'Attention Machines',
          Icons.error,
          AppColors.danger,
          attention,
        ),
      ],
    );
  }

  Widget _alertCard(String title, IconData icon, Color color, List<MachineAlert> items) {
    return Card(
      elevation: 0,
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(icon, size: 18, color: color),
                const SizedBox(width: 8),
                Text(title,
                    style: const TextStyle(
                        fontSize: 15, fontWeight: FontWeight.w700)),
              ],
            ),
            const SizedBox(height: 12),
            if (items.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 20),
                child: Text('All clear!',
                    style:
                        TextStyle(color: AppColors.textLight, fontSize: 13)),
              )
            else
              for (final item in items)
                ListTile(
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.memory, size: 18),
                  title: Text(item.machine.machineId,
                      style: const TextStyle(
                          fontSize: 14, fontWeight: FontWeight.w600)),
                  subtitle: Text(item.machine.stationName),
                  trailing: StatusBadge(stockLevelNum(item.machine.stockPercentage) == 'LOW_STOCK'
                      ? 'LOW_STOCK'
                      : item.machine.status),
                  onTap: () => _go('refills'),
                ),
          ],
        ),
      ),
    );
  }

  String stockLevelNum(num? pct) {
    if (pct == null || pct <= 0) return 'EMPTY';
    if (pct <= 10) return 'LOW_STOCK';
    return 'NORMAL';
  }

  Widget _recentRefills() {
    final refills = _overview!.refills;
    return Card(
      elevation: 0,
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Recent Refills',
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
            const SizedBox(height: 12),
            DataTableWidget<RefillLite>(
              items: refills,
              columns: [
                TableColumn<RefillLite>(
                  'Date',
                  cell: (c, r) => cellText(r.refillDate),
                ),
                TableColumn<RefillLite>(
                  'Machine',
                  cell: (c, r) => cellText(r.machineCode, bold: true),
                ),
                TableColumn<RefillLite>(
                  'Station',
                  cell: (c, r) => cellText(r.stationName),
                ),
                TableColumn<RefillLite>(
                  'Pads',
                  cell: (c, r) => cellText('${r.refillQuantity}'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _chart() {
    final refills = _overview!.refills;
    if (refills.length < 2) return const SizedBox.shrink();
    final maxQ = refills
        .map((r) => r.refillQuantity.toDouble())
        .fold<double>(1, (a, b) => a > b ? a : b);
    return Card(
      elevation: 0,
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Refills Trend',
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
            const SizedBox(height: 12),
            SizedBox(
              height: 180,
              child: BarChart(
                BarChartData(
                  maxY: maxQ * 1.2,
                  alignment: BarChartAlignment.spaceAround,
                  borderData: FlBorderData(show: false),
                  gridData: FlGridData(show: true, drawVerticalLine: false),
                  titlesData: FlTitlesData(
                    leftTitles: AxisTitles(
                        sideTitles: SideTitles(showTitles: false)),
                    topTitles: AxisTitles(
                        sideTitles: SideTitles(showTitles: false)),
                    rightTitles: AxisTitles(
                        sideTitles: SideTitles(showTitles: false)),
                    bottomTitles: AxisTitles(
                      sideTitles: SideTitles(
                        showTitles: true,
                        reservedSize: 32,
                        getTitlesWidget: (v, meta) {
                          final i = v.toInt();
                          if (i < 0 || i >= refills.length) {
                            return const SizedBox.shrink();
                          }
                          final date = refills[i].refillDate;
                          return Padding(
                            padding: const EdgeInsets.only(top: 6),
                            child: Text(
                              date.length >= 5 ? date.substring(5) : date,
                              style: const TextStyle(
                                  fontSize: 10, color: AppColors.textLight),
                            ),
                          );
                        },
                      ),
                    ),
                  ),
                  barGroups: [
                    for (var i = 0; i < refills.length; i++)
                      BarChartGroupData(
                        x: i,
                        barRods: [
                          BarChartRodData(
                            toY: refills[i].refillQuantity.toDouble(),
                            color: AppColors.primary,
                            width: 14,
                            borderRadius: BorderRadius.circular(4),
                          ),
                        ],
                      ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _mapCard() {
    final metro = buildMumbaiMetroData();
    final visibleLines = _selectedLine == 'all'
        ? displayLineIds
        : [_selectedLine];
    final pointsByLine = <String, List<LatLng>>{};
    for (final lineId in visibleLines) {
      final line = metro.lines[lineId];
      if (line == null) continue;
      final pts = <LatLng>[];
      for (final sid in line.stations) {
        final s = metro.stations[sid];
        if (s != null) pts.add(LatLng(s.lat, s.lng));
      }
      pointsByLine[lineId] = pts;
    }

    LatLng initial = const LatLng(19.15, 72.86);
    if (pointsByLine.isNotEmpty) {
      final first = pointsByLine.values.first;
      if (first.isNotEmpty) initial = first.first;
    }

    return Card(
      elevation: 0,
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Network Map',
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                FilterChip(
                  label: const Text('All'),
                  selected: _selectedLine == 'all',
                  onSelected: (_) =>
                      setState(() => _selectedLine = 'all'),
                ),
                for (final lid in displayLineIds)
                  FilterChip(
                    label:
                        Text('Line ${metro.lines[lid]?.number ?? ''}'),
                    selected: _selectedLine == lid,
                    showCheckmark: false,
                    selectedColor:
                        colorFromHex(metroColors[lid] ?? '#4f46e5'),
                    onSelected: (_) =>
                        setState(() => _selectedLine = lid),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            SizedBox(
              height: 340,
              child: ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: FlutterMap(
                  options: MapOptions(
                    initialCenter: initial,
                    initialZoom: 10.5,
                    minZoom: 10,
                  ),
                  children: [
                    TileLayer(
                      urlTemplate:
                          'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                      userAgentPackageName: 'com.beingsevak.metropad',
                    ),
                    PolylineLayer(
                      polylines: [
                        for (final e in pointsByLine.entries)
                          Polyline(
                            points: e.value,
                            color:
                                colorFromHex(metroColors[e.key] ?? '#4f46e5'),
                            strokeWidth: 3,
                          ),
                      ],
                    ),
                    MarkerLayer(
                      markers: [
                        for (final lineId in visibleLines)
                          for (final sid
                              in (metro.lines[lineId]?.stations ?? const []))
                            if (metro.stations[sid] != null)
                              Marker(
                                point: LatLng(
                                  metro.stations[sid]!.lat,
                                  metro.stations[sid]!.lng,
                                ),
                                width: 26,
                                height: 26,
                                child: GestureDetector(
                                  onTap: () => _showStation(metro.stations[sid]!),
                                  child: Icon(
                                    Icons.location_on,
                                    size: 26,
                                    color: colorFromHex(
                                        metroColors[lineId] ?? '#4f46e5'),
                                  ),
                                ),
                              ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _showStation(MetroStationData s) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(s.name), duration: const Duration(seconds: 1)),
    );
  }
}