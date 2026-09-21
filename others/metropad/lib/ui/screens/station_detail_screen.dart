import 'package:flutter/material.dart';
import 'package:lucide_flutter/lucide_flutter.dart';

import '../../core/api_client.dart';
import '../../core/constants.dart';
import '../../core/formatters.dart';
import '../../core/mumbai_metro.dart';
import '../../core/theme.dart';
import '../../models/machine.dart';
import '../../models/metro.dart';
import '../../services/metro_service.dart';
import '../layout/main_layout.dart';
import '../widgets/common.dart';
import '../widgets/status_badge.dart';

class StationDetailScreen extends StatefulWidget {
  final String stationId;
  final String? initialName;
  const StationDetailScreen({
    super.key,
    required this.stationId,
    this.initialName,
  });

  @override
  State<StationDetailScreen> createState() => _StationDetailScreenState();
}

class _StationDetailScreenState extends State<StationDetailScreen> {
  bool _loading = true;
  Object? _error;
  Station? _station;
  List<Machine> _machines = [];

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
      final s = await StationService.getById(widget.stationId);
      if (!mounted) return;
      setState(() {
        _station = s;
        _machines = s.machines
            .whereType<Map>()
            .map((e) => Machine.fromJson(e.cast<String, dynamic>()))
            .toList();
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
    final s = _station;
    return AppScaffold(
      selected: 'network',
      showBack: true,
      title: s?.name ?? widget.initialName ?? 'Station',
      subtitle: s?.lineName ?? 'Station details',
      body: RefreshIndicator(
        onRefresh: _load,
        child: _loading
            ? const LoadingSpinner(message: 'Loading station...')
            : _error != null
                ? Center(
                    child: ErrorState(
                      message: toApiException(_error!).message,
                      onRetry: _load,
                    ),
                  )
                : ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      _header(s!),
                      const SizedBox(height: 12),
                      _stats(s),
                      const SizedBox(height: 12),
                      _machinesCard(),
                      const SizedBox(height: 12),
                      _activityCard(s),
                    ],
                  ),
      ),
    );
  }

  Widget _header(Station s) {
    final color = colorFromHex(getLineColor(s.lineName));
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: color.withValues(alpha: 0.14),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Icon(LucideIcons.mapPin, color: color),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(s.name,
                          style: const TextStyle(
                              fontSize: 17, fontWeight: FontWeight.w700)),
                      const SizedBox(height: 4),
                      Text(s.lineName,
                          style: const TextStyle(
                              fontSize: 12.5, color: AppColors.textLight)),
                    ],
                  ),
                ),
                if (s.status.isNotEmpty) StatusBadge(s.status),
              ],
            ),
            if (s.description.isNotEmpty) ...[
              const SizedBox(height: 12),
              Text(s.description,
                  style: const TextStyle(
                      fontSize: 13, color: AppColors.textLight)),
            ],
          ],
        ),
      ),
    );
  }

  Widget _stats(Station s) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Overview',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
            const SizedBox(height: 12),
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: [
                _stat('Machines', '${s.machineCount}', LucideIcons.cpu,
                    AppColors.primary),
                _stat('Active', '${s.activeMachineCount}', LucideIcons.checkCircle,
                    AppColors.success),
                _stat('Inactive', '${s.inactiveMachineCount}',
                    LucideIcons.circleStop, AppColors.textLight),
                _stat('Maintenance', '${s.maintenanceMachineCount}',
                    LucideIcons.wrench, AppColors.warning),
                _stat('Total Stock', formatNumber(s.totalStock),
                    LucideIcons.package, AppColors.info),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _stat(String label, String value, IconData icon, Color color) {
    return SizedBox(
      width: 104,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 15, color: color),
              const SizedBox(width: 6),
              Expanded(
                child: Text(label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        fontSize: 12, color: AppColors.textLight)),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(value,
              style: const TextStyle(
                  fontSize: 18, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }

  Widget _machinesCard() {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Machines',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            if (_machines.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 12),
                child: Text('No machines installed yet',
                    style: TextStyle(fontSize: 13, color: AppColors.textLight)),
              )
            else
              for (var i = 0; i < _machines.length; i++)
                _machineTile(_machines[i], i),
          ],
        ),
      ),
    );
  }

  Widget _machineTile(Machine m, int index) {
    final label = m.location.trim().isEmpty
        ? 'Machine ${index + 1}'
        : m.location.trim();
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: AppColors.primary.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Icon(LucideIcons.cpu,
                size: 18, color: AppColors.primary),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label,
                    style: const TextStyle(
                        fontSize: 13.5, fontWeight: FontWeight.w600)),
                const SizedBox(height: 2),
                Text(
                  '${formatNumber(m.currentStock)} / ${formatNumber(m.capacity)} pads',
                  style: const TextStyle(
                      fontSize: 12, color: AppColors.textLight),
                ),
              ],
            ),
          ),
          if (m.status.isNotEmpty) StatusBadge(m.status),
        ],
      ),
    );
  }

  Widget _activityCard(Station s) {
    final refills = s.recentRefills.whereType<Map>().toList();
    final issues = s.recentIssues.whereType<Map>().toList();
    if (refills.isEmpty && issues.isEmpty) return const SizedBox.shrink();
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Recent Activity',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            for (final r in refills)
              _activityRow(
                LucideIcons.refreshCw,
                AppColors.success,
                'Refilled ${formatNumber(asNum(r['refill_quantity']))} pads',
                formatDateStr(r['refill_date']?.toString()),
              ),
            for (final i in issues)
              _activityRow(
                LucideIcons.triangleAlert,
                AppColors.warning,
                humanizeLabel(i['issue_type']?.toString() ?? 'Issue'),
                formatDateStr(i['report_date']?.toString()),
              ),
          ],
        ),
      ),
    );
  }

  Widget _activityRow(IconData icon, Color color, String title, String date) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Icon(icon, size: 16, color: color),
          const SizedBox(width: 10),
          Expanded(
            child: Text(title,
                style: const TextStyle(fontSize: 13)),
          ),
          if (date.isNotEmpty)
            Text(date,
                style: const TextStyle(
                    fontSize: 12, color: AppColors.textLight)),
        ],
      ),
    );
  }
}
