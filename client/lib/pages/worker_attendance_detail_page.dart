import 'dart:async';
import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:intl/intl.dart';
import '../services/api_service.dart';
import '../services/realtime_service.dart';
import '../main.dart';
import '../utils/responsive.dart';
import '../widgets/skeleton_loader.dart';

class WorkerAttendanceDetailPage extends StatefulWidget {
  final dynamic worker;
  const WorkerAttendanceDetailPage({super.key, required this.worker});

  @override
  State<WorkerAttendanceDetailPage> createState() => _WorkerAttendanceDetailPageState();
}

class _WorkerAttendanceDetailPageState extends State<WorkerAttendanceDetailPage> {
  List<dynamic> _records = [];
  int _selectedMonth = DateTime.now().month;
  int _selectedYear = DateTime.now().year;
  bool _loading = true;
  String? _error;
  Timer? _refreshTimer;

  String get _monthKey => '$_selectedYear-${_selectedMonth.toString().padLeft(2, '0')}';

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
      final records = await ApiService.getWorkerMonthlyAttendance(
        widget.worker['id'].toString(),
        _monthKey,
      );
      if (mounted) {
        setState(() {
          _records = records;
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

  void _prevMonth() {
    setState(() {
      if (_selectedMonth == 1) {
        _selectedMonth = 12;
        _selectedYear--;
      } else {
        _selectedMonth--;
      }
    });
    _load();
  }

  void _nextMonth() {
    setState(() {
      if (_selectedMonth == 12) {
        _selectedMonth = 1;
        _selectedYear++;
      } else {
        _selectedMonth++;
      }
    });
    _load();
  }

  Future<void> _pickMonthYear() async {
    final now = DateTime.now();
    final years = List.generate(5, (i) => now.year - 2 + i);
    int tempMonth = _selectedMonth;
    int tempYear = _selectedYear;

    final picked = await showModalBottomSheet<(int, int)?>(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setSheetState) {
            return Padding(
              padding: EdgeInsets.fromLTRB(Responsive.pad(ctx, 24), Responsive.pad(ctx, 20), Responsive.pad(ctx, 24), Responsive.pad(ctx, 32)),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(width: Responsive.pad(ctx, 40), height: Responsive.pad(ctx, 4),
                    decoration: BoxDecoration(color: Colors.grey.shade300, borderRadius: BorderRadius.circular(2))),
                  SizedBox(height: Responsive.pad(ctx, 20)),
                  Text('Select Month & Year', style: TextStyle(
                    fontSize: Responsive.sp(ctx, 17), fontWeight: FontWeight.w700, color: const Color(0xFF1f1f1f),
                  )),
                  SizedBox(height: Responsive.pad(ctx, 20)),
                  Row(
                    children: [
                      Expanded(
                        child: DropdownButtonFormField<int>(
                          value: tempMonth,
                          decoration: InputDecoration(
                            labelText: 'Month',
                            border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                            contentPadding: EdgeInsets.symmetric(horizontal: Responsive.pad(ctx, 14), vertical: Responsive.pad(ctx, 12)),
                          ),
                          items: List.generate(12, (i) => i + 1).map((m) =>
                            DropdownMenuItem(value: m, child: Text(DateFormat('MMMM').format(DateTime(2000, m))))
                          ).toList(),
                          onChanged: (v) => setSheetState(() => tempMonth = v!),
                        ),
                      ),
                      SizedBox(width: Responsive.pad(ctx, 16)),
                      Expanded(
                        child: DropdownButtonFormField<int>(
                          value: tempYear,
                          decoration: InputDecoration(
                            labelText: 'Year',
                            border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                            contentPadding: EdgeInsets.symmetric(horizontal: Responsive.pad(ctx, 14), vertical: Responsive.pad(ctx, 12)),
                          ),
                          items: years.map((y) =>
                            DropdownMenuItem(value: y, child: Text(y.toString()))
                          ).toList(),
                          onChanged: (v) => setSheetState(() => tempYear = v!),
                        ),
                      ),
                    ],
                  ),
                  SizedBox(height: Responsive.pad(ctx, 20)),
                  SizedBox(
                    width: double.infinity,
                    height: Responsive.pad(ctx, 44),
                    child: ElevatedButton(
                      onPressed: () => Navigator.pop(ctx, (tempMonth, tempYear)),
                      style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF2563eb)),
                      child: const Text('OK'),
                    ),
                  ),
                ],
              ),
            );
          },
        );
      },
    );
    if (picked != null) {
      setState(() {
        _selectedMonth = picked.$1;
        _selectedYear = picked.$2;
      });
      _load();
    }
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
                  IconButton(
                    icon: const Icon(LucideIcons.arrowLeft),
                    onPressed: () => Navigator.pop(context),
                  ),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(widget.worker['name']?.toString() ?? 'Worker', style: tt.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
                        if ((widget.worker['department']?.toString() ?? '').isNotEmpty)
                          Text(widget.worker['department'].toString(), style: tt.bodySmall?.copyWith(color: scheme.onSurfaceVariant)),
                      ],
                    ),
                  ),
                  IconButton(
                    icon: const Icon(LucideIcons.plus),
                    onPressed: _records.isEmpty ? null : _openAddSheet,
                    tooltip: 'Add record',
                  ),
                  IconButton(
                    icon: const Icon(LucideIcons.refreshCw),
                    onPressed: () => _load(),
                    tooltip: 'Refresh',
                  ),
                ],
              ),
            ),
            Padding(
              padding: EdgeInsets.symmetric(horizontal: Responsive.pad(context, 16)),
              child: Container(
                decoration: BoxDecoration(
                  color: colors.surfaceContainerHigh,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  children: [
                    IconButton(icon: const Icon(LucideIcons.chevronLeft), onPressed: _prevMonth),
                    Expanded(
                      child: InkWell(
                        onTap: _pickMonthYear,
                        borderRadius: BorderRadius.circular(8),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          child: Text(
                            DateFormat('MMMM yyyy').format(DateTime(_selectedYear, _selectedMonth)),
                            style: tt.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                            textAlign: TextAlign.center,
                          ),
                        ),
                      ),
                    ),
                    IconButton(icon: const Icon(LucideIcons.chevronRight), onPressed: _nextMonth),
                  ],
                ),
              ),
            ),
            if (!_loading && _records.isNotEmpty) _summaryChips(tt, scheme),
            const SizedBox(height: 8),
            Expanded(
              child: _loading
                  ? const _RecordsSkeleton()
                  : _error != null
                      ? _buildError(scheme, tt)
                      : RefreshIndicator(
                          onRefresh: () => _load(),
                          child: _records.isEmpty
                              ? _empty(tt, scheme, 'No records for this month')
                              : ListView.builder(
                                  padding: EdgeInsets.fromLTRB(Responsive.pad(context, 16), Responsive.pad(context, 8), Responsive.pad(context, 16), Responsive.pad(context, 40)),
                                  itemCount: _records.length,
                                  itemBuilder: (context, i) => _recordCard(_records[i], tt, scheme),
                                ),
                        ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _summaryChips(TextTheme tt, ColorScheme scheme) {
    final present = _records.where((r) => r['status']?.toString() == 'present').length;
    final late = _records.where((r) => r['status']?.toString() == 'late').length;
    final leave = _records.where((r) => r['status']?.toString() == 'leave').length;
    final absent = _records.where((r) => r['status']?.toString() == 'absent').length;
    final totalHours = _records.fold<int>(0, (sum, r) {
      final pi = DateTime.tryParse(r['punch_in_time']?.toString() ?? '');
      final po = DateTime.tryParse(r['punch_out_time']?.toString() ?? '');
      if (pi == null || po == null) return sum;
      return sum + (po.difference(pi).inMinutes);
    });

    return Padding(
      padding: EdgeInsets.symmetric(horizontal: Responsive.pad(context, 16), vertical: Responsive.pad(context, 8)),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: [
            _chip(tt, scheme, 'Present', present, const Color(0xFF16a34a)),
            _chip(tt, scheme, 'Late', late, const Color(0xFFd97706)),
            _chip(tt, scheme, 'Leave', leave, const Color(0xFF2563eb)),
            _chip(tt, scheme, 'Absent', absent, const Color(0xFFdc2626)),
            _chip(tt, scheme, 'Hours', (totalHours / 60).toStringAsFixed(1), const Color(0xFF64748b)),
          ],
        ),
      ),
    );
  }

  Widget _chip(TextTheme tt, ColorScheme scheme, String label, dynamic value, Color color) {
    return Container(
      margin: const EdgeInsets.only(right: 8),
      padding: EdgeInsets.symmetric(horizontal: Responsive.pad(context, 12), vertical: Responsive.pad(context, 6)),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        children: [
          Text('$label: ', style: tt.labelSmall?.copyWith(color: scheme.onSurfaceVariant)),
          Text('$value', style: tt.labelSmall?.copyWith(color: color, fontWeight: FontWeight.w700)),
        ],
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

  Widget _recordCard(dynamic record, TextTheme tt, ColorScheme scheme) {
    final status = record['status']?.toString() ?? 'absent';
    final dateStr = record['date']?.toString() ?? '';
    final dt = DateTime.tryParse(dateStr);

    Color statusColor;
    String statusLabel;
    switch (status) {
      case 'present':
        statusColor = const Color(0xFF16a34a);
        statusLabel = 'Present';
        break;
      case 'late':
        statusColor = const Color(0xFFd97706);
        statusLabel = 'Late';
        break;
      case 'leave':
        statusColor = const Color(0xFF2563eb);
        statusLabel = 'Leave';
        break;
      default:
        statusColor = const Color(0xFFdc2626);
        statusLabel = 'Absent';
    }

    final punchIn = _formatTime(record['punch_in_time']);
    final punchOut = _formatTime(record['punch_out_time']);
    final hours = _hoursWorked(record['punch_in_time'], record['punch_out_time']);
    final hasId = record['id'] != null;

    return Container(
      margin: EdgeInsets.only(bottom: Responsive.pad(context, 10)),
      padding: EdgeInsets.all(Responsive.pad(context, 14)),
      decoration: BoxDecoration(
        color: scheme.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: scheme.outlineVariant.withValues(alpha: 0.4)),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(
                      dt != null ? DateFormat('EEE, dd MMM yyyy').format(dt) : dateStr,
                      style: tt.bodyMedium?.copyWith(fontWeight: FontWeight.w700),
                    ),
                    const Spacer(),
                    Container(
                      padding: EdgeInsets.symmetric(horizontal: Responsive.pad(context, 10), vertical: Responsive.pad(context, 4)),
                      decoration: BoxDecoration(
                        color: statusColor.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(statusLabel, style: tt.labelSmall?.copyWith(color: statusColor, fontWeight: FontWeight.w700)),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Icon(LucideIcons.logIn, size: Responsive.sp(context, 14), color: scheme.onSurfaceVariant),
                    SizedBox(width: Responsive.pad(context, 6)),
                    Text(punchIn ?? '--', style: tt.bodySmall),
                    SizedBox(width: Responsive.pad(context, 16)),
                    Icon(LucideIcons.logOut, size: Responsive.sp(context, 14), color: scheme.onSurfaceVariant),
                    SizedBox(width: Responsive.pad(context, 6)),
                    Text(punchOut ?? '--', style: tt.bodySmall),
                    if (hours != null) ...[
                      const Spacer(),
                      Text(hours, style: tt.bodySmall?.copyWith(color: scheme.onSurfaceVariant)),
                    ],
                  ],
                ),
                if ((record['late_minutes'] ?? 0) > 0)
                  Padding(
                    padding: EdgeInsets.only(top: Responsive.pad(context, 4)),
                    child: Text(
                      'Late ${record['late_minutes']} min',
                      style: tt.bodySmall?.copyWith(color: const Color(0xFFd97706)),
                    ),
                  ),
              ],
            ),
          ),
          if (hasId)
            IconButton(
              icon: Icon(LucideIcons.pencil, size: Responsive.sp(context, 18)),
              onPressed: () => _openEditSheet(record),
              tooltip: 'Edit',
            ),
        ],
      ),
    );
  }

  String? _formatTime(dynamic time) {
    if (time == null || time.toString().isEmpty) return null;
    final parsed = DateTime.tryParse(time.toString());
    if (parsed == null) return null;
    return DateFormat('h:mm a').format(parsed.toLocal());
  }

  String? _hoursWorked(dynamic inTime, dynamic outTime) {
    final pi = DateTime.tryParse(inTime?.toString() ?? '');
    final po = DateTime.tryParse(outTime?.toString() ?? '');
    if (pi == null || po == null) return null;
    final diff = po.difference(pi);
    final hours = diff.inHours;
    final minutes = diff.inMinutes % 60;
    return '${hours}h ${minutes}m';
  }

  Future<void> _openEditSheet(dynamic record) async {
    final changed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => _EditAttendanceSheet(
        record: record,
        onSave: (payload) async {
          final result = await ApiService.updateAttendance(record['id'].toString(), payload);
          return result;
        },
      ),
    );
    if (changed == true) _load();
  }

  Future<void> _openAddSheet() async {
    final changed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => _AddAttendanceSheet(
        worker: widget.worker,
        onSave: (payload) async {
          final result = await ApiService.createAttendance(payload);
          return result;
        },
      ),
    );
    if (changed == true) _load();
  }

  Widget _empty(TextTheme tt, ColorScheme scheme, String message) {
    return LayoutBuilder(
      builder: (context, constraints) => SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        child: SizedBox(
          height: constraints.maxHeight,
          child: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(LucideIcons.calendarDays, size: Responsive.sp(context, 40), color: scheme.outline),
                const SizedBox(height: 12),
                Text(message, style: tt.bodyMedium?.copyWith(color: scheme.onSurfaceVariant)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _RecordsSkeleton extends StatelessWidget {
  const _RecordsSkeleton();

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
          child: const Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SkeletonBlock(height: 14, width: 140),
              SizedBox(height: 12),
              SkeletonBlock(height: 12),
              SizedBox(height: 8),
              SkeletonBlock(height: 12, width: 200),
            ],
          ),
        ),
      ),
    );
  }
}

class _EditAttendanceSheet extends StatefulWidget {
  final dynamic record;
  final Future<Map<String, dynamic>> Function(Map<String, dynamic> payload) onSave;
  const _EditAttendanceSheet({required this.record, required this.onSave});

  @override
  State<_EditAttendanceSheet> createState() => _EditAttendanceSheetState();
}

class _EditAttendanceSheetState extends State<_EditAttendanceSheet> {
  late TimeOfDay _inTime;
  late TimeOfDay _outTime;
  late String _status;
  bool _saving = false;
  String? _error;

  String get _dateStr => widget.record['date']?.toString() ?? '';

  @override
  void initState() {
    super.initState();
    final pi = DateTime.tryParse(widget.record['punch_in_time']?.toString() ?? '')?.toLocal();
    final po = DateTime.tryParse(widget.record['punch_out_time']?.toString() ?? '')?.toLocal();
    _inTime = pi != null ? TimeOfDay.fromDateTime(pi) : const TimeOfDay(hour: 9, minute: 0);
    _outTime = po != null ? TimeOfDay.fromDateTime(po) : const TimeOfDay(hour: 18, minute: 0);
    _status = widget.record['status']?.toString() ?? 'present';
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

  DateTime _combine(TimeOfDay t) {
    final parts = _dateStr.split('-');
    final y = int.parse(parts[0]);
    final m = int.parse(parts[1]);
    final d = int.parse(parts[2]);
    return DateTime.utc(y, m, d, t.hour, t.minute)
        .subtract(const Duration(hours: 5, minutes: 30));
  }

  Future<void> _save() async {
    setState(() { _saving = true; _error = null; });
    try {
      final payload = {
        'punch_in_time': _combine(_inTime).toIso8601String(),
        'punch_out_time': _combine(_outTime).toIso8601String(),
        'status': _status,
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
          Text('Edit Attendance', style: tt.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
          SizedBox(height: Responsive.pad(context, 4)),
          Text(DateFormat('EEE, dd MMM yyyy').format(DateTime.parse(_dateStr)),
            style: tt.bodyMedium?.copyWith(color: scheme.onSurfaceVariant)),
          SizedBox(height: Responsive.pad(context, 20)),
          Row(
            children: [
              Expanded(
                child: _timeField('Punch In', _inTime, () => _pickTime(isIn: true)),
              ),
              SizedBox(width: Responsive.pad(context, 16)),
              Expanded(
                child: _timeField('Punch Out', _outTime, () => _pickTime(isIn: false)),
              ),
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

class _AddAttendanceSheet extends StatefulWidget {
  final dynamic worker;
  final Future<Map<String, dynamic>> Function(Map<String, dynamic> payload) onSave;
  const _AddAttendanceSheet({required this.worker, required this.onSave});

  @override
  State<_AddAttendanceSheet> createState() => _AddAttendanceSheetState();
}

class _AddAttendanceSheetState extends State<_AddAttendanceSheet> {
  DateTime _date = DateTime.now();
  TimeOfDay _inTime = const TimeOfDay(hour: 9, minute: 0);
  TimeOfDay _outTime = const TimeOfDay(hour: 18, minute: 0);
  String _status = 'present';
  bool _saving = false;
  String? _error;

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
    setState(() { _saving = true; _error = null; });
    try {
      final dateStr = '${_date.year}-${_date.month.toString().padLeft(2, '0')}-${_date.day.toString().padLeft(2, '0')}';
      String toUtcIso(TimeOfDay t) => DateTime.utc(_date.year, _date.month, _date.day, t.hour, t.minute)
          .subtract(const Duration(hours: 5, minutes: 30))
          .toIso8601String();
      final payload = {
        'worker_id': widget.worker['id'].toString(),
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
          SizedBox(height: Responsive.pad(context, 4)),
          Text(widget.worker['name']?.toString() ?? '', style: tt.bodyMedium?.copyWith(color: scheme.onSurfaceVariant)),
          SizedBox(height: Responsive.pad(context, 20)),
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
              Expanded(
                child: _timeField('Punch In', _inTime, () => _pickTime(isIn: true)),
              ),
              SizedBox(width: Responsive.pad(context, 16)),
              Expanded(
                child: _timeField('Punch Out', _outTime, () => _pickTime(isIn: false)),
              ),
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
