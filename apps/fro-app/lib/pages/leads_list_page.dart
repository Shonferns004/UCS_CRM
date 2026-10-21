import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../models/models.dart';
import '../services/call_service.dart';
import '../services/fro_api.dart';
import '../theme.dart';

class LeadsListPage extends StatefulWidget {
  const LeadsListPage({super.key});

  @override
  State<LeadsListPage> createState() => _LeadsListPageState();
}

class _LeadsListPageState extends State<LeadsListPage> {
  final List<String> _tabs = ['New', 'Old', 'High Tier'];
  String _tab = 'New';
  List<dynamic> _stations = [];
  String? _station;
  String? _ngoId;

  List<Donor> _donors = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _boot();
  }

  Future<void> _boot() async {
    try {
      final stationsRes = await FroApi.myStations();
      final list = (stationsRes['stations'] as List?)?.whereType<Map>().toList() ?? [];
      final stationNames = <String>[];
      String? firstNgo;
      for (final s in list) {
        final st = s['station']?.toString();
        if (st != null && st.isNotEmpty && !stationNames.contains(st)) {
          stationNames.add(st);
          firstNgo ??= s['ngo_id']?.toString();
        }
      }
      if (!mounted) return;
      setState(() {
        _stations = stationNames;
        _ngoId = firstNgo;
      });
    } catch (_) {}
    await _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final list = await FroApi.myDonors(
        newOnly: _tab == 'New',
        oldOnly: _tab == 'Old',
        highTierOnly: _tab == 'High Tier',
        station: _station,
        ngoId: _ngoId,
        limit: 200,
      );
      if (!mounted) return;
      setState(() {
        _donors = list;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _call(Donor donor) async {
    final mobile = donor.donorMobile;
    if (mobile != null && mobile.isNotEmpty) {
      final uri = Uri(scheme: 'tel', path: mobile);
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri);
      }
    }
    if (mounted) {
      context.read<CallService>().startCall(donor);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
          child: Row(
            children: [
              SegmentedButton<String>(
                segments: [
                  for (final t in _tabs) ButtonSegment(value: t, label: Text(t, style: const TextStyle(fontSize: 11))),
                ],
                selected: {_tab},
                onSelectionChanged: (s) {
                  setState(() => _tab = s.first);
                  _load();
                },
                style: SegmentedButton.styleFrom(visualDensity: VisualDensity.compact),
              ),
              const Spacer(),
              if (_stations.isNotEmpty)
                DropdownButton<String>(
                  value: _station,
                  hint: const Text('All', style: TextStyle(fontSize: 12)),
                  isDense: true,
                  underline: const SizedBox.shrink(),
                  items: [
                    const DropdownMenuItem(value: null, child: Text('All', style: TextStyle(fontSize: 12))),
                    for (final s in _stations)
                      DropdownMenuItem(value: s, child: Text(s, style: const TextStyle(fontSize: 12))),
                  ],
                  onChanged: (v) {
                    setState(() => _station = v);
                    _load();
                  },
                ),
            ],
          ),
        ),
        Expanded(child: _buildList()),
      ],
    );
  }

  Widget _buildList() {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(_error!, textAlign: TextAlign.center),
            const SizedBox(height: 12),
            ElevatedButton(onPressed: _load, child: const Text('Retry')),
          ],
        ),
      );
    }
    if (_donors.isEmpty) {
      return const Center(child: Text('No leads found'));
    }
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.separated(
        padding: const EdgeInsets.all(12),
        itemCount: _donors.length,
        separatorBuilder: (_, __) => const SizedBox(height: 8),
        itemBuilder: (context, i) {
          final d = _donors[i];
          return Container(
            padding: const EdgeInsets.all(12),
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
                      Text(d.donorName ?? '—', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                      const SizedBox(height: 2),
                      Text(d.donorMobile ?? '—', style: const TextStyle(fontSize: 12.5, color: AppColors.inkSoft)),
                      const SizedBox(height: 2),
                      Wrap(
                        spacing: 6,
                        children: [
                          if (d.station != null) _chip(d.station!, AppColors.inkSoft),
                          if (d.ngoId != null) _chip('NGO: ${d.ngoId}', const Color(0xFF6d28d9)),
                          if (d.status != null && d.status!.isNotEmpty) _chip(d.status!, AppColors.sage),
                        ],
                      ),
                    ],
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.phone, color: AppColors.sage),
                  onPressed: () => _call(d),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _chip(String text, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(text, style: TextStyle(fontSize: 10, color: color, fontWeight: FontWeight.w600)),
    );
  }
}
