import '../../core/lucide_icons.dart';
import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_skeleton.dart';
import '../../services/api_service.dart';
import '../beneficiaries/qr_scanner_page.dart';
import '../distribution/distribution_page.dart';

class TasksPage extends StatefulWidget {
  const TasksPage({super.key});

  @override
  State<TasksPage> createState() => _TasksPageState();
}

class _TasksPageState extends State<TasksPage> {
  List<dynamic> _tasks = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadTasks();
  }

  Future<void> _loadTasks() async {
    setState(() => _loading = true);
    try {
      final result = await ApiService.get('/tasks');
      setState(() => _tasks = result['data'] ?? result['tasks'] ?? []);
    } catch (_) {}
    setState(() => _loading = false);
  }

  IconData _taskIcon(String? type) {
    switch (type) {
      case 'CHECK_IN': return LucideIcons.userCheck;
      case 'DISTRIBUTE': return LucideIcons.package;
      case 'COLLECT_BIOMETRIC': return LucideIcons.fingerprint;
      case 'HOME_VISIT': return LucideIcons.home;
      default: return LucideIcons.clipboardCheck;
    }
  }

  Color _taskColor(String? status) {
    switch (status) {
      case 'COMPLETED': return AppTheme.success;
      case 'IN_PROGRESS': return AppTheme.warning;
      default: return AppTheme.secondary;
    }
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Column(
        children: [
          const Padding(
            padding: EdgeInsets.all(16),
            child: Row(
              children: [
                Text('My Tasks', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
              ],
            ),
          ),
Expanded(
            child: _loading
                ? const SkeletonList()
                : _tasks.isEmpty
                    ? const Center(child: Text('No pending tasks', style: TextStyle(color: AppTheme.textSecondary)))
                    : ListView.separated(
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        itemCount: _tasks.length,
                        separatorBuilder: (_, _) => const SizedBox(height: 8),
                        itemBuilder: (ctx, i) => _taskCard(_tasks[i]),
                      ),
          ),
        ],
      ),
    );
  }

  Widget _taskCard(Map<String, dynamic> task) {
    final type = task['task_type'] ?? task['type'] ?? '';
    final title = task['title'] ?? task['description'] ?? 'Task';
    final status = task['status'] ?? 'PENDING';
    final dueDate = task['due_date'] ?? '';
    final color = _taskColor(status);

    return GestureDetector(
      onTap: () {
        if (type == 'CHECK_IN' || type == 'SCAN') {
          Navigator.push(context, MaterialPageRoute(builder: (_) => const QrScannerPage()));
        } else if (type == 'DISTRIBUTE') {
          Navigator.push(context, MaterialPageRoute(builder: (_) => const DistributionPage()));
        }
      },
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppTheme.outline),
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: color.withAlpha(20),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Icon(_taskIcon(type), color: color, size: 20),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
                  if (dueDate.isNotEmpty)
                    Text(dueDate, style: const TextStyle(fontSize: 11, color: AppTheme.textSecondary)),
                ],
              ),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(
                color: color.withAlpha(20),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(status, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: color)),
            ),
          ],
        ),
      ),
    );
  }
}


