import 'package:flutter/material.dart';
import '../../../core/theme/app_theme.dart';
import '../../../services/api_service.dart';

class TodayProgramCard extends StatefulWidget {
  const TodayProgramCard({super.key});

  @override
  State<TodayProgramCard> createState() => _TodayProgramCardState();
}

class _TodayProgramCardState extends State<TodayProgramCard> {
  List<dynamic> _programs = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadPrograms();
  }

  Future<void> _loadPrograms() async {
    try {
      final today = DateTime.now().toIso8601String().split('T')[0];
      final result = await ApiService.get('/programs', queryParams: {
        'date': today,
        'status': 'APPROVED,ONGOING',
      });
      setState(() => _programs = result['data'] ?? result['programs'] ?? []);
    } catch (_) {}
    setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text('Today\'s Programs', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
            if (_programs.isNotEmpty)
              TextButton(
                onPressed: () {
                  // Navigate to programs tab - handled by parent
                },
                child: const Text('View All', style: TextStyle(fontSize: 12)),
              ),
          ],
        ),
        if (_programs.isEmpty)
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: AppTheme.outline),
            ),
            child: const Center(
              child: Text('No programs scheduled today', style: TextStyle(color: AppTheme.textSecondary, fontSize: 13)),
            ),
          )
        else
          ..._programs.take(3).map((p) => Container(
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: AppTheme.outline),
            ),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: AppTheme.secondary.withAlpha(20),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: const Icon(Icons.event, color: AppTheme.secondary, size: 20),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(p['title'] ?? 'Program', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
                      Text(
                        '${p['start_time'] ?? ''} - ${p['end_time'] ?? ''} • ${p['location_name'] ?? ''}',
                        style: const TextStyle(fontSize: 11, color: AppTheme.textSecondary),
                      ),
                    ],
                  ),
                ),
                const Icon(Icons.chevron_right, color: AppTheme.textSecondary, size: 20),
              ],
            ),
          )),
      ],
    );
  }
}
