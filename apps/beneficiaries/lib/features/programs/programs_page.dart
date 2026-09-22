import '../../core/lucide_icons.dart';
import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_skeleton.dart';
import '../../services/api_service.dart';

class ProgramsPage extends StatefulWidget {
  const ProgramsPage({super.key});

  @override
  State<ProgramsPage> createState() => _ProgramsPageState();
}

class _ProgramsPageState extends State<ProgramsPage> {
  List<dynamic> _programs = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadPrograms();
  }

  Future<void> _loadPrograms() async {
    setState(() { _loading = true; _error = null; });
    try {
      final result = await ApiService.get('/programs', queryParams: {
        'status': 'APPROVED,ONGOING,PLANNED',
        'limit': '20',
      });
      setState(() {
        _programs = result['data'] ?? result['programs'] ?? [];
      });
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      setState(() => _loading = false);
    }
  }

  Color _statusColor(String? status) {
    switch (status) {
      case 'COMPLETED': return AppTheme.success;
      case 'ONGOING': return AppTheme.warning;
      case 'APPROVED': return AppTheme.secondary;
      case 'PLANNED': return const Color(0xFF6366F1);
      default: return AppTheme.textSecondary;
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
                Text('Programs', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
              ],
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: _loadPrograms,
child: _loading
                  ? const SkeletonList()
                  : _error != null
                      ? Center(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Text(_error!, style: const TextStyle(color: AppTheme.error, fontSize: 13)),
                              const SizedBox(height: 12),
                              OutlinedButton(onPressed: _loadPrograms, child: const Text('Retry')),
                            ],
                          ),
                        )
                      : _programs.isEmpty
                          ? const Center(child: Text('No programs found', style: TextStyle(color: AppTheme.textSecondary)))
                          : ListView.separated(
                              padding: const EdgeInsets.symmetric(horizontal: 16),
                              itemCount: _programs.length,
                              separatorBuilder: (_, _) => const SizedBox(height: 8),
                              itemBuilder: (ctx, i) => _programCard(_programs[i]),
                            ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _programCard(Map<String, dynamic> program) {
    final date = program['program_date'] ?? '';
    final title = program['title'] ?? 'Untitled';
    final status = program['status'] ?? 'DRAFT';
    final location = program['location_name'] ?? program['location'] ?? '';
    final assigned = program['assigned_count'] ?? 0;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppTheme.outline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(title, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: _statusColor(status).withAlpha(25),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(status, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: _statusColor(status))),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              const Icon(LucideIcons.calendar, size: 14, color: AppTheme.textSecondary),
              const SizedBox(width: 6),
              Text(date, style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
              if (location.isNotEmpty) ...[
                const SizedBox(width: 12),
                const Icon(LucideIcons.mapPin, size: 14, color: AppTheme.textSecondary),
                const SizedBox(width: 4),
                Text(location, style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
              ],
            ],
          ),
          const SizedBox(height: 8),
          Text('Assigned: $assigned', style: const TextStyle(fontSize: 12, color: AppTheme.secondary, fontWeight: FontWeight.w500)),
        ],
      ),
    );
  }
}


