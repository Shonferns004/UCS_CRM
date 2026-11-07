import 'package:flutter/material.dart';

import '../models/dashboard.dart';
import '../services/fro_api.dart';
import '../theme.dart';
import '../widgets/dashboard_cards.dart';
import '../widgets/skeleton.dart';

/// Active / Inactive / Total donor roster behind a dashboard count.
class DonorSplitPage extends StatefulWidget {
  final String status; // 'active' | 'inactive' | 'total'
  final String window; // '1' | '2' | '3' | '6' | '8' | '12'
  const DonorSplitPage({super.key, required this.status, required this.window});

  @override
  State<DonorSplitPage> createState() => _DonorSplitPageState();
}

class _DonorSplitPageState extends State<DonorSplitPage> {
  bool _loading = true;
  List<FroDonorSplitItem> _donors = [];
  num _total = 0;
  String? _error;

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
      final res = await FroApi.froDonorList(widget.status, widget.window);
      final list = res['donors'] is List ? res['donors'] as List : <dynamic>[];
      setState(() {
        _donors = list
            .whereType<Map>()
            .map((e) => FroDonorSplitItem.fromJson(e.cast<String, dynamic>()))
            .toList();
        _total = res['total'] is num ? res['total'] as num : _donors.length;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  String get _title => switch (widget.status) {
        'active' => 'Active Donors',
        'inactive' => 'Inactive Donors',
        _ => 'Total Donors',
      };

  String get _subtitle {
    final n = _total;
    final s = n == 1 ? '' : 's';
    return switch (widget.status) {
      'active' => 'Donated in the last ${widget.window} month$s · $n donor$s',
      'inactive' => 'No donation in past one month · $n donor$s',
      _ => 'Donated this financial year · $n donor$s',
    };
  }

  @override
  Widget build(BuildContext context) {
    final spec = ThemeServiceSpec.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(_title)),
      body: _loading
          ? ListView(
              padding: const EdgeInsets.all(16),
              children: const [
                SkeletonBlock(height: 56),
                SizedBox(height: 8),
                SkeletonBlock(height: 56),
                SizedBox(height: 8),
                SkeletonBlock(height: 56),
              ],
            )
          : _error != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(_error!,
                            style: const TextStyle(
                                fontSize: 13, color: AppColors.inkSoft)),
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
                      Text(_subtitle,
                          style: TextStyle(fontSize: 12, color: spec.inkSoft)),
                      const SizedBox(height: 12),
                      if (_donors.isEmpty)
                        const Padding(
                          padding: EdgeInsets.all(24),
                          child: Center(
                              child: Text('No donors',
                                  style: TextStyle(color: AppColors.inkSoft))),
                        ),
                      for (final d in _donors)
                        Container(
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
                                backgroundColor: spec.sage,
                                child: Text(
                                  (d.donorName?.isNotEmpty == true
                                          ? d.donorName![0]
                                          : '?')
                                      .toUpperCase(),
                                  style: const TextStyle(
                                      color: Colors.white,
                                      fontSize: 12,
                                      fontWeight: FontWeight.w700),
                                ),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(d.donorName ?? '—',
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: const TextStyle(
                                            fontSize: 12.5,
                                            fontWeight: FontWeight.w600)),
                                    Text(d.donorMobile ?? '—',
                                        style: const TextStyle(
                                            fontSize: 10,
                                            color: AppColors.inkSoft)),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                      if (_total > _donors.length)
                        Padding(
                          padding: const EdgeInsets.all(8),
                          child: Center(
                            child: Text(
                              'Showing first ${_donors.length} of $_total',
                              style: const TextStyle(
                                  fontSize: 10, color: AppColors.inkSoft),
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
    );
  }
}
