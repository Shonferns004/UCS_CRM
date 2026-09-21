import 'package:flutter/material.dart';

import '../../core/api_client.dart';
import '../../core/constants.dart';
import '../../core/mumbai_metro.dart';
import '../../core/theme.dart';
import '../../models/metro.dart';
import '../../services/metro_service.dart';
import '../layout/main_layout.dart';
import '../widgets/common.dart';

class MetroLinesScreen extends StatefulWidget {
  const MetroLinesScreen({super.key});
  @override
  State<MetroLinesScreen> createState() => _MetroLinesScreenState();
}

class _MetroLinesScreenState extends State<MetroLinesScreen> {
  bool _loading = true;
  Object? _error;
  List<MetroLine> _lines = [];

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
      final all = await MetroLineService.getAll().then((p) => p.items);
      if (!mounted) return;
      setState(() {
        _lines = all;
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
      selected: 'metro-lines',
      title: 'Metro Lines',
      subtitle: 'Mumbai Metro network',
      body: RefreshIndicator(
        onRefresh: _load,
        child: _loading
            ? const LoadingSpinner(message: 'Loading lines...')
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
    return Card(
      elevation: 0,
      margin: EdgeInsets.zero,
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
            const Icon(Icons.chevron_right, color: AppColors.textLight),
          ],
        ),
      ),
    );
  }
}