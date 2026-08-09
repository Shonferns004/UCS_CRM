import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:intl/intl.dart';
import '../services/api_service.dart';
import '../services/realtime_service.dart';
import '../main.dart';
import '../utils/responsive.dart';
import '../widgets/skeleton_loader.dart';

class RequestsPage extends StatefulWidget {
  final ScrollController? scrollController;
  const RequestsPage({super.key, this.scrollController});

  @override
  State<RequestsPage> createState() => _RequestsPageState();
}

class _RequestsPageState extends State<RequestsPage> {
  String _segment = 'leave';

  List<dynamic> _leaves = [];
  List<dynamic> _loans = [];
  bool _loading = true;
  String? _error;
  String? _processingId;

  void _onRealtimeChange() {
    final event = RealtimeService.instance.lastEvent;
    if (event == RealtimeEvent.leaves) _fetchLeaves();
    if (event == RealtimeEvent.loans) _fetchLoans();
  }

  @override
  void initState() {
    super.initState();
    _refresh();
    RealtimeService.instance.addListener(_onRealtimeChange);
  }

  @override
  void dispose() {
    RealtimeService.instance.removeListener(_onRealtimeChange);
    super.dispose();
  }

  Future<void> _refresh() async {
    setState(() { _loading = true; _error = null; });
    try {
      final results = await Future.wait([ApiService.getPendingLeaves(), ApiService.getPendingLoans()]);
      if (mounted) {
        setState(() {
          _leaves = results[0];
          _loans = results[1];
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

  Future<void> _fetchLeaves() async {
    try {
      final leaves = await ApiService.getPendingLeaves();
      if (mounted) setState(() => _leaves = leaves);
    } catch (_) {}
  }

  Future<void> _fetchLoans() async {
    try {
      final loans = await ApiService.getPendingLoans();
      if (mounted) setState(() => _loans = loans);
    } catch (_) {}
  }

  void _showSnack(String message, {bool isError = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: isError ? const Color(0xFFba1a1a) : const Color(0xFF1D7A4F),
      ),
    );
  }

  Future<String?> _promptRemark(String title) async {
    final ctrl = TextEditingController();
    final result = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: TextField(
          controller: ctrl,
          maxLines: 3,
          decoration: const InputDecoration(hintText: 'Remark (optional)'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.pop(context, ctrl.text.trim()),
            child: const Text('Submit'),
          ),
        ],
      ),
    );
    return result;
  }

  Future<double?> _promptDeduction(double totalAmount) async {
    final ctrl = TextEditingController();
    final result = await showDialog<double>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Monthly Deduction'),
        content: TextField(
          controller: ctrl,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: InputDecoration(
            hintText: 'e.g. ${(totalAmount / 3).toStringAsFixed(0)}',
            helperText: 'Total amount: ${totalAmount.toStringAsFixed(0)}',
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          FilledButton(
            onPressed: () {
              final value = double.tryParse(ctrl.text.trim());
              if (value == null || value <= 0 || value > totalAmount) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text('Enter a valid amount between 1 and ${totalAmount.toStringAsFixed(0)}'),
                    backgroundColor: const Color(0xFFba1a1a),
                  ),
                );
                return;
              }
              Navigator.pop(context, value);
            },
            child: const Text('Approve'),
          ),
        ],
      ),
    );
    return result;
  }

  Future<void> _decideLeave(Map<String, dynamic> leave, String status) async {
    final id = leave['id']?.toString();
    if (id == null) return;
    String? remark;
    if (status == 'rejected') {
      remark = await _promptRemark('Reject Leave');
      if (remark == null) return;
    }
    setState(() => _processingId = id);
    try {
      await ApiService.decideLeave(id, status, remark: remark);
      setState(() => _leaves.removeWhere((l) => l['id'].toString() == id));
      _showSnack(status == 'approved' ? 'Leave approved' : 'Leave rejected');
    } catch (e) {
      _showSnack(e.toString().replaceFirst('Exception: ', ''), isError: true);
    } finally {
      if (mounted) setState(() => _processingId = null);
    }
  }

  Future<void> _decideLoan(Map<String, dynamic> loan, String status) async {
    final id = loan['id']?.toString();
    if (id == null) return;
    final total = double.tryParse(loan['total_amount']?.toString() ?? '') ?? 0;
    double? monthlyDeduction;
    String? remark;
    if (status == 'approved') {
      monthlyDeduction = await _promptDeduction(total);
      if (monthlyDeduction == null) return;
    } else {
      remark = await _promptRemark('Reject Advance');
      if (remark == null) return;
    }
    setState(() => _processingId = id);
    try {
      await ApiService.decideLoan(id, status, monthlyDeduction: monthlyDeduction, remark: remark);
      setState(() => _loans.removeWhere((l) => l['id'].toString() == id));
      _showSnack(status == 'approved' ? 'Advance approved' : 'Advance rejected');
    } catch (e) {
      _showSnack(e.toString().replaceFirst('Exception: ', ''), isError: true);
    } finally {
      if (mounted) setState(() => _processingId = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;
    final colors = Theme.of(context).extension<AppColors>()!;

    return Scaffold(
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: EdgeInsets.symmetric(horizontal: Responsive.pad(context, 16), vertical: Responsive.pad(context, 8)),
              child: Row(
                children: [
                  Text('Requests', style: tt.headlineSmall?.copyWith(fontWeight: FontWeight.w700, color: scheme.primary)),
                  const Spacer(),
                  IconButton(icon: const Icon(LucideIcons.refreshCw), onPressed: _refresh, tooltip: 'Refresh'),
                ],
              ),
            ),
            Padding(
              padding: EdgeInsets.symmetric(horizontal: Responsive.pad(context, 16)),
              child: Container(
                padding: const EdgeInsets.all(4),
                decoration: BoxDecoration(
                  color: colors.surfaceContainerHigh,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Row(
                  children: [
                    _SegmentButton(
                      label: 'Leave',
                      icon: LucideIcons.calendarDays,
                      isActive: _segment == 'leave',
                      onTap: () => setState(() => _segment = 'leave'),
                    ),
                    _SegmentButton(
                      label: 'Advance',
                      icon: LucideIcons.wallet,
                      isActive: _segment == 'advance',
                      onTap: () => setState(() => _segment = 'advance'),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 8),
            Expanded(
              child: _loading
                  ? const ListSkeleton()
                  : _error != null && (_segment == 'leave' ? _leaves.isEmpty : _loans.isEmpty)
                      ? _buildError(scheme, tt)
                      : RefreshIndicator(
                          onRefresh: _refresh,
                          child: _segment == 'leave' ? _buildLeaveList(tt) : _buildLoanList(tt),
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
          Text(_error ?? 'Failed to load requests', style: tt.bodyMedium?.copyWith(color: scheme.onSurfaceVariant)),
          const SizedBox(height: 12),
          OutlinedButton(onPressed: _refresh, child: const Text('Retry')),
        ],
      ),
    );
  }

  Widget _buildLeaveList(TextTheme tt) {
    if (_leaves.isEmpty) {
      return _empty(tt, LucideIcons.calendarDays, 'No pending leave requests');
    }
    return ListView.builder(
      controller: widget.scrollController,
      padding: EdgeInsets.fromLTRB(Responsive.pad(context, 16), Responsive.pad(context, 8), Responsive.pad(context, 16), Responsive.pad(context, 40)),
      itemCount: _leaves.length,
      itemBuilder: (context, i) => _leaveCard(_leaves[i], tt),
    );
  }

  Widget _buildLoanList(TextTheme tt) {
    if (_loans.isEmpty) {
      return _empty(tt, LucideIcons.wallet, 'No pending advance requests');
    }
    return ListView.builder(
      controller: widget.scrollController,
      padding: EdgeInsets.fromLTRB(Responsive.pad(context, 16), Responsive.pad(context, 8), Responsive.pad(context, 16), Responsive.pad(context, 40)),
      itemCount: _loans.length,
      itemBuilder: (context, i) => _loanCard(_loans[i], tt),
    );
  }

  Widget _empty(TextTheme tt, IconData icon, String message) {
    return LayoutBuilder(
      builder: (context, constraints) => SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        child: SizedBox(
          height: constraints.maxHeight,
          child: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(icon, size: Responsive.sp(context, 40), color: Theme.of(context).colorScheme.outline),
                const SizedBox(height: 12),
                Text(message, style: tt.bodyMedium?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant)),
              ],
            ),
          ),
        ),
      ),
    );
  }

  String _workerName(Map<String, dynamic> row) {
    final workers = row['workers'];
    if (workers is Map && workers['name'] != null) return workers['name'].toString();
    return 'Worker';
  }

  String _formatTime(String? raw) {
    final dt = DateTime.tryParse(raw ?? '');
    if (dt == null) return '';
    return DateFormat('dd MMM, hh:mm a').format(dt.toLocal());
  }

  Widget _card({
    required Widget child,
    required ColorScheme scheme,
  }) {
    final colors = Theme.of(context).extension<AppColors>()!;
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: EdgeInsets.all(Responsive.pad(context, 16)),
      decoration: BoxDecoration(
        color: colors.surfaceContainerLowest,
        borderRadius: BorderRadius.circular(Responsive.radius(context, 12)),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 8, offset: const Offset(0, 2))],
      ),
      child: child,
    );
  }

  Widget _actionButtons({
    required String id,
    required VoidCallback onApprove,
    required VoidCallback onReject,
  }) {
    final processing = _processingId == id;
    return Row(
      children: [
        Expanded(
          child: OutlinedButton.icon(
            onPressed: processing ? null : onReject,
            style: OutlinedButton.styleFrom(
              foregroundColor: const Color(0xFFba1a1a),
              side: const BorderSide(color: Color(0xFFba1a1a)),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            ),
            icon: const Icon(LucideIcons.x, size: 16),
            label: const Text('Reject'),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: FilledButton.icon(
            onPressed: processing ? null : onApprove,
            style: FilledButton.styleFrom(
              backgroundColor: const Color(0xFF1D7A4F),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            ),
            icon: processing
                ? const ButtonSkeleton(size: 16)
                : const Icon(LucideIcons.check, size: 16),
            label: const Text('Approve'),
          ),
        ),
      ],
    );
  }

  Widget _leaveCard(dynamic raw, TextTheme tt) {
    final scheme = Theme.of(context).colorScheme;
    final leave = raw as Map<String, dynamic>;
    final id = leave['id'].toString();
    final type = leave['type']?.toString() ?? '';
    final typeLabel = {
      'full_day': 'Full Day',
      'half_day': 'Half Day',
      'vacational': 'Vacational',
      'emergency': 'Emergency',
    }[type] ?? type;

    String dateInfo;
    if (leave['leave_date'] != null) {
      dateInfo = leave['leave_date'].toString();
      if (type == 'half_day' && leave['half_start_time'] != null) {
        dateInfo += ' · ${leave['half_start_time']} - ${leave['half_end_time']}';
      }
    } else if (leave['start_date'] != null && leave['end_date'] != null) {
      dateInfo = '${leave['start_date']} → ${leave['end_date']}';
    } else {
      dateInfo = '';
    }

    return _card(
      scheme: scheme,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: scheme.primary.withValues(alpha: 0.10),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(typeLabel, style: tt.labelSmall?.copyWith(color: scheme.primary, fontWeight: FontWeight.w700)),
              ),
              const Spacer(),
              Icon(LucideIcons.user, size: 16, color: scheme.onSurfaceVariant),
              const SizedBox(width: 4),
              Text(_workerName(leave), style: tt.bodySmall?.copyWith(color: scheme.onSurfaceVariant)),
            ],
          ),
          const SizedBox(height: 8),
          if (dateInfo.isNotEmpty)
            Text(dateInfo, style: tt.bodyMedium?.copyWith(fontWeight: FontWeight.w600)),
          const SizedBox(height: 4),
          Text(leave['reason']?.toString() ?? '', style: tt.bodyMedium?.copyWith(color: scheme.onSurfaceVariant), maxLines: 3, overflow: TextOverflow.ellipsis),
          if (_formatTime(leave['applied_at']?.toString()).isNotEmpty) ...[
            const SizedBox(height: 4),
            Text('Applied ${_formatTime(leave['applied_at']?.toString())}', style: tt.bodySmall?.copyWith(color: scheme.outline)),
          ],
          const SizedBox(height: 12),
          _actionButtons(
            id: id,
            onApprove: () => _decideLeave(leave, 'approved'),
            onReject: () => _decideLeave(leave, 'rejected'),
          ),
        ],
      ),
    );
  }

  Widget _loanCard(dynamic raw, TextTheme tt) {
    final scheme = Theme.of(context).colorScheme;
    final loan = raw as Map<String, dynamic>;
    final id = loan['id'].toString();
    final total = double.tryParse(loan['total_amount']?.toString() ?? '') ?? 0;

    return _card(
      scheme: scheme,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: const Color(0xFF1D7A4F).withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text('Advance', style: tt.labelSmall?.copyWith(color: const Color(0xFF1D7A4F), fontWeight: FontWeight.w700)),
              ),
              const Spacer(),
              Icon(LucideIcons.user, size: 16, color: scheme.onSurfaceVariant),
              const SizedBox(width: 4),
              Text(_workerName(loan), style: tt.bodySmall?.copyWith(color: scheme.onSurfaceVariant)),
            ],
          ),
          const SizedBox(height: 8),
          Text('₹${total.toStringAsFixed(0)}', style: tt.titleMedium?.copyWith(fontWeight: FontWeight.w800, color: scheme.primary)),
          const SizedBox(height: 4),
          Text(loan['reason']?.toString() ?? '', style: tt.bodyMedium?.copyWith(color: scheme.onSurfaceVariant), maxLines: 3, overflow: TextOverflow.ellipsis),
          if (_formatTime(loan['applied_at']?.toString()).isNotEmpty) ...[
            const SizedBox(height: 4),
            Text('Applied ${_formatTime(loan['applied_at']?.toString())}', style: tt.bodySmall?.copyWith(color: scheme.outline)),
          ],
          const SizedBox(height: 12),
          _actionButtons(
            id: id,
            onApprove: () => _decideLoan(loan, 'approved'),
            onReject: () => _decideLoan(loan, 'rejected'),
          ),
        ],
      ),
    );
  }
}

class _SegmentButton extends StatelessWidget {
  final String label;
  final IconData icon;
  final bool isActive;
  final VoidCallback onTap;

  const _SegmentButton({
    required this.label,
    required this.icon,
    required this.isActive,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(
            color: isActive ? scheme.primary : Colors.transparent,
            borderRadius: BorderRadius.circular(8),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 18, color: isActive ? scheme.onPrimary : scheme.onSurfaceVariant),
              const SizedBox(width: 6),
              Text(
                label,
                style: tt.labelLarge?.copyWith(
                  fontWeight: FontWeight.w700,
                  color: isActive ? scheme.onPrimary : scheme.onSurfaceVariant,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
