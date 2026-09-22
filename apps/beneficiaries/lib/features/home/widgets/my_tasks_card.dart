import '../../../core/lucide_icons.dart';
import 'package:flutter/material.dart';
import '../../../core/theme/app_theme.dart';
import '../../../services/api_service.dart';

class MyTasksCard extends StatefulWidget {
  const MyTasksCard({super.key});

  @override
  State<MyTasksCard> createState() => _MyTasksCardState();
}

class _MyTasksCardState extends State<MyTasksCard> {
  List<dynamic> _tasks = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadTasks();
  }

  Future<void> _loadTasks() async {
    try {
      final result = await ApiService.get('/tasks', queryParams: {'status': 'PENDING'});
      setState(() => _tasks = result['data'] ?? result['tasks'] ?? []);
    } catch (_) {}
    setState(() => _loading = false);
  }

  IconData _taskIcon(String? type) {
    switch (type) {
      case 'CHECK_IN': return LucideIcons.userCheck;
      case 'DISTRIBUTE': return LucideIcons.package;
      case 'COLLECT_BIOMETRIC': return LucideIcons.fingerprint;
      default: return LucideIcons.clipboardCheck;
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const SizedBox.shrink();
    if (_tasks.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Pending Tasks', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
        const SizedBox(height: 8),
        ..._tasks.take(3).map((t) => Container(
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppTheme.outline),
          ),
          child: Row(
            children: [
              Icon(_taskIcon(t['task_type'] ?? t['type']), color: AppTheme.secondary, size: 20),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(t['title'] ?? t['description'] ?? 'Task', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
                    if (t['due_date'] != null)
                      Text(t['due_date'], style: const TextStyle(fontSize: 11, color: AppTheme.textSecondary)),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: AppTheme.warning.withAlpha(25),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Text('PENDING', style: TextStyle(fontSize: 9, fontWeight: FontWeight.w600, color: AppTheme.warning)),
              ),
            ],
          ),
        )),
      ],
    );
  }
}



