import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../services/fro_api.dart';
import '../theme.dart';
import '../widgets/skeleton.dart';

class MyIdlePage extends StatefulWidget {
  const MyIdlePage({super.key});

  @override
  State<MyIdlePage> createState() => _MyIdlePageState();
}

class _MyIdlePageState extends State<MyIdlePage> {
  String _month = _istMonthKey();
  Map<String, dynamic>? _report;
  List<dynamic> _sessions = [];
  String? _selectedDate;
  bool _loading = true;
  String? _error;

  static String _istMonthKey() {
    final ist = DateTime.now().toUtc().add(const Duration(hours: 5, minutes: 30));
    return '${ist.year}-${ist.month.toString().padLeft(2, '0')}';
  }

  static String _monthLabel(String ym) {
    final parts = ym.split('-');
    if (parts.length != 2) return ym;
    final y = int.tryParse(parts[0]) ?? 0;
    final m = int.tryParse(parts[1]) ?? 1;
    return DateFormat('MMMM yyyy').format(DateTime(y, m));
  }

  String _monthBounds(String ym) {
    final parts = ym.split('-');
    final y = int.tryParse(parts[0]) ?? 0;
    final m = int.tryParse(parts[1]) ?? 1;
    final last = DateTime(y, m + 1, 0).day;
    return '$ym-01 to $ym-${last.toString().padLeft(2, '0')}';
  }

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
      final parts = _month.split('-');
      final y = int.tryParse(parts[0]) ?? 0;
      final m = int.tryParse(parts[1]) ?? 1;
      final last = DateTime(y, m + 1, 0).day;
      final from = '$_month-01';
      final to = '$_month-${last.toString().padLeft(2, '0')}';
      final r = await FroApi.idleMe(from: from, to: to);
      if (!mounted) return;
      setState(() {
        _report = r;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _loadSessions(String date) async {
    setState(() => _selectedDate = date);
    try {
      final s = await FroApi.idleMeSessions(date);
      if (mounted) setState(() => _sessions = s);
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('My Idle')),
      body: _loading
          ? ListView(
              padding: const EdgeInsets.all(16),
              children: const [
                SkeletonBlock(height: 80),
                SizedBox(height: 10),
                SkeletonBlock(height: 200),
              ],
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
                              final parts = _month.split('-');
                              var y = int.tryParse(parts[0]) ?? 0;
                              var m = int.tryParse(parts[1]) ?? 1;
                              m -= 1;
                              if (m < 1) {
                                m = 12;
                                y -= 1;
                              }
                              setState(() => _month = '$y-${m.toString().padLeft(2, '0')}');
                              _load();
                            },
                          ),
                          Expanded(
                            child: Text(
                              _monthLabel(_month),
                              textAlign: TextAlign.center,
                              style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
                            ),
                          ),
                          IconButton(
                            icon: const Icon(Icons.chevron_right),
                            onPressed: () {
                              final parts = _month.split('-');
                              var y = int.tryParse(parts[0]) ?? 0;
                              var m = int.tryParse(parts[1]) ?? 1;
                              m += 1;
                              if (m > 12) {
                                m = 1;
                                y += 1;
                              }
                              setState(() => _month = '$y-${m.toString().padLeft(2, '0')}');
                              _load();
                            },
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(
                        _monthBounds(_month),
                        textAlign: TextAlign.center,
                        style: const TextStyle(fontSize: 11.5, color: AppColors.inkSoft),
                      ),
                      const SizedBox(height: 16),
                      _summaryCard(),
                      const SizedBox(height: 16),
                      const Text('Daily Breakdown', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
                      const SizedBox(height: 8),
                      ..._dayRows(),
                      if (_sessions.isNotEmpty) ...[
                        const SizedBox(height: 16),
                        Text('Sessions — $_selectedDate', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
                        const SizedBox(height: 8),
                        ..._sessionRows(),
                      ],
                    ],
                  ),
                ),
    );
  }

  Widget _summaryCard() {
    final r = _report ?? {};
    final totalIdle = r['total_idle_seconds'] ?? r['idle_seconds'];
    final totalWorked = r['total_worked_seconds'] ?? r['worked_seconds'];
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.line),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Total Idle', style: TextStyle(fontSize: 11.5, color: AppColors.inkSoft, fontWeight: FontWeight.w600)),
                Text(
                  formatDuration(totalIdle is num ? totalIdle.toInt() : null),
                  style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: AppColors.danger),
                ),
              ],
            ),
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Total Worked', style: TextStyle(fontSize: 11.5, color: AppColors.inkSoft, fontWeight: FontWeight.w600)),
                Text(
                  formatDuration(totalWorked is num ? totalWorked.toInt() : null),
                  style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: AppColors.sage),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  List<Widget> _dayRows() {
    final r = _report ?? {};
    final days = (r['days'] ?? r['rows'] ?? r['fros']) as List? ?? [];
    if (days.isEmpty) {
      return [const Padding(padding: EdgeInsets.all(16), child: Text('No idle data', style: TextStyle(color: AppColors.inkSoft)))];
    }
    return [
      for (final d in days)
        Builder(builder: (context) {
          final map = d is Map ? d : <String, dynamic>{};
          final date = (map['date'] ?? map['day'] ?? '').toString();
          final idle = map['idle_seconds'] is num ? (map['idle_seconds'] as num).toInt() : null;
          return InkWell(
            onTap: () => _loadSessions(date),
            child: Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: AppColors.line),
              ),
              child: Row(
                children: [
                  Text(date, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                  const Spacer(),
                  Text(
                    formatDuration(idle),
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w800,
                      color: (idle ?? 0) > 0 ? AppColors.danger : AppColors.success,
                    ),
                  ),
                  const Icon(Icons.chevron_right, size: 18, color: AppColors.inkSoft),
                ],
              ),
            ),
          );
        }),
    ];
  }

  List<Widget> _sessionRows() {
    return [
      for (final s in _sessions)
        Builder(builder: (context) {
          final map = s is Map ? s : <String, dynamic>{};
          final idle = map['idle_seconds'] is num ? (map['idle_seconds'] as num).toInt() : null;
          final start = (map['start_time'] ?? map['started_at'] ?? '').toString();
          final end = (map['end_time'] ?? map['ended_at'] ?? '').toString();
          return Container(
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: AppColors.line),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    [start, end].where((e) => e.isNotEmpty).join(' — '),
                    style: const TextStyle(fontSize: 12.5),
                  ),
                ),
                Text(formatDuration(idle), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.danger)),
              ],
            ),
          );
        }),
    ];
  }
}
