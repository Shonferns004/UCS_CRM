import 'dart:async';

import 'package:flutter/material.dart';

import '../models/models.dart';
import '../services/fro_api.dart';
import '../theme.dart';
import '../widgets/donor_card.dart';
import '../widgets/skeleton.dart';
import 'donor_detail_page.dart';

class DonorsPage extends StatefulWidget {
  const DonorsPage({super.key});

  @override
  State<DonorsPage> createState() => _DonorsPageState();
}

class _DonorsPageState extends State<DonorsPage> {
  final _searchCtrl = TextEditingController();
  Timer? _debounce;
  List<Donor> _donors = [];
  bool _loading = true;
  String? _error;
  String _period = 'all';
  String _activity = 'all';

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final list = await FroApi.myDonors(
        verifiedOnly: true,
        period: _period,
        activeOnly: _activity == 'active' ? true : null,
        inactiveOnly: _activity == 'inactive' ? true : null,
      );
      if (!mounted) return;
      setState(() {
        _donors = list;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _search(String q) async {
    if (q.trim().length < 3) return;
    try {
      final list = await FroApi.searchDonors(q.trim());
      if (mounted) setState(() => _donors = list);
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
          child: TextField(
            controller: _searchCtrl,
            decoration: InputDecoration(
              hintText: 'Search name or mobile…',
              prefixIcon: const Icon(Icons.search, size: 20),
              suffixIcon: _searchCtrl.text.isNotEmpty
                  ? IconButton(
                      icon: const Icon(Icons.close, size: 18),
                      onPressed: () {
                        _searchCtrl.clear();
                        _load();
                      },
                    )
                  : null,
              contentPadding: const EdgeInsets.symmetric(vertical: 10),
            ),
            onChanged: (v) {
              _debounce?.cancel();
              _debounce = Timer(const Duration(milliseconds: 600), () {
                if (v.trim().isEmpty) {
                  _load();
                } else {
                  _search(v);
                }
              });
              setState(() {});
            },
          ),
        ),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Row(
            children: [
              _pill('All', 'all', _period == 'all', () => _setPeriod('all')),
              const SizedBox(width: 6),
              _pill('Today', 'today', _period == 'today', () => _setPeriod('today')),
              const SizedBox(width: 6),
              _pill('Monthly', 'monthly', _period == 'monthly', () => _setPeriod('monthly')),
              const SizedBox(width: 6),
              _pill('6 Months', 'sixmonths', _period == 'sixmonths', () => _setPeriod('sixmonths')),
              const SizedBox(width: 6),
              _pill('Yearly', 'yearly', _period == 'yearly', () => _setPeriod('yearly')),
            ],
          ),
        ),
        const SizedBox(height: 6),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Row(
            children: [
              _pill('All', 'all', _activity == 'all', () => _setActivity('all')),
              const SizedBox(width: 6),
              _pill('Active', 'active', _activity == 'active', () => _setActivity('active')),
              const SizedBox(width: 6),
              _pill('Inactive', 'inactive', _activity == 'inactive', () => _setActivity('inactive')),
            ],
          ),
        ),
        const SizedBox(height: 8),
        Expanded(
          child: _loading
              ? ListView(
                  padding: const EdgeInsets.all(16),
                  children: const [
                    SkeletonBlock(height: 100),
                    SizedBox(height: 10),
                    SkeletonBlock(height: 100),
                    SizedBox(height: 10),
                    SkeletonBlock(height: 100),
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
                  : _donors.isEmpty
                      ? const Center(
                          child: Text('No donors found', style: TextStyle(color: AppColors.inkSoft)),
                        )
                      : RefreshIndicator(
                          onRefresh: _load,
                          child: ListView.separated(
                            padding: const EdgeInsets.all(16),
                            itemCount: _donors.length,
                            separatorBuilder: (_, _) => const SizedBox(height: 10),
                            itemBuilder: (context, i) {
                              final d = _donors[i];
                              return DonorCard(
                                donor: d,
                                onCall: false,
                                onStartCall: null,
                                onEndCall: null,
                                onOpenDetail: () {
                                  Navigator.push(
                                    context,
                                    MaterialPageRoute(
                                      builder: (_) => DonorDetailPage(
                                        donorId: d.id,
                                        ngoId: d.ngoId,
                                        donor: d,
                                      ),
                                    ),
                                  );
                                },
                              );
                            },
                          ),
                        ),
        ),
      ],
    );
  }

  void _setPeriod(String p) {
    if (_period == p) return;
    setState(() => _period = p);
    _load();
  }

  void _setActivity(String a) {
    if (_activity == a) return;
    setState(() => _activity = a);
    _load();
  }

  Widget _pill(String label, String value, bool selected, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
        decoration: BoxDecoration(
          color: selected ? AppColors.sage : Colors.transparent,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: selected ? AppColors.sage : AppColors.line),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w700,
            color: selected ? Colors.white : AppColors.inkSoft,
          ),
        ),
      ),
    );
  }
}
