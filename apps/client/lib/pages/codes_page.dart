import 'dart:async';
import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../services/api_service.dart';
import '../services/realtime_service.dart';
import '../main.dart';
import '../utils/responsive.dart';
import '../widgets/skeleton_loader.dart';
import '../widgets/progress_circle.dart';

const int _codeTtlSeconds = 300;

class CodesPage extends StatefulWidget {
  final ScrollController? scrollController;
  const CodesPage({super.key, this.scrollController});

  @override
  State<CodesPage> createState() => _CodesPageState();
}

class _CodesPageState extends State<CodesPage> {
  List<dynamic> _codes = [];
  bool _loading = true;
  String? _error;
  Timer? _ticker;

  void _onRealtimeChange() {
    if (RealtimeService.instance.lastEvent == RealtimeEvent.codes) {
      _fetchCodes();
    }
  }

  @override
  void initState() {
    super.initState();
    _fetchCodes();
    RealtimeService.instance.addListener(_onRealtimeChange);
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    RealtimeService.instance.removeListener(_onRealtimeChange);
    super.dispose();
  }

  Future<void> _fetchCodes() async {
    try {
      final codes = await ApiService.getImpersonationCodes();
      if (mounted) {
        setState(() {
          _codes = codes;
          _loading = false;
          _error = null;
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

  @override
  Widget build(BuildContext context) {
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
                  Text('Attendance Codes', style: tt.headlineSmall?.copyWith(fontWeight: FontWeight.w700, color: scheme.primary)),
                  const Spacer(),
                  IconButton(
                    icon: const Icon(LucideIcons.refreshCw),
                    onPressed: _fetchCodes,
                    tooltip: 'Refresh',
                  ),
                ],
              ),
            ),
            Expanded(
              child: _loading
                  ? const ListSkeleton()
                  : _error != null && _codes.isEmpty
                      ? _buildError(scheme, tt)
                      : RefreshIndicator(
                          onRefresh: _fetchCodes,
                          child: _codes.isEmpty
                              ? _buildEmpty(scheme, tt)
                              : ListView.builder(
                                  controller: widget.scrollController,
                                  padding: EdgeInsets.fromLTRB(
                                    Responsive.pad(context, 16),
                                    Responsive.pad(context, 8),
                                    Responsive.pad(context, 16),
                                    Responsive.pad(context, 40),
                                  ),
                                  itemCount: _codes.length,
                                  itemBuilder: (context, i) => _CodeCard(code: _codes[i]),
                                ),
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
          Text(_error ?? 'Failed to load codes', style: tt.bodyMedium?.copyWith(color: scheme.onSurfaceVariant)),
          const SizedBox(height: 12),
          OutlinedButton(onPressed: _fetchCodes, child: const Text('Retry')),
        ],
      ),
    );
  }

  Widget _buildEmpty(ColorScheme scheme, TextTheme tt) {
    return LayoutBuilder(
      builder: (context, constraints) => SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        child: SizedBox(
          height: constraints.maxHeight,
          child: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(LucideIcons.shieldCheck, size: Responsive.sp(context, 40), color: scheme.outline),
                const SizedBox(height: 12),
                Text('No codes generated yet', style: tt.bodyMedium?.copyWith(color: scheme.onSurfaceVariant)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _CodeCard extends StatelessWidget {
  final Map<String, dynamic> code;
  const _CodeCard({required this.code});

  bool _isUsed() => code['is_used'] == true;

  bool _isExpired() {
    final expires = DateTime.tryParse(code['expires_at']?.toString() ?? '');
    return expires != null && expires.isBefore(DateTime.now());
  }

  int _remainingSeconds() {
    final expires = DateTime.tryParse(code['expires_at']?.toString() ?? '');
    if (expires == null) return 0;
    final rem = expires.difference(DateTime.now()).inSeconds;
    return rem < 0 ? 0 : rem;
  }

  String _formatDate(String? raw) {
    final dt = DateTime.tryParse(raw ?? '');
    if (dt == null) return '—';
    final local = dt.toLocal();
    return '${local.day.toString().padLeft(2, '0')}-${local.month.toString().padLeft(2, '0')}-${local.year} '
        '${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;
    final colors = Theme.of(context).extension<AppColors>()!;

    final used = _isUsed();
    final expired = !used && _isExpired();
    final active = !used && !expired;
    final remaining = _remainingSeconds();

    final statusColor = used
        ? const Color(0xFF6b7280)
        : expired
            ? const Color(0xFFba1a1a)
            : const Color(0xFF1D7A4F);

    final statusLabel = used ? 'Used' : expired ? 'Expired' : 'Active';

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: EdgeInsets.all(Responsive.pad(context, 16)),
      decoration: BoxDecoration(
        color: colors.surfaceContainerLowest,
        borderRadius: BorderRadius.circular(Responsive.radius(context, 12)),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 8, offset: const Offset(0, 2))],
      ),
      child: Row(
        children: [
          if (active)
            Stack(
              alignment: Alignment.center,
              children: [
                ProgressCircle(
                  size: Responsive.sp(context, 56),
                  thickness: 5,
                  value: remaining / _codeTtlSeconds,
                  color: remaining <= 60 ? const Color(0xFFba1a1a) : const Color(0xFF1D7A4F),
                ),
                Text(
                  _mmss(remaining),
                  style: tt.labelSmall?.copyWith(
                    fontWeight: FontWeight.w700,
                    color: remaining <= 60 ? const Color(0xFFba1a1a) : const Color(0xFF1D7A4F),
                  ),
                ),
              ],
            )
          else
            ProgressCircle(
              size: Responsive.sp(context, 56),
              thickness: 5,
              value: 0,
              color: statusColor,
              icon: used ? LucideIcons.check : LucideIcons.timerOff,
              iconColor: statusColor,
              backgroundColor: const Color(0xFFeaeef2),
            ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(
                      code['code']?.toString() ?? '••••',
                      style: tt.titleLarge?.copyWith(fontWeight: FontWeight.w800, letterSpacing: 2, color: scheme.primary),
                    ),
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: statusColor.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        statusLabel,
                        style: tt.labelSmall?.copyWith(color: statusColor, fontWeight: FontWeight.w700),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  'By ${code['created_by_name']?.toString() ?? 'Admin'}',
                  style: tt.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
                ),
                Text(
                  'Generated ${_formatDate(code['created_at']?.toString())}',
                  style: tt.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  String _mmss(int totalSeconds) {
    final m = (totalSeconds ~/ 60).toString().padLeft(2, '0');
    final s = (totalSeconds % 60).toString().padLeft(2, '0');
    return '$m:$s';
  }
}
