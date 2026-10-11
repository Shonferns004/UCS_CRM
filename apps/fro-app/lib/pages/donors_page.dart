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
  String _filter = 'all';

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
        statusGroup: _filter == 'all' ? null : _filter,
        limit: 100,
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
              hintText: 'Search by mobile number',
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
            keyboardType: TextInputType.phone,
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
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Row(
            children: [
              _filterChip('All', 'all'),
              const SizedBox(width: 8),
              _filterChip('Pending', 'pending'),
              const SizedBox(width: 8),
              _filterChip('Done', 'done'),
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
                            separatorBuilder: (_, __) => const SizedBox(height: 10),
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

  Widget _filterChip(String label, String value) {
    final selected = _filter == value;
    return FilterChip(
      label: Text(label, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
      selected: selected,
      onSelected: (v) {
        setState(() => _filter = value);
        _load();
      },
      selectedColor: AppColors.activeBg,
      checkmarkColor: AppColors.sage,
      visualDensity: VisualDensity.compact,
    );
  }
}
