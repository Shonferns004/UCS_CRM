import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';

import '../services/fro_api.dart';
import '../theme.dart';
import '../widgets/dashboard_cards.dart';

/// "My Collections" drill-down — matches the web panel's collections modal:
/// month + NGO filter, search, High Tier flags, and an NGO-wise bar chart.
class CollectionsPage extends StatefulWidget {
  const CollectionsPage({super.key});

  @override
  State<CollectionsPage> createState() => _CollectionsPageState();
}

class _CollectionsPageState extends State<CollectionsPage> {
  bool _loading = true;
  String _month = 'current'; // 'current' | 'prev'
  String _selectedNgo = 'all';
  String _search = '';
  Map<String, List<Map<String, dynamic>>> _byNgo = {};
  Map<String, String> _ngoMap = {};
  num _total = 0;
  num _totalHighTier = 0;
  String _monthLabel = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final res = await FroApi.myCollections(month: _month);
      _apply(res);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.toString())));
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _apply(Map<String, dynamic> res) {
    var byNgo = <String, List<Map<String, dynamic>>>{};
    final ngoMap = <String, String>{};

    final rawNgoMap = res['ngoMap'];
    if (rawNgoMap is Map) {
      rawNgoMap.forEach((k, v) => ngoMap[k.toString()] = v.toString());
    }

    final collections = res['collections'];
    if (collections is Map) {
      collections.forEach((k, v) {
        final list = (v is List)
            ? v.whereType<Map>().map((e) => e.cast<String, dynamic>()).toList()
            : <Map<String, dynamic>>[];
        byNgo[k.toString()] = list;
      });
    } else if (collections is List) {
      final all = collections
          .whereType<Map>()
          .map((e) => e.cast<String, dynamic>())
          .toList();
      byNgo['all'] = all;
      // group by ngo_id
      final groups = <String, List<Map<String, dynamic>>>{};
      for (final c in all) {
        final nid = c['ngo_id']?.toString() ?? 'null';
        (groups[nid] ??= []).add(c);
      }
      byNgo.addAll(groups);
    }

    _monthLabel = _month == 'current' ? 'This month' : 'Last month';
    if (res['month'] is String && (res['month'] as String).isNotEmpty) {
      _monthLabel = _monthLabelOf(res['month'] as String);
    }

    setState(() {
      _byNgo = byNgo;
      _ngoMap = ngoMap;
      _total = res['total'] is num ? res['total'] as num : 0;
      _totalHighTier =
          res['total_high_tier'] is num ? res['total_high_tier'] as num : 0;
      _monthLabel = _monthLabel;
    });
  }

  String _monthLabelOf(String v) {
    final parts = v.split('-');
    if (parts.length < 2) return v;
    final y = int.tryParse(parts[0]) ?? 0;
    final m = int.tryParse(parts[1]) ?? 1;
    const names = [
      '', 'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return '${names[m]} $y';
  }

  List<Map<String, dynamic>> get _visible {
    final list = _byNgo[_selectedNgo] ?? [];
    final q = _search.trim().toLowerCase();
    if (q.isEmpty) return list;
    return list.where((c) {
      final name = (c['donor_name'] ?? '').toString().toLowerCase();
      final mobile = (c['donor_mobile'] ?? '').toString();
      final receipt = (c['receipt_no'] ?? '').toString();
      return name.contains(q) || mobile.contains(q) || receipt.contains(q);
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final spec = ThemeServiceSpec.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('My Collections')),
      body: Column(
        children: [
          _filters(spec),
          if (_loading)
            const Expanded(child: Center(child: CircularProgressIndicator()))
          else
            Expanded(
              child: RefreshIndicator(
                onRefresh: _load,
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                  children: [
                    _summary(spec),
                    const SizedBox(height: 12),
                    if (_ngoBars.isNotEmpty) _barChart(spec),
                    const SizedBox(height: 8),
                    _searchField(spec),
                    const SizedBox(height: 8),
                    ..._visible.map((c) => _row(c, spec)),
                    if (_visible.isEmpty)
                      const Padding(
                        padding: EdgeInsets.all(24),
                        child: Center(
                          child: Text('No matching collections',
                              style: TextStyle(color: AppColors.inkSoft)),
                        ),
                      ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _filters(FroThemeSpec spec) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 10),
      child: Column(
        children: [
          Row(
            children: [
              TogglePills(
                options: const [('current', 'This month'), ('prev', 'Last month')],
                selected: _month,
                onChanged: (v) {
                  if (v == _month) return;
                  setState(() => _month = v);
                  _load();
                },
                expand: false,
              ),
            ],
          ),
          const SizedBox(height: 8),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                _ngoChip('all', 'All', spec),
                for (final id in _ngoMap.keys)
                  _ngoChip(id, _ngoMap[id] ?? id, spec),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _ngoChip(String id, String label, FroThemeSpec spec) {
    final selected = _selectedNgo == id;
    final count = _byNgo[id]?.length ?? 0;
    return Padding(
      padding: const EdgeInsets.only(right: 6),
      child: GestureDetector(
        onTap: () => setState(() => _selectedNgo = id),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(
            color: selected ? spec.sage : Colors.transparent,
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: selected ? spec.sage : spec.line),
          ),
          child: Text(
            '$label ($count)',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: selected ? Colors.white : spec.inkSoft,
            ),
          ),
        ),
      ),
    );
  }

  Widget _summary(FroThemeSpec spec) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: spec.paper,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: spec.line),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Total collected',
                    style: TextStyle(fontSize: 11, color: spec.inkSoft)),
                Text(formatCurrency(_total),
                    style: const TextStyle(
                        fontSize: 22, fontWeight: FontWeight.w800)),
              ],
            ),
          ),
          if (_totalHighTier > 0)
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text('High Tier',
                    style: TextStyle(fontSize: 11, color: spec.inkSoft)),
                Text(formatCurrency(_totalHighTier),
                    style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                        color: AppColors.purple)),
              ],
            ),
        ],
      ),
    );
  }

  List<(String, num)> get _ngoBars {
    final out = <(String, num)>[];
    _byNgo.forEach((key, list) {
      if (key == 'all') return;
      final total = list.fold<num>(
          0, (acc, c) => acc + (c['amount_collected'] is num ? c['amount_collected'] as num : 0));
      out.add((_ngoMap[key] ?? key, total));
    });
    out.sort((a, b) => b.$2.compareTo(a.$2));
    return out;
  }

  Widget _barChart(FroThemeSpec spec) {
    final bars = _ngoBars;
    final maxY = bars.map((b) => b.$2).fold<num>(0, (a, b) => b > a ? b : a);
    return Container(
      height: 180,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: spec.paper,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: spec.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('NGO-wise collection',
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: spec.ink)),
          const SizedBox(height: 8),
          Expanded(
            child: BarChart(
              BarChartData(
                maxY: maxY > 0 ? (maxY * 1.2).toDouble() : 1,
                alignment: BarChartAlignment.spaceAround,
                borderData: FlBorderData(show: false),
                gridData: const FlGridData(show: false),
                barTouchData: BarTouchData(enabled: false),
                titlesData: FlTitlesData(
                  leftTitles: const AxisTitles(
                      sideTitles: SideTitles(showTitles: false)),
                  rightTitles: const AxisTitles(
                      sideTitles: SideTitles(showTitles: false)),
                  topTitles: const AxisTitles(
                      sideTitles: SideTitles(showTitles: false)),
                  bottomTitles: AxisTitles(
                    sideTitles: SideTitles(
                      showTitles: true,
                      getTitlesWidget: (value, meta) {
                        final i = value.toInt();
                        if (i < 0 || i >= bars.length) return const SizedBox.shrink();
                        return Padding(
                          padding: const EdgeInsets.only(top: 4),
                          child: Text(
                            bars[i].$1,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 8, color: AppColors.inkSoft),
                          ),
                        );
                      },
                    ),
                  ),
                ),
                barGroups: [
                  for (var i = 0; i < bars.length; i++)
                    BarChartGroupData(
                      x: i,
                      barRods: [
                        BarChartRodData(
                          toY: bars[i].$2.toDouble(),
                          width: 18,
                          color: spec.sage,
                          borderRadius: const BorderRadius.vertical(
                              top: Radius.circular(4)),
                        ),
                      ],
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _searchField(FroThemeSpec spec) {
    return TextField(
      onChanged: (v) => setState(() => _search = v),
      decoration: InputDecoration(
        hintText: 'Search donor, mobile or receipt #',
        prefixIcon: const Icon(Icons.search, size: 20),
        isDense: true,
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      ),
    );
  }

  Widget _row(Map<String, dynamic> c, FroThemeSpec spec) {
    final name = (c['donor_name'] ?? '—').toString();
    final mobile = (c['donor_mobile'] ?? '').toString();
    final receipt = c['receipt_no']?.toString();
    final ngo = c['ngo_name']?.toString();
    final isHighTier = c['is_high_tier'] == true;
    final amount = c['amount_collected'] is num ? c['amount_collected'] as num : 0;
    final at = c['collected_at']?.toString();

    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: spec.paper,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: spec.line),
      ),
      child: Row(
        children: [
          CircleAvatar(
            radius: 16,
            backgroundColor: isHighTier ? AppColors.purple : spec.sage,
            child: Text(
              name.isNotEmpty ? name[0].toUpperCase() : '?',
              style: const TextStyle(
                  color: Colors.white, fontSize: 12, fontWeight: FontWeight.w700),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              fontSize: 12.5, fontWeight: FontWeight.w600)),
                    ),
                    if (ngo != null && ngo.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(left: 6),
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 6, vertical: 1),
                          decoration: BoxDecoration(
                            color: AppColors.pillPurpleBg,
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: Text(ngo,
                              style: const TextStyle(
                                  fontSize: 8,
                                  fontWeight: FontWeight.w700,
                                  color: AppColors.pillPurpleText)),
                        ),
                      ),
                    if (isHighTier)
                      Padding(
                        padding: const EdgeInsets.only(left: 4),
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 5, vertical: 1),
                          decoration: BoxDecoration(
                            color: AppColors.purple,
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: const Text('HIGH TIER',
                              style: TextStyle(
                                  fontSize: 7,
                                  fontWeight: FontWeight.w700,
                                  color: Colors.white)),
                        ),
                      ),
                  ],
                ),
                if (mobile.isNotEmpty)
                  Text(mobile,
                      style:
                          const TextStyle(fontSize: 10, color: AppColors.inkSoft)),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(formatCurrency(amount),
                  style: const TextStyle(
                      fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.success)),
              if (receipt != null && receipt.isNotEmpty)
                Text('#$receipt',
                    style: const TextStyle(
                        fontSize: 9, fontWeight: FontWeight.w600, color: AppColors.purple)),
              if (at != null && at.isNotEmpty)
                Text(_fmtStamp(at),
                    style: const TextStyle(fontSize: 9, color: AppColors.inkSoft)),
            ],
          ),
        ],
      ),
    );
  }

  String _fmtStamp(String v) {
    final d = DateTime.tryParse(v);
    if (d == null) return v;
    const months = [
      '', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];
    return '${d.day} ${months[d.month]}, ${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
  }
}
