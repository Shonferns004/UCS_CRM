import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:liquid_pull_to_refresh/liquid_pull_to_refresh.dart';
import '../widgets/ui_motion.dart';
import '../widgets/app_toast.dart';
import 'package:flutter_tabler_icons/flutter_tabler_icons.dart';
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
  List<dynamic> _pendingProofs = [];
  DateTime _selectedDate = DateTime.now();
  bool _loading = true;
  String? _error;
  Timer? _refreshTimer;
  final TextEditingController _searchController = TextEditingController();
  String _searchQuery = '';

  @override
  void initState() {
    super.initState();
    _load();
    RealtimeService.instance.addListener(_onRealtimeChange);
    _refreshTimer = Timer.periodic(
      const Duration(seconds: 30),
      (_) => _load(silent: true),
    );
  }

  @override
  void dispose() {
    RealtimeService.instance.removeListener(_onRealtimeChange);
    _refreshTimer?.cancel();
    _searchController.dispose();
    _searchDebounce?.cancel();
    super.dispose();
  }

  void _onRealtimeChange() {
    final event = RealtimeService.instance.lastEvent;
    if (event == RealtimeEvent.attendance ||
        event == RealtimeEvent.corrections ||
        event == RealtimeEvent.absenceProofs) {
      _load(silent: true);
    }
  }

  Future<void> _load({bool silent = false}) async {
    if (!silent)
      setState(() {
        _loading = true;
        _error = null;
      });
    try {
      final results = await Future.wait([
        ApiService.getAllAttendance(),
        ApiService.getAllWorkers(),
      ]).timeout(const Duration(seconds: 25));
      if (mounted) {
        setState(() {
          _records = results[0];
          _workers = results[1];
          _loading = false;
          _recomputeDerived();
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = e is TimeoutException
              ? 'Request timed out. Check your connection and retry.'
              : e.toString().replaceFirst('Exception: ', '');
        });
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
    _loadPendingProofs();
  }

  Future<void> _loadPendingProofs() async {
    try {
      final proofs = await ApiService.getPendingAbsenceProofs();
      if (mounted) setState(() => _pendingProofs = proofs);
    } catch (_) {}
  }

  String get _dateKey {
    final d = _selectedDate;
    return '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
  }

  List<dynamic> _dayRecords = [];
  Map<String, Map<String, dynamic>> _recordByWorker = {};
  List<dynamic> _filteredWorkers = [];
  int _presentCount = 0;
  int _lateCount = 0;
  int _halfDayCount = 0;
  int _leaveCount = 0;
  int _absentCount = 0;
  Timer? _searchDebounce;

  void _recomputeDerived() {
    _dayRecords = _records
        .where((r) => (r['date']?.toString() ?? '') == _dateKey)
        .toList();
    _recordByWorker = {};
    for (final r in _dayRecords) {
      final id = r['worker_id']?.toString() ?? '';
      if (id.isNotEmpty) _recordByWorker[id] = Map<String, dynamic>.from(r);
    }
    final sorted = List<dynamic>.from(_workers);
    sorted.sort((a, b) {
      final an = (a['name']?.toString() ?? '').toLowerCase();
      final bn = (b['name']?.toString() ?? '').toLowerCase();
      return an.compareTo(bn);
    });
    if (_searchQuery.isEmpty) {
      _filteredWorkers = sorted;
    } else {
      _filteredWorkers = sorted.where((w) {
        final name = (w['name']?.toString() ?? '').toLowerCase();
        final dept = (w['department']?.toString() ?? '').toLowerCase();
        return name.contains(_searchQuery) || dept.contains(_searchQuery);
      }).toList();
    }
    int present = 0, late = 0, half = 0, leave = 0, absent = 0;
    for (final w in _workers) {
      final r = _recordByWorker[w['id']?.toString() ?? ''] ?? const {};
      final s = r['status']?.toString() ?? 'absent';
      if (s == 'present' || s == 'late') present++;
      if (s == 'late') late++;
      if (s == 'half-day') half++;
      if (s == 'leave') leave++;
      if (s == 'absent' || s.isEmpty) absent++;
    }
    _presentCount = present;
    _lateCount = late;
    _halfDayCount = half;
    _leaveCount = leave;
    _absentCount = absent;
  }

  Map<String, dynamic> _recordForWorker(String workerId) {
    return _recordByWorker[workerId] ?? {};
  }

  bool get _canGoNext {
    final now = DateTime.now();
    if (_selectedDate.year != now.year) return _selectedDate.year < now.year;
    if (_selectedDate.month != now.month)
      return _selectedDate.month < now.month;
    return _selectedDate.day < now.day;
  }

  void _shiftDay(int delta) {
    if (delta > 0 && !_canGoNext) return;
    setState(() {
      _selectedDate = _selectedDate.add(Duration(days: delta));
      _recomputeDerived();
    });
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _selectedDate.isAfter(DateTime.now())
          ? DateTime.now()
          : _selectedDate,
      firstDate: DateTime(2020),
      lastDate: DateTime.now(),
    );
    if (picked != null)
      setState(() {
        _selectedDate = picked;
        _recomputeDerived();
      });
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColors>()!;
    final scheme = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;

    final isToday = _dateKey == _dateKeyOf(DateTime.now());

    return Scaffold(
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildHeader(tt, scheme),
            const SizedBox(height: 4),
            if (!_loading && _workers.isNotEmpty) _buildStats(scheme, tt),
            if (!_loading && _pendingProofs.isNotEmpty) ...[
              const SizedBox(height: 10),
              _buildProofBanner(scheme, tt),
            ],
            const SizedBox(height: 12),
            _buildDateBar(scheme, tt, colors, isToday),
            const SizedBox(height: 12),
            _buildSearch(scheme, tt, colors),
            const SizedBox(height: 8),
            Expanded(
              child: _loading
                  ? const _DayListSkeleton()
                  : _error != null
                  ? _buildError(scheme, tt)
                  : LiquidPullToRefresh(
                      color: const Color(0xFF4A78E0),
                      backgroundColor: const Color(0xFFF4F6FA),
                      showChildOpacityTransition: false,
                      springAnimationDurationInMilliseconds: 700,
                      onRefresh: () => _load(),
                      child: _buildList(tt, scheme),
                    ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildProofBanner(ColorScheme scheme, TextTheme tt) {
    final count = _pendingProofs.length;
    const amber = Color(0xFFB45309);
    return Padding(
      padding: EdgeInsets.symmetric(horizontal: Responsive.pad(context, 16)),
      child: Material(
        color: const Color(0xFFFFF3E0),
        borderRadius: BorderRadius.circular(18),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: _openProofReview,
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    color: amber.withValues(alpha: 0.14),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(
                    TablerIcons.file_alert,
                    size: 19,
                    color: amber,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '$count absence proof${count == 1 ? '' : 's'} to review',
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: Color(0xFF8A4B08),
                        ),
                      ),
                      const Text(
                        'Uploaded proofs from workers',
                        style: TextStyle(
                          fontSize: 11,
                          color: Color(0xFF8A4B08),
                        ),
                      ),
                    ],
                  ),
                ),
                const Text(
                  'Review',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: amber,
                  ),
                ),
                const Icon(TablerIcons.chevron_right, size: 16, color: amber),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _openProofReview() {
    showSpringSheet(
      context: context,
      builder: (_) => _AdminProofsSheet(
        proofs: List<dynamic>.from(_pendingProofs),
        onReviewed: (id) {
          setState(() {
            _pendingProofs.removeWhere(
              (p) => p['id']?.toString() == id.toString(),
            );
          });
        },
      ),
    );
  }

  String _dateKeyOf(DateTime d) =>
      '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  Widget _buildHeader(TextTheme tt, ColorScheme scheme) {
    return Padding(
      padding: EdgeInsets.fromLTRB(
        Responsive.pad(context, 16),
        Responsive.pad(context, 12),
        Responsive.pad(context, 8),
        0,
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Attendance',
                  style: tt.headlineSmall?.copyWith(
                    fontWeight: FontWeight.w700,
                    color: scheme.onSurface,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'Daily attendance for all workers',
                  style: tt.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
                ),
              ],
            ),
          ),
          IconButton(
            style: IconButton.styleFrom(
              backgroundColor: scheme.secondary.withValues(alpha: 0.1),
              foregroundColor: scheme.secondary,
            ),
            icon: const Icon(TablerIcons.plus),
            onPressed: _workers.isEmpty ? null : _openAddSheet,
            tooltip: 'Add attendance',
          ),
          const SizedBox(width: 4),
          IconButton(
            style: IconButton.styleFrom(
              backgroundColor: scheme.secondary.withValues(alpha: 0.1),
              foregroundColor: scheme.secondary,
            ),
            icon: const Icon(TablerIcons.refresh),
            onPressed: () => _load(),
            tooltip: 'Refresh',
          ),
        ],
      ),
    );
  }

  Widget _statCard(
    ColorScheme scheme,
    TextTheme tt, {
    required String label,
    required int value,
    required Color color,
    required IconData icon,
  }) {
    return Expanded(
      child: Container(
        padding: EdgeInsets.symmetric(
          horizontal: Responsive.pad(context, 6),
          vertical: Responsive.pad(context, 10),
        ),
        decoration: BoxDecoration(
          color: scheme.surface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: color.withValues(alpha: 0.18)),
          boxShadow: [
            BoxShadow(
              color: color.withValues(alpha: 0.05),
              blurRadius: 8,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Column(
          children: [
            Container(
              width: Responsive.pad(context, 28),
              height: Responsive.pad(context, 28),
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.12),
                shape: BoxShape.circle,
              ),
              child: Icon(icon, size: Responsive.sp(context, 15), color: color),
            ),
            const SizedBox(height: 6),
            Text(
              '$value',
              style: tt.titleLarge?.copyWith(
                fontWeight: FontWeight.w800,
                color: color,
                height: 1.1,
              ),
            ),
            Text(
              label,
              style: tt.labelSmall?.copyWith(
                color: scheme.onSurfaceVariant,
                fontSize: Responsive.sp(context, 10),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStats(ColorScheme scheme, TextTheme tt) {
    return Padding(
      padding: EdgeInsets.symmetric(horizontal: Responsive.pad(context, 16)),
      child: Row(
        children: [
          _statCard(
            scheme,
            tt,
            label: 'Present',
            value: _presentCount + _lateCount + _halfDayCount,
            color: const Color(0xff17a97f),
            icon: TablerIcons.circle_check,
          ),
          const SizedBox(width: 8),
          _statCard(
            scheme,
            tt,
            label: 'Late',
            value: _lateCount,
            color: const Color(0xFFd97706),
            icon: TablerIcons.alert_triangle,
          ),
          const SizedBox(width: 8),
          _statCard(
            scheme,
            tt,
            label: 'Leave',
            value: _leaveCount,
            color: const Color(0xFF4A78E0),
            icon: TablerIcons.calendar_event,
          ),
          const SizedBox(width: 8),
          _statCard(
            scheme,
            tt,
            label: 'Absent',
            value: _absentCount,
            color: const Color(0xFFdc2626),
            icon: TablerIcons.circle_minus,
          ),
        ],
      ),
    );
  }

  Widget _buildDateBar(
    ColorScheme scheme,
    TextTheme tt,
    AppColors colors,
    bool isToday,
  ) {
    return Padding(
      padding: EdgeInsets.symmetric(horizontal: Responsive.pad(context, 16)),
      child: Container(
        padding: EdgeInsets.symmetric(
          horizontal: Responsive.pad(context, 6),
          vertical: Responsive.pad(context, 4),
        ),
        decoration: BoxDecoration(
          color: scheme.primary,
          borderRadius: BorderRadius.circular(24),
          boxShadow: [
            BoxShadow(
              color: scheme.primary.withValues(alpha: 0.25),
              blurRadius: 14,
              offset: const Offset(0, 6),
            ),
          ],
        ),
        child: Row(
          children: [
            IconButton(
              icon: const Icon(TablerIcons.chevron_left, color: Colors.white),
              onPressed: () => _shiftDay(-1),
              tooltip: 'Previous day',
            ),
            Expanded(
              child: InkWell(
                onTap: _pickDate,
                borderRadius: BorderRadius.circular(18),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Column(
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Text(
                            isToday
                                ? 'Today'
                                : DateFormat('EEEE').format(_selectedDate),
                            style: tt.titleMedium?.copyWith(
                              fontWeight: FontWeight.w800,
                              color: Colors.white,
                              letterSpacing: 0.2,
                            ),
                          ),
                          if (!isToday) ...[
                            const SizedBox(width: 6),
                            Icon(
                              TablerIcons.chevron_down,
                              size: 14,
                              color: Colors.white70,
                            ),
                          ],
                        ],
                      ),
                      const SizedBox(height: 2),
                      Text(
                        DateFormat('d MMMM yyyy').format(_selectedDate),
                        style: tt.bodySmall?.copyWith(
                          color: Colors.white70,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            IconButton(
              icon: const Icon(TablerIcons.chevron_right, color: Colors.white),
              onPressed: _canGoNext ? () => _shiftDay(1) : null,
              tooltip: _canGoNext ? 'Next day' : 'Cannot view future days',
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSearch(ColorScheme scheme, TextTheme tt, AppColors colors) {
    return Padding(
      padding: EdgeInsets.symmetric(horizontal: Responsive.pad(context, 16)),
      child: TextField(
        controller: _searchController,
        onChanged: (v) {
          _searchDebounce?.cancel();
          _searchDebounce = Timer(const Duration(milliseconds: 300), () {
            if (mounted)
              setState(() {
                _searchQuery = v.trim().toLowerCase();
                _recomputeDerived();
              });
          });
        },
        decoration: InputDecoration(
          hintText: 'Search by name or department',
          hintStyle: tt.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
          prefixIcon: const Icon(TablerIcons.search, size: 20),
          suffixIcon: _searchQuery.isEmpty
              ? null
              : IconButton(
                  icon: const Icon(TablerIcons.x, size: 18),
                  onPressed: () {
                    _searchController.clear();
                    setState(() {
                      _searchQuery = '';
                      _searchController.clear();
                      _recomputeDerived();
                    });
                  },
                ),
          isDense: true,
          filled: true,
          fillColor: scheme.surface,
          contentPadding: const EdgeInsets.symmetric(vertical: 10),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: BorderSide(
              color: scheme.outlineVariant.withValues(alpha: 0.6),
            ),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: BorderSide(
              color: scheme.outlineVariant.withValues(alpha: 0.6),
            ),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: BorderSide(color: scheme.secondary, width: 1.4),
          ),
        ),
      ),
    );
  }

  Widget _buildError(ColorScheme scheme, TextTheme tt) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            TablerIcons.cloud_off,
            size: Responsive.sp(context, 40),
            color: scheme.outline,
          ),
          const SizedBox(height: 12),
          Text(
            _error ?? 'Failed to load attendance',
            style: tt.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
          ),
          const SizedBox(height: 12),
          OutlinedButton(onPressed: _load, child: const Text('Retry')),
        ],
      ),
    );
  }

  Widget _buildList(TextTheme tt, ColorScheme scheme) {
    final workers = _filteredWorkers;
    if (workers.isEmpty) {
      return _empty(
        tt,
        scheme,
        TablerIcons.users,
        _searchQuery.isEmpty
            ? 'No workers found'
            : 'No workers match your search',
      );
    }
    return ListView.builder(
      padding: EdgeInsets.fromLTRB(
        Responsive.pad(context, 16),
        Responsive.pad(context, 8),
        Responsive.pad(context, 16),
        Responsive.pad(context, 40),
      ),
      itemCount: workers.length,
      itemBuilder: (context, i) => _workerCard(workers[i], tt, scheme),
    );
  }

  Widget _workerCard(dynamic worker, TextTheme tt, ColorScheme scheme) {
    final id = worker['id']?.toString() ?? '';
    final record = _recordForWorker(id);

    String? punchIn;
    String? punchOut;
    String? hours;
    if (record.isNotEmpty) {
      punchIn = _formatTime(record['punch_in_time']);
      punchOut = _formatTime(record['punch_out_time']);
      hours = record['hours_worked']?.toString();
    }

    var status = record['status']?.toString() ?? 'absent';
    if (punchIn != null && (status == 'absent' || status.isEmpty)) {
      final lateMin = record['late_minutes'];
      if (lateMin != null &&
          (lateMin is int ? lateMin : (lateMin is num ? lateMin.toInt() : 0)) >
              0) {
        status = 'late';
      } else {
        status = 'present';
      }
    }

    Color statusColor;
    IconData statusIcon;
    String statusLabel;
    switch (status) {
      case 'present':
        statusColor = const Color(0xff17a97f);
        statusIcon = TablerIcons.circle_check;
        statusLabel = 'Present';
        break;
      case 'late':
        statusColor = const Color(0xFFd97706);
        statusIcon = TablerIcons.alert_triangle;
        statusLabel = 'Late';
        break;
      case 'half-day':
        statusColor = const Color(0xFF4A78E0);
        statusIcon = TablerIcons.clock;
        statusLabel = 'Half Day';
        break;
      case 'leave':
        statusColor = const Color(0xFF4A78E0);
        statusIcon = TablerIcons.calendar_event;
        statusLabel = 'Leave';
        break;
      default:
        statusColor = const Color(0xFFdc2626);
        statusIcon = TablerIcons.circle_minus;
        statusLabel = 'Absent';
    }

    final name = worker['name']?.toString() ?? 'Unknown';
    final dept = worker['department']?.toString() ?? '';

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
        padding: EdgeInsets.all(Responsive.pad(context, 12)),
        decoration: BoxDecoration(
          color: scheme.surface,
          borderRadius: BorderRadius.circular(24),

          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.03),
              blurRadius: 6,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Row(
          children: [
            Container(
              width: Responsive.pad(context, 44),
              height: Responsive.pad(context, 44),
              decoration: BoxDecoration(
                color: statusColor.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Icon(
                statusIcon,
                color: statusColor,
                size: Responsive.sp(context, 22),
              ),
            ),
            SizedBox(width: Responsive.pad(context, 12)),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    name,
                    style: tt.bodyLarge?.copyWith(fontWeight: FontWeight.w700),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  if (dept.isNotEmpty)
                    Text(
                      dept,
                      style: tt.bodySmall?.copyWith(
                        color: scheme.onSurfaceVariant,
                      ),
                    ),
                  if (punchIn != null || punchOut != null) ...[
                    const SizedBox(height: 6),
                    Wrap(
                      spacing: 10,
                      runSpacing: 4,
                      children: [
                        if (punchIn != null)
                          _punchChip(
                            scheme,
                            tt,
                            TablerIcons.login,
                            'In',
                            punchIn,
                            statusColor,
                          ),
                        if (punchOut != null)
                          _punchChip(
                            scheme,
                            tt,
                            TablerIcons.logout,
                            'Out',
                            punchOut,
                            statusColor,
                          ),
                        if (hours != null)
                          _punchChip(
                            scheme,
                            tt,
                            TablerIcons.hourglass,
                            '',
                            hours,
                            statusColor,
                          ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Container(
                  padding: EdgeInsets.symmetric(
                    horizontal: Responsive.pad(context, 10),
                    vertical: Responsive.pad(context, 5),
                  ),
                  decoration: BoxDecoration(
                    color: statusColor.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    statusLabel,
                    style: tt.labelSmall?.copyWith(
                      color: statusColor,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                const SizedBox(height: 6),
                Icon(
                  TablerIcons.chevron_right,
                  size: Responsive.sp(context, 16),
                  color: scheme.outlineVariant,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _punchChip(
    ColorScheme scheme,
    TextTheme tt,
    IconData icon,
    String prefix,
    String value,
    Color color,
  ) {
    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: Responsive.pad(context, 8),
        vertical: 3,
      ),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerLow.withValues(alpha: 0.8),
        borderRadius: BorderRadius.circular(22),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: Responsive.sp(context, 11), color: color),
          const SizedBox(width: 4),
          Text(
            prefix.isEmpty ? value : '$prefix $value',
            style: tt.labelSmall?.copyWith(
              color: scheme.onSurfaceVariant,
              fontWeight: FontWeight.w600,
            ),
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

  Widget _empty(
    TextTheme tt,
    ColorScheme scheme,
    IconData icon,
    String message,
  ) {
    return LayoutBuilder(
      builder: (context, constraints) => SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        child: SizedBox(
          height: constraints.maxHeight,
          child: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  icon,
                  size: Responsive.sp(context, 40),
                  color: scheme.outline,
                ),
                const SizedBox(height: 12),
                Text(
                  message,
                  style: tt.bodyMedium?.copyWith(
                    color: scheme.onSurfaceVariant,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _openAddSheet() async {
    final changed = await showSpringSheet<bool>(
      context: context,
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
        padding: EdgeInsets.fromLTRB(
          Responsive.pad(context, 16),
          Responsive.pad(context, 8),
          Responsive.pad(context, 16),
          Responsive.pad(context, 40),
        ),
        physics: const NeverScrollableScrollPhysics(),
        itemCount: 8,
        itemBuilder: (context, i) => Container(
          margin: EdgeInsets.only(bottom: Responsive.pad(context, 10)),
          padding: EdgeInsets.all(Responsive.pad(context, 14)),
          decoration: BoxDecoration(
            color: const Color(0xFFF4F6FA),
            borderRadius: BorderRadius.circular(14),
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
  final Future<Map<String, dynamic>> Function(Map<String, dynamic> payload)
  onSave;
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
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final dateStr =
          '${_date.year}-${_date.month.toString().padLeft(2, '0')}-${_date.day.toString().padLeft(2, '0')}';
      String toUtcIso(TimeOfDay t) => DateTime.utc(
        _date.year,
        _date.month,
        _date.day,
        t.hour,
        t.minute,
      ).subtract(const Duration(hours: 5, minutes: 30)).toIso8601String();
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
        bottom:
            MediaQuery.of(context).viewInsets.bottom +
            Responsive.pad(context, 32),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(
            child: Container(
              width: Responsive.pad(context, 40),
              height: Responsive.pad(context, 4),
              decoration: BoxDecoration(
                color: Colors.grey.shade300,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          SizedBox(height: Responsive.pad(context, 16)),
          Text(
            'Add Attendance',
            style: tt.titleLarge?.copyWith(fontWeight: FontWeight.w700),
          ),
          SizedBox(height: Responsive.pad(context, 20)),
          DropdownButtonFormField<String>(
            value: _workerId,
            isExpanded: true,
            decoration: InputDecoration(
              labelText: 'Worker',
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(18),
              ),
              contentPadding: EdgeInsets.symmetric(
                horizontal: Responsive.pad(context, 14),
                vertical: Responsive.pad(context, 12),
              ),
            ),
            items: _sortedWorkers
                .map(
                  (w) => DropdownMenuItem(
                    value: w['id'].toString(),
                    child: Text(
                      '${w['name']?.toString() ?? ''}${(w['department']?.toString() ?? '').isEmpty ? '' : ' (${w['department']})'}',
                    ),
                  ),
                )
                .toList(),
            onChanged: (v) => setState(() => _workerId = v),
          ),
          SizedBox(height: Responsive.pad(context, 16)),
          InkWell(
            onTap: _pickDate,
            borderRadius: BorderRadius.circular(18),
            child: Container(
              width: double.infinity,
              padding: EdgeInsets.symmetric(
                horizontal: Responsive.pad(context, 14),
                vertical: Responsive.pad(context, 14),
              ),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(18),
              ),
              child: Row(
                children: [
                  Icon(
                    TablerIcons.calendar_event,
                    size: Responsive.sp(context, 18),
                    color: scheme.onSurfaceVariant,
                  ),
                  SizedBox(width: Responsive.pad(context, 10)),
                  Text(
                    DateFormat('EEEE, d MMMM yyyy').format(_date),
                    style: TextStyle(
                      fontSize: Responsive.sp(context, 15),
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
          ),
          SizedBox(height: Responsive.pad(context, 16)),
          Row(
            children: [
              Expanded(
                child: _timeField(
                  'Punch In',
                  _inTime,
                  () => _pickTime(isIn: true),
                ),
              ),
              SizedBox(width: Responsive.pad(context, 16)),
              Expanded(
                child: _timeField(
                  'Punch Out',
                  _outTime,
                  () => _pickTime(isIn: false),
                ),
              ),
            ],
          ),
          SizedBox(height: Responsive.pad(context, 16)),
          DropdownButtonFormField<String>(
            value: _status,
            decoration: InputDecoration(
              labelText: 'Status',
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(18),
              ),
              contentPadding: EdgeInsets.symmetric(
                horizontal: Responsive.pad(context, 14),
                vertical: Responsive.pad(context, 12),
              ),
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
            Text(
              _error!,
              style: tt.bodySmall?.copyWith(color: const Color(0xFFdc2626)),
            ),
          ],
          SizedBox(height: Responsive.pad(context, 20)),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _saving ? null : _save,
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF4A78E0),
                minimumSize: const Size.fromHeight(48),
                padding: EdgeInsets.symmetric(
                  horizontal: Responsive.pad(context, 16),
                  vertical: Responsive.pad(context, 12),
                ),
              ),
              child: _saving ? const ButtonSkeleton() : const Text('Save'),
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
      borderRadius: BorderRadius.circular(18),
      child: Container(
        padding: EdgeInsets.symmetric(
          horizontal: Responsive.pad(context, 14),
          vertical: Responsive.pad(context, 12),
        ),
        decoration: BoxDecoration(borderRadius: BorderRadius.circular(18)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: TextStyle(
                fontSize: Responsive.sp(context, 12),
                color: scheme.onSurfaceVariant,
              ),
            ),
            SizedBox(height: Responsive.pad(context, 4)),
            Text(
              DateFormat(
                'h:mm a',
              ).format(DateTime(2000, 1, 1, time.hour, time.minute)),
              style: TextStyle(
                fontSize: Responsive.sp(context, 16),
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _AdminProofsSheet extends StatefulWidget {
  final List<dynamic> proofs;
  final ValueChanged<String> onReviewed;

  const _AdminProofsSheet({required this.proofs, required this.onReviewed});

  @override
  State<_AdminProofsSheet> createState() => _AdminProofsSheetState();
}

class _AdminProofsSheetState extends State<_AdminProofsSheet> {
  late List<dynamic> _items;
  final Set<String> _busy = {};

  @override
  void initState() {
    super.initState();
    _items = List<dynamic>.from(widget.proofs);
  }

  Future<void> _review(dynamic proof, String status) async {
    final id = proof['id']?.toString() ?? '';
    if (id.isEmpty || _busy.contains(id)) return;
    setState(() => _busy.add(id));
    try {
      await ApiService.reviewAbsenceProof(id, status);
      if (!mounted) return;
      widget.onReviewed(id);
      setState(() => _items.removeWhere((p) => p['id']?.toString() == id));
      if (status == 'approved') {
        AppToast.success('Proof approved');
      } else {
        AppToast.warning('Proof rejected');
      }
    } catch (e) {
      if (mounted) {
        AppToast.error(e.toString().replaceFirst('Exception: ', ''));
      }
    } finally {
      if (mounted) setState(() => _busy.remove(id));
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return SizedBox(
      height: MediaQuery.of(context).size.height * 0.85,
      child: Container(
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(32)),
        ),
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: const Color(0xFFDDE3EC),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Absence Proofs',
                        style: TextStyle(
                          fontSize: Responsive.sp(context, 20),
                          fontWeight: FontWeight.w700,
                          color: scheme.onSurface,
                        ),
                      ),
                      Text(
                        '${_items.length} awaiting review',
                        style: TextStyle(
                          fontSize: Responsive.sp(context, 12),
                          color: scheme.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            Expanded(
              child: _items.isEmpty
                  ? Center(
                      child: Text(
                        'All caught up',
                        style: TextStyle(
                          fontSize: 14,
                          color: scheme.onSurfaceVariant,
                        ),
                      ),
                    )
                  : ListView.separated(
                      itemCount: _items.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 12),
                      itemBuilder: (context, i) {
                        final proof = _items[i];
                        final id = proof['id']?.toString() ?? '';
                        final worker = proof['workers'];
                        final name = worker is Map
                            ? (worker['name'] ?? 'Worker').toString()
                            : 'Worker';
                        final loginId = worker is Map
                            ? worker['login_id']?.toString()
                            : null;
                        var dateStr = proof['date']?.toString() ?? '';
                        final date = DateTime.tryParse(dateStr);
                        if (date != null) {
                          dateStr = DateFormat('d MMM yyyy').format(date);
                        }
                        Uint8List? bytes;
                        try {
                          bytes = base64Decode(
                            (proof['proof_data'] ?? '').toString(),
                          );
                        } catch (_) {}
                        final busy = _busy.contains(id);
                        return Container(
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: const Color(0xFFEDF0F6),
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                name,
                                style: TextStyle(
                                  fontSize: Responsive.sp(context, 14.5),
                                  fontWeight: FontWeight.w700,
                                  color: scheme.onSurface,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                [dateStr, ?loginId].join(' · '),
                                style: TextStyle(
                                  fontSize: Responsive.sp(context, 11.5),
                                  color: scheme.onSurfaceVariant,
                                ),
                              ),
                              if (bytes != null) ...[
                                const SizedBox(height: 10),
                                ClipRRect(
                                  borderRadius: BorderRadius.circular(14),
                                  child: Image.memory(
                                    bytes,
                                    height: 150,
                                    width: double.infinity,
                                    fit: BoxFit.cover,
                                  ),
                                ),
                              ],
                              const SizedBox(height: 12),
                              Row(
                                children: [
                                  Expanded(
                                    child: OutlinedButton(
                                      onPressed: busy
                                          ? null
                                          : () => _review(proof, 'rejected'),
                                      style: OutlinedButton.styleFrom(
                                        foregroundColor: const Color(
                                          0xFFB42318,
                                        ),
                                        side: BorderSide(
                                          color: const Color(
                                            0xFFB42318,
                                          ).withValues(alpha: 0.4),
                                        ),
                                        shape: RoundedRectangleBorder(
                                          borderRadius: BorderRadius.circular(
                                            12,
                                          ),
                                        ),
                                      ),
                                      child: const Text('Reject'),
                                    ),
                                  ),
                                  const SizedBox(width: 10),
                                  Expanded(
                                    child: FilledButton(
                                      onPressed: busy
                                          ? null
                                          : () => _review(proof, 'approved'),
                                      style: FilledButton.styleFrom(
                                        backgroundColor: const Color(
                                          0xFF0F7A5A,
                                        ),
                                        shape: RoundedRectangleBorder(
                                          borderRadius: BorderRadius.circular(
                                            12,
                                          ),
                                        ),
                                      ),
                                      child: const Text('Approve'),
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
