import 'package:flutter/material.dart';
import 'package:lucide_flutter/lucide_flutter.dart';

import '../../core/api_client.dart';
import '../../core/constants.dart';
import '../../core/mumbai_metro.dart';
import '../../core/theme.dart';
import '../../models/metro.dart';
import '../../services/metro_service.dart';
import '../layout/main_layout.dart';
import '../widgets/common.dart';

class NetworkScreen extends StatefulWidget {
  const NetworkScreen({super.key});
  @override
  State<NetworkScreen> createState() => _NetworkScreenState();
}

class _NetworkScreenState extends State<NetworkScreen> {
  bool _loading = true;
  Object? _error;
  List<MetroLine> _lines = [];
  List<Station> _stations = [];
  final Set<String> _expanded = {};

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
        MetroLineService.getAll().then((p) => p.items),
        StationService.getAll(params: {'limit': 1000}).then((p) => p.items),
      ]);
      if (!mounted) return;
      setState(() {
        _lines = results[0] as List<MetroLine>;
        _stations = results[1] as List<Station>;
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
    return AppScaffold(
      selected: 'network',
      title: 'Metro Network',
      subtitle: 'Lines and stations',
      body: RefreshIndicator(
        onRefresh: _load,
        child: _loading
            ? const LoadingSpinner(message: 'Loading network...')
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
                      for (final line in _lines) ...[
                        _lineCard(line),
                        const SizedBox(height: 12),
                      ],
                    ],
                  ),
      ),
    );
  }

  Widget _lineCard(MetroLine line) {
    final baseColor = colorFromHex(metroColors[line.id] ?? '#4f46e5');
    final lineStations = _stations.where((s) => s.lineId == line.id).toList();
    final expanded = _expanded.contains(line.id);
    return Card(
      elevation: 0,
      margin: EdgeInsets.zero,
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          InkWell(
            onTap: () => setState(() {
              if (!_expanded.add(line.id)) _expanded.remove(line.id);
            }),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  Container(
                    width: 52,
                    height: 52,
                    decoration: BoxDecoration(
                      color: baseColor,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    alignment: Alignment.center,
                    child: Text(
                      line.code,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 20,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(line.name,
                            style: const TextStyle(
                                fontSize: 15, fontWeight: FontWeight.w700)),
                        const SizedBox(height: 4),
                        Text(
                          '${line.stationCount} stations · ${humanizeLabel(line.status)}',
                          style: const TextStyle(
                              fontSize: 12.5, color: AppColors.textLight),
                        ),
                      ],
                    ),
                  ),
                  Icon(
                    expanded
                        ? LucideIcons.chevronUp
                        : LucideIcons.chevronDown,
                    color: AppColors.textLight,
                  ),
                ],
              ),
            ),
          ),
          if (expanded) ...[
            const Divider(height: 1),
            if (lineStations.isEmpty)
              const Padding(
                padding: EdgeInsets.all(16),
                child: Text('No stations recorded',
                    style: TextStyle(
                        fontSize: 13, color: AppColors.textLight)),
              )
            else
              for (final s in lineStations)
                ListTile(
                  dense: true,
                  leading: _dot(s.lineId),
                  title: Text(s.name,
                      style: const TextStyle(fontWeight: FontWeight.w600)),
                  subtitle: Text(
                    'Line ${lineNumber(s.lineId)} · ${s.stationCode}',
                    style: const TextStyle(
                        fontSize: 12, color: AppColors.textLight),
                  ),
                ),
          ],
        ],
      ),
    );
  }

  Widget _dot(String lineId) {
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