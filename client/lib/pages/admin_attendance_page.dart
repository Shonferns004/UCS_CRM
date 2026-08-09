import 'dart:async';
import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:intl/intl.dart';
import '../services/api_service.dart';
import '../services/realtime_service.dart';
import '../main.dart';
import '../utils/responsive.dart';
import '../widgets/skeleton_loader.dart';
import 'worker_attendance_detail_page.dart';

class AdminAttendancePage extends StatefulWidget {
  const AdminAttendancePage({super.key});

  @override
  State<AdminAttendancePage> createState() => _AdminAttendancePageState();
}

class _AdminAttendancePageState extends State<AdminAttendancePage> {
  List<dynamic> _records = [];
  List<dynamic> _workers = [];
  DateTime _selectedDate = DateTime.now();
  bool _loading = true;
  String? _error;
  Timer? _refreshTimer;

  @override
  void initState() {
    super.initState();
    _load();
    RealtimeService.instance.addListener(_onRealtimeChange);
    _refreshTimer = Timer.periodic(const Duration(seconds: 30), (_) => _load(silent: true));
  }

  @override
  void dispose() {
    RealtimeService.instance.removeListener(_onRealtimeChange);
    _refreshTimer?.cancel();
    super.dispose();
  }

  void _onRealtimeChange() {
    final event = RealtimeService.instance.lastEvent;
    if (event == RealtimeEvent.attendance || event == RealtimeEvent.corrections) {
      _load(silent: true);
    }
  }

  Future<void> _load({bool silent = false}) async {
    if (!silent) setState(() { _loading = true; _error = null; });
    try {
      final results = await Future.wait([ApiService.getAllAttendance(), ApiService.getAllWorkers()]);
      if (mounted) {
        setState(() {
          _records = results[0];
          _workers = results[1];
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = e.toString().replaceFirst('Exception: ', '');
        });
      }
    }
  }

  String get _dateKey {
    final d = _selectedDate;
    return '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
  }

  List<dynamic> get _dayRecords {
    return _records.where((r) => (r['date']?.toString() ?? '') == _dateKey).toList();
  }

  Map<String, dynamic> _recordForWorker(String workerId) {
    for (final r in _dayRecords) {
      if ((r['worker_id']?.toString() ?? '') == workerId) return Map<String, dynamic>.from(r);
    }
    return {};
  }

  List<dynamic> get _sortedWorkers {
    final list = List<dynamic>.from(_workers);
    list.sort((a, b) {
      final an = (a['name']?.toString() ?? '').toLowerCase();
      final bn = (b['name']?.toString() ?? '').toLowerCase();
      return an.compareTo(bn);
    });
    return list;
  }

  int get _presentCount {
    return _workers.where((w) {
      final r = _recordForWorker(w['id']?.toString() ?? '');
      final s = r['status']?.toString() ?? 'absent';
      return s == 'present' || s == 'late';
    }).length;
  }

  int get _lateCount {
    return _workers.where((w) {
      final r = _recordForWorker(w['id']?.toString() ?? '');
      return r['status']?.toString() == 'late';
    }).length;
  }

  int get _leaveCount {
    return _workers.where((w) {
      final r = _recordForWorker(w['id']?.toString() ?? '');
      return r['status']?.toString() == 'leave';
    }).length;
  }

  int get _absentCount {
    return _workers.where((w) {
      final r = _recordForWorker(w['id']?.toString() ?? '');
      final s = r['status']?.toString() ?? 'absent';
      return s == 'absent' || s.isEmpty;
    }).length;
  }

  void _shiftDay(int delta) {
    setState(() => _selectedDate = _selectedDate.add(Duration(days: delta)));
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _selectedDate,
      firstDate: DateTime(2020),
      lastDate: DateTime.now().add(const Duration(days: 1)),
    );
    if (picked != null) setState(() => _selectedDate = picked);
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColors>()!;
    final scheme = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;

    return Scaffold(
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: EdgeInsets.symmetric(horizontal: Responsive.pad(context, 16), vertical: Responsive.pad(context, 8)),
              child: Row(
                children: [
                  Text('Attendance', style: tt.headlineSmall?.copyWith(fontWeight: FontWeight.w700, color: scheme.primary)),
                  const Spacer(),
                  IconButton(icon: const Icon(LucideIcons.plus), onPressed: _workers.isEmpty ? null : _openAddSheet, tooltip: 'Add attendance'),
                  IconButton(icon: const Icon(LucideIcons.refreshCw), onPressed: () => _load(), tooltip: 'Refresh'),
                ],
              ),
            ),
            Padding(
              padding: EdgeInsets.symmetric(horizontal: Responsive.pad(context, 16)),
              child: Container(
                padding: EdgeInsets.symmetric(horizontal: Responsive.pad(context, 8), vertical: Responsive.pad(context, 6)),
                decoration: BoxDecoration(
                  color: colors.surfaceContainerHigh,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  children: [
                    IconButton(icon: const Icon(LucideIcons.chevronLeft), onPressed: () => _shiftDay(-1)),
                    Expanded(
                      child: InkWell(
                        onTap: _pickDate,
                        borderRadius: BorderRadius.circular(8),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(vertical: 10),
                          child: Column(
                            children: [
                              Text(
                                DateFormat('EEEE, d MMMM yyyy').format(_selectedDate),
                                style: tt.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                                textAlign: TextAlign.center,
                              ),
                              if (!_loading && _workers.isNotEmpty) ...[
                                const SizedBox(height: 2),
                                Text(
                                  'Present $_presentCount · Late $_lateCount · Leave $_leaveCount · Absent $_absentCount',
                                  style: tt.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
                                  textAlign: TextAlign.center,
                                ),
                              ],
                            ],
                          ),
                        ),
                      ),
                    ),
                    IconButton(icon: const Icon(LucideIcons.chevronRight), onPressed: () => _shiftDay(1)),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 8),
            Expanded(
              child: _loading
                  ? const _DayListSkeleton()
                  : _error != null
                      ? _buildError(scheme, tt)
                      : RefreshIndicator(
                          onRefresh: () => _load(),
                          child: _buildList(tt, scheme),
                        ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildError(ColorScheme scheme, TextTheme tt) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(LucideIcons.cloudOff, size: Responsive.sp(context, 40), color: scheme.outline),
          const SizedBox(height: 12),
          Text(_error ?? 'Failed to load attendance', style: tt.bodyMedium?.copyWith(color: scheme.onSurfaceVariant)),
          const SizedBox(height: 12),
          OutlinedButton(onPressed: _load, child: const Text('Retry')),
        ],
      ),
    );
  }

  Widget _buildList(TextTheme tt, ColorScheme scheme) {
    if (_workers.isEmpty) {
      return _empty(tt, scheme, LucideIcons.users, 'No workers found');
    }
    return ListView.builder(
      padding: EdgeInsets.fromLTRB(Responsive.pad(context, 16), Responsive.pad(context, 8), Responsive.pad(context, 16), Responsive.pad(context, 40)),
      itemCount: _sortedWorkers.length,
      itemBuilder: (context, i) => _workerCard(_sortedWorkers[i], tt, scheme),
    );
  }

  Widget _workerCard(dynamic worker, TextTheme tt, ColorScheme scheme) {
    final id = worker['id']?.toString() ?? '';
    final record = _recordForWorker(id);
    final status = record['status']?.toString() ?? 'absent';

    Color statusColor;
    IconData statusIcon;
    String statusLabel;
    switch (status) {
      case 'present':
        statusColor = const Color(0xFF16a34a);
        statusIcon = LucideIcons.checkCircle2;
        statusLabel = 'Present';
        break;
      case 'late':
        statusColor = const Color(0xFFd97706);
        statusIcon = LucideIcons.alertTriangle;
        statusLabel = 'Late';
        break;
      case 'leave':
        statusColor = const Color(0xFF2563eb);
        statusIcon = LucideIcons.calendarDays;
        statusLabel = 'Leave';
        break;
      default:
        statusColor = const Color(0xFFdc2626);
        statusIcon = LucideIcons.minusCircle;
        statusLabel = 'Absent';
    }

    String? punchIn;
    String? punchOut;
    String? hours;
    if (record.isNotEmpty) {
      punchIn = _formatTime(record['punch_in_time']);
      punchOut = _formatTime(record['punch_out_time']);
      hours = record['hours_worked']?.toString();
    }

    return GestureDetector(
      onTap: () {
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => WorkerAttendanceDetailPage(worker: worker),
          ),
        );
      },
      child: Container(
        margin: EdgeInsets.only(bottom: Responsive.pad(context, 10)),
        padding: EdgeInsets.all(Responsive.pad(context, 14)),
        decoration: BoxDecoration(
          color: scheme.surface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: scheme.outlineVariant.withValues(alpha: 0.4)),
        ),
        child: Row(
          children: [
            CircleAvatar(
              radius: Responsive.pad(context, 20),
              backgroundColor: statusColor.withValues(alpha: 0.12),
              child: Icon(statusIcon, color: statusColor, size: Responsive.sp(context, 20)),
            ),
            SizedBox(width: Responsive.pad(context, 12)),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(worker['name']?.toString() ?? 'Unknown', style: tt.bodyLarge?.copyWith(fontWeight: FontWeight.w600)),
                  if ((worker['department']?.toString() ?? '').isNotEmpty)
                    Text(worker['department'].toString(), style: tt.bodySmall?.copyWith(color: scheme.onSurfaceVariant)),
                  if (punchIn != null || punchOut != null) ...[
                    const SizedBox(height: 4),
                    Text(
                      [if (punchIn != null) 'In: $punchIn', if (punchOut != null) 'Out: $punchOut', if (hours != null) hours]
                          .join('  ·  '),
                      style: tt.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
                    ),
                  ],
                ],
              ),
            ),
            Container(
              padding: EdgeInsets.symmetric(horizontal: Responsive.pad(context, 10), vertical: Responsive.pad(context, 6)),
              decoration: BoxDecoration(
                color: statusColor.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(statusLabel, style: tt.labelSmall?.copyWith(color: statusColor, fontWeight: FontWeight.w700)),
            ),
            SizedBox(width: Responsive.pad(context, 4)),
            Icon(LucideIcons.chevronRight, size: Responsive.sp(context, 16), color: scheme.outlineVariant),
          ],
        ),
      ),
    );
  }

  String? _formatTime(dynamic time) {
    if (time == null || time.toString().isEmpty) return null;
    final parsed = DateTime.tryParse(time.toString());
    if (parsed == null) return null;
    return DateFormat('h:mm a').format(parsed.toLocal());
  }

  Widget _empty(TextTheme tt, ColorScheme scheme, IconData icon, String message) {
    return LayoutBuilder(
      builder: (context, constraints) => SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        child: SizedBox(
          height: constraints.maxHeight,
          child: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(icon, size: Responsive.sp(context, 40), color: scheme.outline),
                const SizedBox(height: 12),
                Text(message, style: tt.bodyMedium?.copyWith(color: scheme.onSurfaceVariant)),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _openAddSheet() async {
    final changed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => _AddAttendanceSheet(
        workers: _workers,
        onSave: (payload) async {
          final result = await ApiService.createAttendance(payload);
          return result;
        },
      ),
    );
    if (changed == true) _load();
  }
}

class _DayListSkeleton extends StatelessWidget {
  const _DayListSkeleton();

  @override
  Widget build(BuildContext context) {
    return SkeletonLoader(
      child: ListView.builder(
        padding: EdgeInsets.fromLTRB(Responsive.pad(context, 16), Responsive.pad(context, 8), Responsive.pad(context, 16), Responsive.pad(context, 40)),
        physics: const NeverScrollableScrollPhysics(),
        itemCount: 8,
        itemBuilder: (context, i) => Container(
          margin: EdgeInsets.only(bottom: Responsive.pad(context, 10)),
          padding: EdgeInsets.all(Responsive.pad(context, 14)),
          decoration: BoxDecoration(
            color: const Color(0xFFf6fafe),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: const Color(0xFFe0e4ea)),
          ),
          child: const Row(
            children: [
              SkeletonBlock(width: 40, height: 40, borderRadius: 20),
              SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SkeletonBlock(height: 14, width: 120),
                    SizedBox(height: 8),
                    SkeletonBlock(height: 12),
                  ],
                ),
              ),
              SkeletonBlock(width: 60, height: 24, borderRadius: 12),
            ],
          ),
        ),
      ),
    );
  }
}

class _AddAttendanceSheet extends StatefulWidget {
  final List<dynamic> workers;
  final Future<Map<String, dynamic>> Function(Map<String, dynamic> payload) onSave;
  const _AddAttendanceSheet({required this.workers, required this.onSave});

  @override
  State<_AddAttendanceSheet> createState() => _AddAttendanceSheetState();
}

class _AddAttendanceSheetState extends State<_AddAttendanceSheet> {
  String? _workerId;
  DateTime _date = DateTime.now();
  TimeOfDay _inTime = const TimeOfDay(hour: 9, minute: 0);
  TimeOfDay _outTime = const TimeOfDay(hour: 18, minute: 0);
  String _status = 'present';
  bool _saving = false;
  String? _error;

  List<dynamic> get _sortedWorkers {
    final list = List<dynamic>.from(widget.workers);
    list.sort((a, b) {
      final an = (a['name']?.toString() ?? '').toLowerCase();
      final bn = (b['name']?.toString() ?? '').toLowerCase();
      return an.compareTo(bn);
    });
    return list;
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _date,
      firstDate: DateTime(2020),
      lastDate: DateTime.now().add(const Duration(days: 1)),
    );
    if (picked != null) setState(() => _date = picked);
  }

  Future<void> _pickTime({required bool isIn}) async {
    final picked = await showTimePicker(
      context: context,
      initialTime: isIn ? _inTime : _outTime,
    );
    if (picked != null) {
      setState(() => isIn ? _inTime = picked : _outTime = picked);
    }
  }

  Future<void> _save() async {
    if (_workerId == null) {
      setState(() => _error = 'Please select a worker');
      return;
    }
    setState(() { _saving = true; _error = null; });
    try {
      final dateStr = '${_date.year}-${_date.month.toString().padLeft(2, '0')}-${_date.day.toString().padLeft(2, '0')}';
      String toUtcIso(TimeOfDay t) => DateTime.utc(_date.year, _date.month, _date.day, t.hour, t.minute)
          .subtract(const Duration(hours: 5, minutes: 30))
          .toIso8601String();
      final payload = {
        'worker_id': _workerId,
        'date': dateStr,
        'punch_in_time': toUtcIso(_inTime),
        'punch_out_time': toUtcIso(_outTime),
        'status': _status,
        'late_minutes': _status == 'late' ? 15 : 0,
      };
      await widget.onSave(payload);
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) {
        setState(() {
          _saving = false;
          _error = e.toString().replaceFirst('Exception: ', '');
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;
    return Padding(
      padding: EdgeInsets.only(
        left: Responsive.pad(context, 24),
        right: Responsive.pad(context, 24),
        top: Responsive.pad(context, 20),
        bottom: MediaQuery.of(context).viewInsets.bottom + Responsive.pad(context, 32),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(
            child: Container(width: Responsive.pad(context, 40), height: Responsive.pad(context, 4),
              decoration: BoxDecoration(color: Colors.grey.shade300, borderRadius: BorderRadius.circular(2))),
          ),
          SizedBox(height: Responsive.pad(context, 16)),
          Text('Add Attendance', style: tt.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
          SizedBox(height: Responsive.pad(context, 20)),
          DropdownButtonFormField<String>(
            value: _workerId,
            isExpanded: true,
            decoration: InputDecoration(
              labelText: 'Worker',
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
              contentPadding: EdgeInsets.symmetric(horizontal: Responsive.pad(context, 14), vertical: Responsive.pad(context, 12)),
            ),
            items: _sortedWorkers.map((w) =>
              DropdownMenuItem(value: w['id'].toString(), child: Text('${w['name']?.toString() ?? ''}${(w['department']?.toString() ?? '').isEmpty ? '' : ' (${w['department']})'}'))
            ).toList(),
            onChanged: (v) => setState(() => _workerId = v),
          ),
          SizedBox(height: Responsive.pad(context, 16)),
          InkWell(
            onTap: _pickDate,
            borderRadius: BorderRadius.circular(10),
            child: Container(
              width: double.infinity,
              padding: EdgeInsets.symmetric(horizontal: Responsive.pad(context, 14), vertical: Responsive.pad(context, 14)),
              decoration: BoxDecoration(
                border: Border.all(color: scheme.outlineVariant),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Row(
                children: [
                  Icon(LucideIcons.calendarDays, size: Responsive.sp(context, 18), color: scheme.onSurfaceVariant),
                  SizedBox(width: Responsive.pad(context, 10)),
                  Text(DateFormat('EEEE, d MMMM yyyy').format(_date),
                    style: TextStyle(fontSize: Responsive.sp(context, 15), fontWeight: FontWeight.w600)),
                ],
              ),
            ),
          ),
          SizedBox(height: Responsive.pad(context, 16)),
          Row(
            children: [
              Expanded(child: _timeField('Punch In', _inTime, () => _pickTime(isIn: true))),
              SizedBox(width: Responsive.pad(context, 16)),
              Expanded(child: _timeField('Punch Out', _outTime, () => _pickTime(isIn: false))),
            ],
          ),
          SizedBox(height: Responsive.pad(context, 16)),
          DropdownButtonFormField<String>(
            value: _status,
            decoration: InputDecoration(
              labelText: 'Status',
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
              contentPadding: EdgeInsets.symmetric(horizontal: Responsive.pad(context, 14), vertical: Responsive.pad(context, 12)),
            ),
            items: const [
              DropdownMenuItem(value: 'present', child: Text('Present')),
              DropdownMenuItem(value: 'late', child: Text('Late')),
              DropdownMenuItem(value: 'absent', child: Text('Absent')),
              DropdownMenuItem(value: 'leave', child: Text('Leave')),
            ],
            onChanged: (v) => setState(() => _status = v!),
          ),
          if (_error != null) ...[
            SizedBox(height: Responsive.pad(context, 12)),
            Text(_error!, style: tt.bodySmall?.copyWith(color: const Color(0xFFdc2626))),
          ],
          SizedBox(height: Responsive.pad(context, 20)),
          SizedBox(
            width: double.infinity,
            height: Responsive.pad(context, 46),
            child: ElevatedButton(
              onPressed: _saving ? null : _save,
              style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF2563eb)),
              child: _saving
                  ? const ButtonSkeleton()
                  : const Text('Save'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _timeField(String label, TimeOfDay time, VoidCallback onTap) {
    final scheme = Theme.of(context).colorScheme;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        padding: EdgeInsets.symmetric(horizontal: Responsive.pad(context, 14), vertical: Responsive.pad(context, 12)),
        decoration: BoxDecoration(
          border: Border.all(color: scheme.outlineVariant),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: TextStyle(fontSize: Responsive.sp(context, 12), color: scheme.onSurfaceVariant)),
            SizedBox(height: Responsive.pad(context, 4)),
            Text(DateFormat('h:mm a').format(DateTime(2000, 1, 1, time.hour, time.minute)),
              style: TextStyle(fontSize: Responsive.sp(context, 16), fontWeight: FontWeight.w700)),
          ],
        ),
      ),
    );
  }
}
