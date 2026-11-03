import 'dart:async';
import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:intl/intl.dart';
import '../services/api_service.dart';
import '../services/realtime_service.dart';
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
  Map<String, dynamic>? _rollback;
  bool _rollbackLoading = false;
  String? _rollbackError;

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
    final workerId = widget.worker['id'].toString();
    final requestedMonth = _monthKey;
    try {
      // Records load on their own. The rollback summary is a separate request
      // on purpose: it must never delay or break the attendance list.
      final records = await ApiService.getWorkerMonthlyAttendance(workerId, requestedMonth);
      if (!mounted || requestedMonth != _monthKey) return;
      setState(() {
        _records = List<dynamic>.from(records)
          ..sort((a, b) => (b['date']?.toString() ?? '').compareTo(a['date']?.toString() ?? ''));
        _loading = false;
      });
    } catch (e) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = e.toString().replaceFirst('Exception: ', '');
        });
      }
      return;
    }
    await _loadRollback(workerId, requestedMonth);
  }

  Future<void> _loadRollback(String workerId, String month) async {
    if (mounted) setState(() { _rollbackLoading = true; _rollbackError = null; });
    try {
      final info = await ApiService.getLateRollbackInfo(workerId, month);
      if (!mounted || month != _monthKey) return;
      setState(() {
        _rollback = info;
        _rollbackLoading = false;
      });
    } catch (e) {
      if (!mounted || month != _monthKey) return;
      setState(() {
        _rollback = null;
        _rollbackLoading = false;
        _rollbackError = e.toString().replaceFirst('Exception: ', '');
      });
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
    final scheme = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;

    return Scaffold(
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildHeader(scheme, tt),
            const SizedBox(height: 12),
            _buildMonthBar(scheme, tt),
            _buildRollbackBar(scheme, tt),
            const SizedBox(height: 12),
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
                                  padding: EdgeInsets.fromLTRB(Responsive.pad(context, 16), 0, Responsive.pad(context, 16), Responsive.pad(context, 40)),
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

  Widget _buildHeader(ColorScheme scheme, TextTheme tt) {
    final name = widget.worker['name']?.toString() ?? 'Worker';
    final dept = widget.worker['department']?.toString() ?? '';

    return Padding(
      padding: EdgeInsets.fromLTRB(Responsive.pad(context, 4), Responsive.pad(context, 8), Responsive.pad(context, 8), 0),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(LucideIcons.arrowLeft),
            color: scheme.onSurface,
            onPressed: () => Navigator.pop(context),
          ),
          const SizedBox(width: 4),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Attendance Details', style: tt.headlineSmall?.copyWith(fontWeight: FontWeight.w700, color: scheme.onSurface)),
                const SizedBox(height: 2),
                Text(
                  dept.isNotEmpty ? '$name · $dept' : name,
                  style: tt.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          IconButton(
            style: IconButton.styleFrom(
              backgroundColor: scheme.secondary.withValues(alpha: 0.1),
              foregroundColor: scheme.secondary,
            ),
            icon: const Icon(LucideIcons.plus),
            onPressed: _records.isEmpty ? null : _openAddSheet,
            tooltip: 'Add record',
          ),
          const SizedBox(width: 4),
          IconButton(
            style: IconButton.styleFrom(
              backgroundColor: scheme.secondary.withValues(alpha: 0.1),
              foregroundColor: scheme.secondary,
            ),
            icon: const Icon(LucideIcons.refreshCw),
            onPressed: () => _load(),
            tooltip: 'Refresh',
          ),
        ],
      ),
    );
  }

  Widget _buildMonthBar(ColorScheme scheme, TextTheme tt) {
    return Padding(
      padding: EdgeInsets.symmetric(horizontal: Responsive.pad(context, 16)),
      child: Row(
        children: [
          Expanded(
            child: Container(
              padding: EdgeInsets.symmetric(horizontal: Responsive.pad(context, 6), vertical: Responsive.pad(context, 4)),
              decoration: BoxDecoration(
                color: scheme.surface,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: scheme.outlineVariant.withValues(alpha: 0.6)),
              ),
              child: Row(
                children: [
                  IconButton(icon: const Icon(LucideIcons.chevronLeft), onPressed: _prevMonth),
                  Expanded(
                    child: InkWell(
                      onTap: _pickMonthYear,
                      borderRadius: BorderRadius.circular(8),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 10),
                        child: Column(
                          children: [
                            Text(
                              DateFormat('MMMM yyyy').format(DateTime(_selectedYear, _selectedMonth)),
                              style: tt.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                              textAlign: TextAlign.center,
                            ),
                            const SizedBox(height: 2),
                            Text(
                              '${_records.length} record${_records.length == 1 ? '' : 's'}',
                              style: tt.labelSmall?.copyWith(color: scheme.onSurfaceVariant),
                              textAlign: TextAlign.center,
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                  IconButton(icon: const Icon(LucideIcons.chevronRight), onPressed: _nextMonth),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  String _fmtDays(double v) => v == v.roundToDouble() ? v.toInt().toString() : v.toStringAsFixed(1);

  void _toast(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), behavior: SnackBarBehavior.floating),
    );
  }

  // Payroll's late deduction for this month, with the admin grace rollback (if
  // any) applied. Only the 180-min grace is waivable — that is the number that
  // gets charged by mistake when a leave/proof lands after payroll runs.
  Widget _buildRollbackBar(ColorScheme scheme, TextTheme tt) {
    // Still asking the server — a slim placeholder so the list underneath is
    // never blocked by this extra call.
    if (_rollbackLoading && _rollback == null) {
      return Padding(
        padding: EdgeInsets.symmetric(horizontal: Responsive.pad(context, 16)),
        child: Container(
          margin: EdgeInsets.only(top: Responsive.pad(context, 10)),
          padding: EdgeInsets.symmetric(horizontal: Responsive.pad(context, 12), vertical: Responsive.pad(context, 10)),
          decoration: BoxDecoration(
            color: scheme.surface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: scheme.outlineVariant.withValues(alpha: 0.6)),
          ),
          child: Row(
            children: [
              SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2, color: scheme.primary)),
              SizedBox(width: Responsive.pad(context, 10)),
              Text('Checking late deduction…', style: tt.labelSmall?.copyWith(color: scheme.onSurfaceVariant)),
            ],
          ),
        ),
      );
    }

    // The request failed — say so and offer a retry instead of showing nothing.
    if (_rollbackError != null && _rollback == null) {
      return Padding(
        padding: EdgeInsets.symmetric(horizontal: Responsive.pad(context, 16)),
        child: Container(
          margin: EdgeInsets.only(top: Responsive.pad(context, 10)),
          padding: EdgeInsets.fromLTRB(
            Responsive.pad(context, 12),
            Responsive.pad(context, 8),
            Responsive.pad(context, 4),
            Responsive.pad(context, 8),
          ),
          decoration: BoxDecoration(
            color: const Color(0xFFFFF7F5),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: const Color(0xFFF0C4BC)),
          ),
          child: Row(
            children: [
              const Icon(LucideIcons.alertCircle, size: 18, color: Color(0xFFB3261E)),
              SizedBox(width: Responsive.pad(context, 10)),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Late deduction unavailable', style: tt.bodySmall?.copyWith(fontWeight: FontWeight.w700, color: scheme.onSurface)),
                    const SizedBox(height: 2),
                    Text(_rollbackError!, style: tt.labelSmall?.copyWith(color: const Color(0xFF7A2E27)), maxLines: 2, overflow: TextOverflow.ellipsis),
                  ],
                ),
              ),
              TextButton(
                onPressed: () => _loadRollback(widget.worker['id'].toString(), _monthKey),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
      );
    }

    final info = _rollback;
    if (info == null) return const SizedBox.shrink();

    final computed = (info['computedLateDeductionDays'] as num?)?.toDouble() ?? 0;
    final waivedMinutes = (info['waivedMinutes'] as num?)?.toInt() ?? 0;
    final effective = (info['effectiveLateDeductionDays'] as num?)?.toDouble() ?? computed;
    final graceMinutes = (info['graceMinutes'] as num?)?.toInt() ?? 180;
    final hasRollback = waivedMinutes > 0;
    final lateMinutes = (info['totalLateMinutes'] as num?)?.toInt() ?? 0;

    return Padding(
      padding: EdgeInsets.symmetric(horizontal: Responsive.pad(context, 16)),
      child: Container(
        margin: EdgeInsets.only(top: Responsive.pad(context, 10)),
        padding: EdgeInsets.fromLTRB(
          Responsive.pad(context, 12),
          Responsive.pad(context, 8),
          Responsive.pad(context, 4),
          Responsive.pad(context, 8),
        ),
        decoration: BoxDecoration(
          color: hasRollback ? const Color(0xFFEDF7F0) : scheme.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: hasRollback ? const Color(0xFFB7DFC4) : scheme.outlineVariant.withValues(alpha: 0.6),
          ),
        ),
        child: Row(
          children: [
            Icon(
              LucideIcons.undo2,
              size: Responsive.sp(context, 18),
              color: hasRollback ? const Color(0xFF2a6a4b) : scheme.onSurfaceVariant,
            ),
            SizedBox(width: Responsive.pad(context, 10)),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    computed > 0
                        ? 'Late deduction: ${_fmtDays(effective)} day(s)'
                        : 'No late deduction this month',
                    style: tt.bodySmall?.copyWith(fontWeight: FontWeight.w700, color: scheme.onSurface),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    hasRollback
                        ? '$graceMinutes min grace rolled back · $lateMinutes late min'
                        : computed > 0
                            ? 'From $lateMinutes late min · roll back the $graceMinutes min grace'
                            : '$lateMinutes late min · within grace',
                    style: tt.labelSmall?.copyWith(color: scheme.onSurfaceVariant),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
            TextButton(
              onPressed: (computed > 0 || hasRollback) ? _openRollbackSheet : null,
              child: Text(hasRollback ? 'Manage' : 'Rollback'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _openRollbackSheet() async {
    final info = _rollback;
    if (info == null) return;

    final computed = (info['computedLateDeductionDays'] as num?)?.toDouble() ?? 0;
    final lateMinutes = (info['totalLateMinutes'] as num?)?.toInt() ?? 0;
    final graceMinutes = (info['graceMinutes'] as num?)?.toInt() ?? 180;
    final existing = info['rollback'] as Map<String, dynamic>?;
    final waivedMinutes = (existing?['waivedMinutes'] as num?)?.toInt() ?? 0;
    final monthLabel = DateFormat('MMMM yyyy').format(DateTime(_selectedYear, _selectedMonth));

    final reasonCtrl = TextEditingController();
    var busy = false;

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setSheet) {
            Future<void> submit() async {
              final reason = reasonCtrl.text.trim();
              if (reason.length < 3) {
                _toast('A reason is required');
                return;
              }
              setSheet(() => busy = true);
              try {
                await ApiService.setLateRollback(widget.worker['id'].toString(), _monthKey, reason);
                if (ctx.mounted) Navigator.pop(ctx);
                await _load(silent: true);
                _toast('$graceMinutes min grace rolled back');
              } catch (e) {
                if (ctx.mounted) setSheet(() => busy = false);
                _toast(e.toString().replaceFirst('Exception: ', ''));
              }
            }

            Future<void> remove() async {
              setSheet(() => busy = true);
              try {
                await ApiService.clearLateRollback(widget.worker['id'].toString(), _monthKey);
                if (ctx.mounted) Navigator.pop(ctx);
                await _load(silent: true);
                _toast('Rollback removed');
              } catch (e) {
                if (ctx.mounted) setSheet(() => busy = false);
                _toast(e.toString().replaceFirst('Exception: ', ''));
              }
            }

            return Padding(
              padding: EdgeInsets.fromLTRB(
                Responsive.pad(ctx, 20),
                Responsive.pad(ctx, 16),
                Responsive.pad(ctx, 20),
                MediaQuery.viewInsetsOf(ctx).bottom + Responsive.pad(ctx, 20),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Center(
                    child: Container(
                      width: Responsive.pad(ctx, 40),
                      height: Responsive.pad(ctx, 4),
                      decoration: BoxDecoration(color: Colors.grey.shade300, borderRadius: BorderRadius.circular(2)),
                    ),
                  ),
                  SizedBox(height: Responsive.pad(ctx, 16)),
                  Text('Roll back $graceMinutes min grace', style: TextStyle(
                    fontSize: Responsive.sp(ctx, 17), fontWeight: FontWeight.w700, color: const Color(0xFF1f1f1f),
                  )),
                  const SizedBox(height: 6),
                  Text(
                    '$monthLabel · $lateMinutes late min · currently ${_fmtDays(computed)} day(s) deducted',
                    style: TextStyle(fontSize: Responsive.sp(ctx, 12), color: const Color(0xFF6B7280)),
                  ),
                  const SizedBox(height: 10),
                  Container(
                    padding: EdgeInsets.all(Responsive.pad(ctx, 10)),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF4F6FA),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: const Color(0xFFE2E6EF)),
                    ),
                    child: Row(
                      children: [
                        const Icon(LucideIcons.info, size: 16, color: Color(0xFF5B6472)),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            'The $graceMinutes free minutes are given back, then the normal tiers are recomputed on '
                            '${lateMinutes - graceMinutes} late min for this month.',
                            style: TextStyle(fontSize: Responsive.sp(ctx, 12), color: const Color(0xFF5B6472)),
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (waivedMinutes > 0) ...[
                    const SizedBox(height: 12),
                    Container(
                      padding: EdgeInsets.all(Responsive.pad(ctx, 10)),
                      decoration: BoxDecoration(
                        color: const Color(0xFFEDF7F0),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: const Color(0xFFB7DFC4)),
                      ),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Icon(LucideIcons.circleCheck, size: 16, color: Color(0xFF2a6a4b)),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              '$waivedMinutes min already rolled back'
                              '${existing?['reason'] != null ? '\nReason: ${existing!['reason']}' : ''}',
                              style: TextStyle(fontSize: Responsive.sp(ctx, 12), color: const Color(0xFF2a6a4b)),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                  SizedBox(height: Responsive.pad(ctx, 14)),
                  TextField(
                    controller: reasonCtrl,
                    maxLines: 2,
                    maxLength: 200,
                    decoration: InputDecoration(
                      labelText: 'Reason (kept in the audit trail)',
                      hintText: 'e.g. leave proof was approved after payroll ran',
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                    ),
                  ),
                  SizedBox(height: Responsive.pad(ctx, 4)),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      onPressed: busy ? null : submit,
                      child: busy
                          ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                          : Text(waivedMinutes > 0 ? 'Update reason' : 'Roll back $graceMinutes min'),
                    ),
                  ),
                  if (waivedMinutes > 0) ...[
                    SizedBox(height: Responsive.pad(ctx, 8)),
                    SizedBox(
                      width: double.infinity,
                      child: OutlinedButton(
                        onPressed: busy ? null : remove,
                        child: const Text('Remove rollback'),
                      ),
                    ),
                  ],
                ],
              ),
            );
          },
        );
      },
    );

    reasonCtrl.dispose();
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
    var status = record['status']?.toString() ?? 'absent';
    final dateStr = record['date']?.toString() ?? '';
    final dt = DateTime.tryParse(dateStr);

    final punchIn = _formatTime(record['punch_in_time']);
    final punchOut = _formatTime(record['punch_out_time']);
    final hours = _hoursWorked(record['punch_in_time'], record['punch_out_time']);
    final hasId = record['id'] != null;
    final lateMinutes = (record['late_minutes'] ?? 0) > 0 ? record['late_minutes'] : null;

    if (punchIn != null && (status == 'absent' || status.isEmpty)) {
      final lateMin = record['late_minutes'];
      if (lateMin != null && (lateMin is int ? lateMin : (lateMin is num ? lateMin.toInt() : 0)) > 0) {
        status = 'late';
      } else {
        status = 'present';
      }
    }

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
      case 'half-day':
        statusColor = const Color(0xFF7c3aed);
        statusLabel = 'Half Day';
        break;
      case 'leave':
        statusColor = const Color(0xFF2563eb);
        statusLabel = 'Leave';
        break;
      default:
        statusColor = const Color(0xFFdc2626);
        statusLabel = 'Absent';
    }

    return GestureDetector(
      onLongPress: hasId ? () => _confirmDelete(record) : null,
      child: Container(
        margin: EdgeInsets.only(bottom: Responsive.pad(context, 10)),
        decoration: BoxDecoration(
          color: scheme.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: scheme.outlineVariant.withValues(alpha: 0.5)),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.03),
              blurRadius: 6,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              width: Responsive.pad(context, 62),
              padding: EdgeInsets.symmetric(vertical: Responsive.pad(context, 12)),
              decoration: BoxDecoration(
                color: statusColor.withValues(alpha: 0.1),
                borderRadius: const BorderRadius.only(topLeft: Radius.circular(16), bottomLeft: Radius.circular(16)),
              ),
              child: dt == null
                  ? Center(child: Icon(LucideIcons.calendarX, color: statusColor, size: Responsive.sp(context, 20)))
                  : Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(DateFormat('d').format(dt), style: tt.titleLarge?.copyWith(fontWeight: FontWeight.w800, color: statusColor, height: 1.1)),
                        Text(DateFormat('EEE').format(dt).toUpperCase(), style: tt.labelSmall?.copyWith(color: statusColor, fontWeight: FontWeight.w700, letterSpacing: 0.4)),
                        const SizedBox(height: 2),
                        Text(DateFormat('MMM').format(dt), style: tt.labelSmall?.copyWith(color: scheme.onSurfaceVariant)),
                      ],
                    ),
            ),
            Expanded(
              child: Padding(
                padding: EdgeInsets.all(Responsive.pad(context, 12)),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Container(
                          padding: EdgeInsets.symmetric(horizontal: Responsive.pad(context, 10), vertical: Responsive.pad(context, 4)),
                          decoration: BoxDecoration(
                            color: statusColor.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Text(statusLabel, style: tt.labelSmall?.copyWith(color: statusColor, fontWeight: FontWeight.w800)),
                        ),
                        if (hours != null) ...[
                          const Spacer(),
                          Icon(LucideIcons.timer, size: Responsive.sp(context, 13), color: scheme.onSurfaceVariant),
                          const SizedBox(width: 4),
                          Text(hours, style: tt.labelSmall?.copyWith(color: scheme.onSurfaceVariant, fontWeight: FontWeight.w700)),
                        ],
                      ],
                    ),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        _timePill(scheme, tt, LucideIcons.logIn, 'In', punchIn, const Color(0xFF16a34a)),
                        const SizedBox(width: 10),
                        _timePill(scheme, tt, LucideIcons.logOut, 'Out', punchOut, const Color(0xFFd97706)),
                      ],
                    ),
                    if (lateMinutes != null) ...[
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Icon(LucideIcons.alertTriangle, size: Responsive.sp(context, 13), color: const Color(0xFFd97706)),
                          const SizedBox(width: 5),
                          Text('Late by $lateMinutes min', style: tt.labelSmall?.copyWith(color: const Color(0xFFd97706), fontWeight: FontWeight.w700)),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
            ),
            if (hasId)
              Align(
                alignment: Alignment.topCenter,
                child: Padding(
                  padding: EdgeInsets.only(top: Responsive.pad(context, 6)),
                  child: IconButton(
                    icon: Icon(LucideIcons.pencil, size: Responsive.sp(context, 17)),
                    onPressed: () => _openEditSheet(record),
                    tooltip: 'Edit',
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _timePill(ColorScheme scheme, TextTheme tt, IconData icon, String label, String? value, Color color) {
    return Expanded(
      child: Container(
        padding: EdgeInsets.symmetric(horizontal: Responsive.pad(context, 10), vertical: Responsive.pad(context, 7)),
        decoration: BoxDecoration(
          color: scheme.surfaceContainerLow.withValues(alpha: 0.7),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: scheme.outlineVariant.withValues(alpha: 0.4)),
        ),
        child: Row(
          children: [
            Icon(icon, size: Responsive.sp(context, 14), color: color),
            SizedBox(width: Responsive.pad(context, 6)),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label, style: tt.labelSmall?.copyWith(color: scheme.onSurfaceVariant, fontSize: Responsive.sp(context, 10))),
                  Text(
                    value ?? '--',
                    style: tt.bodyMedium?.copyWith(fontWeight: FontWeight.w700, color: value == null ? scheme.onSurfaceVariant : scheme.onSurface),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
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

  Future<void> _confirmDelete(dynamic record) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Attendance'),
        content: Text('Delete attendance for ${record['date']?.toString() ?? 'this day'}?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: TextButton.styleFrom(foregroundColor: const Color(0xFFdc2626)),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    try {
      await ApiService.deleteAttendance(record['id'].toString());
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Attendance deleted')),
        );
        _load();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))),
        );
      }
    }
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
  TimeOfDay? _inTime;
  TimeOfDay? _outTime;
  late String _status;
  bool _saving = false;
  String? _error;

  String get _dateStr => widget.record['date']?.toString() ?? '';

  @override
  void initState() {
    super.initState();
    final pi = DateTime.tryParse(widget.record['punch_in_time']?.toString() ?? '')?.toLocal();
    final po = DateTime.tryParse(widget.record['punch_out_time']?.toString() ?? '')?.toLocal();
    _inTime = pi != null ? TimeOfDay.fromDateTime(pi) : null;
    _outTime = po != null ? TimeOfDay.fromDateTime(po) : null;
    _status = widget.record['status']?.toString() ?? 'present';
  }

  Future<void> _pickTime({required bool isIn}) async {
    final picked = await showTimePicker(
      context: context,
      initialTime: isIn ? (_inTime ?? const TimeOfDay(hour: 9, minute: 0)) : (_outTime ?? const TimeOfDay(hour: 18, minute: 0)),
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
        'punch_in_time': _inTime != null ? _combine(_inTime!).toIso8601String() : null,
        'punch_out_time': _outTime != null ? _combine(_outTime!).toIso8601String() : null,
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
                child: _timeField('Punch In', _inTime, () => _pickTime(isIn: true), onClear: () => setState(() => _inTime = null)),
              ),
              SizedBox(width: Responsive.pad(context, 16)),
              Expanded(
                child: _timeField('Punch Out', _outTime, () => _pickTime(isIn: false), onClear: () => setState(() => _outTime = null)),
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
              DropdownMenuItem(value: 'half-day', child: Text('Half Day')),
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

  Widget _timeField(String label, TimeOfDay? time, VoidCallback onTap, {VoidCallback? onClear}) {
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
            Row(
              children: [
                Expanded(
                  child: Text(label, style: TextStyle(fontSize: Responsive.sp(context, 12), color: scheme.onSurfaceVariant)),
                ),
                if (time != null && onClear != null)
                  InkWell(
                    onTap: onClear,
                    borderRadius: BorderRadius.circular(4),
                    child: Padding(
                      padding: const EdgeInsets.all(2),
                      child: Icon(LucideIcons.x, size: Responsive.sp(context, 14), color: scheme.onSurfaceVariant),
                    ),
                  ),
              ],
            ),
            SizedBox(height: Responsive.pad(context, 4)),
            Text(
              time != null
                  ? DateFormat('h:mm a').format(DateTime(2000, 1, 1, time.hour, time.minute))
                  : 'Not set',
              style: TextStyle(
                fontSize: Responsive.sp(context, 16),
                fontWeight: FontWeight.w700,
                color: time != null ? null : scheme.onSurfaceVariant,
              ),
            ),
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
              DropdownMenuItem(value: 'half-day', child: Text('Half Day')),
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
