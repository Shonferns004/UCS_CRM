import 'package:flutter/material.dart';

import '../../core/api_client.dart';
import '../../core/mumbai_metro.dart';
import '../../core/theme.dart';
import '../../models/metro.dart';
import '../../services/metro_service.dart';
import '../layout/main_layout.dart';
import '../widgets/common.dart';
import '../widgets/filter_bar.dart';

class StationsScreen extends StatefulWidget {
  const StationsScreen({super.key});
  @override
  State<StationsScreen> createState() => _StationsScreenState();
}

class _StationsScreenState extends State<StationsScreen> {
  bool _loading = true;
  Object? _error;
  List<Station> _stations = [];
  Map<String, String?> _filters = {'line_id': null};

  @override
  void initState() {
    super.initState();
    // default to all lines
    _filters = {'line_id': 'all'};
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final all = await StationService.getAll(params: {'limit': 1000}).then((p) => p.items);
      if (!mounted) return;
      setState(() {
        _stations = all;
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

  List<Station> get _visible {
    final lid = _filters['line_id'];
    if (lid == null || lid == 'all') return _stations;
    return _stations.where((s) => s.lineId == lid).toList();
  }

  @override
  Widget build(BuildContext context) {
    return AppScaffold(
      selected: 'stations',
      title: 'Stations',
      subtitle: 'Metro stations across all lines',
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            FilterBar(
              filters: [
                FilterDef(
                  key: 'line_id',
                  label: 'Line',
                  options: displayLineIds,
                  labels: {for (final l in displayLineIds) l: 'Line ${lineNumber(l)}'},
                ),
              ],
              values: _filters,
              onChanged: (v) => setState(() => _filters = v),
              onClear: () => setState(() => _filters = {'line_id': 'all'}),
            ),
            if (_loading)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 40),
                child: Center(child: LoadingSpinner(message: 'Loading stations...')),
              )
            else if (_error != null)
              ErrorState(
                message: toApiException(_error!).message,
                onRetry: _load,
              )
            else
              Card(
                elevation: 0,
                margin: EdgeInsets.zero,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Padding(
                      padding: const EdgeInsets.all(16),
                      child: Chip(
                        label: Text('${_visible.length} stations'),
                        avatar: const Icon(Icons.directions_subway,
                            size: 16),
                      ),
                    ),
                    const Divider(height: 1),
                    for (final s in _visible)
                      ListTile(
                        leading: _lineDot(s.lineId),
                        title: Text(s.name,
                            style: const TextStyle(
                                fontWeight: FontWeight.w600)),
                        subtitle: Text(
                          'Line ${lineNumber(s.lineId)} · ${s.stationCode}',
                          style: const TextStyle(
                              fontSize: 12, color: AppColors.textLight),
                        ),
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.chevron_right,
                                color: AppColors.textLight),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _lineDot(String lineId) {
    return Container(
      width: 10,
      height: 10,
      decoration: BoxDecoration(
        color: colorFromHex(metroColors[lineId] ?? '#4f46e5'),
        shape: BoxShape.circle,
      ),
    );
  }
}