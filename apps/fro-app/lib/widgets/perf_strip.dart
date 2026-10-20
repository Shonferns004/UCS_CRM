import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/models.dart';
import '../services/call_service.dart';
import '../services/fro_api.dart';
import '../theme.dart';

class PerfStrip extends StatefulWidget {
  const PerfStrip({super.key});

  @override
  State<PerfStrip> createState() => _PerfStripState();
}

class _PerfStripState extends State<PerfStrip> with TickerProviderStateMixin {
  Performance? _data;
  Timer? _poll;
  static const int callTarget = 17;
  late final AnimationController _heartbeatCtrl;
  late final Animation<double> _heartbeatAnim;
  late final AnimationController _rippleCtrl;

  @override
  void initState() {
    super.initState();
    _heartbeatCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1100),
    )..repeat();
    _heartbeatAnim = TweenSequence<double>([
      TweenSequenceItem(tween: Tween(begin: 1.0, end: 1.08), weight: 15),
      TweenSequenceItem(tween: Tween(begin: 1.08, end: 1.0), weight: 15),
      TweenSequenceItem(tween: Tween(begin: 1.0, end: 1.08), weight: 15),
      TweenSequenceItem(tween: Tween(begin: 1.08, end: 1.0), weight: 25),
      TweenSequenceItem(tween: ConstantTween<double>(1.0), weight: 30),
    ]).animate(_heartbeatCtrl);
    _rippleCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1800),
    )..repeat();
    _load();
    _poll = Timer.periodic(const Duration(seconds: 30), (_) => _load());
  }

  @override
  void dispose() {
    _poll?.cancel();
    _heartbeatCtrl.dispose();
    _rippleCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final r = await FroApi.myPerformance();
      if (mounted) setState(() => _data = Performance.fromJson(r));
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final call = context.watch<CallService>();
    final d = _data;
    final levelHigh = d?.level == 'high';

    return Container(
      height: 72,
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Colors.white, Color(0xFFF8FAFC)],
        ),
        border: Border(bottom: BorderSide(color: Color(0xFFE6EAF2))),
      ),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        clipBehavior: Clip.none,
        padding: const EdgeInsets.symmetric(horizontal: 4),
        child: Row(
          children: [
            _metric(
              label: 'Rank',
              value: d?.rank != null ? '#${d!.rank}' : '—',
              accent: const Color(0xFF7c3aed),
              icon: Icons.emoji_events,
            ),
            _divider(),
            _metric(
              label: 'Worked',
              value: '${formatDuration(d?.workedSeconds)} / 8h',
              good: (d?.workedSeconds ?? 0) >= 8 * 3600,
              accent: const Color(0xFF0891b2),
              icon: Icons.timer,
            ),
            _divider(),
            _metric(
              label: 'Calls',
              value: (d?.todayCalls ?? 0).toString(),
              good: (d?.todayCalls ?? 0) >= callTarget,
              accent: const Color(0xFF2563eb),
              icon: Icons.phone,
            ),
            _divider(),
            Builder(builder: (context) {
              final idleDanger = (d?.idleSeconds ?? 0) > 3600;
              Widget idleTile = _metric(
                label: 'Idle',
                value: formatDuration(d?.idleSeconds),
                good: !(d?.isIdle ?? false),
                accent: (d?.idleSeconds ?? 0) > 0 ? const Color(0xFF7F1D1D) : AppColors.inkSoft,
                icon: Icons.access_time,
                valueColor: idleDanger ? const Color(0xFF7F1D1D) : null,
                backgroundColor: idleDanger ? const Color(0xFFFECACA) : null,
              );
              if (idleDanger) {
                idleTile = AnimatedBuilder(
                  animation: _heartbeatCtrl,
                  builder: (_, child) => Transform.scale(
                    scale: _heartbeatAnim.value,
                    alignment: Alignment.center,
                    child: child,
                  ),
                  child: Stack(
                    clipBehavior: Clip.none,
                    children: [
                      AnimatedBuilder(
                        animation: _rippleCtrl,
                        builder: (_, _) {
                          final t = _rippleCtrl.value;
                          final t2 = (t + 0.5) % 1.0;
                          return Stack(
                            children: [
                              _rippleRing(t),
                              _rippleRing(t2),
                            ],
                          );
                        },
                      ),
                      idleTile,
                    ],
                  ),
                );
              }
              return idleTile;
            }),
            _divider(),
            _metric(
              label: 'Performance',
              value: '${d?.performance ?? 0}%',
              good: levelHigh,
              accent: levelHigh ? AppColors.success : AppColors.danger,
              icon: Icons.trending_up,
            ),
            _divider(),
            _metric(
              label: 'Collections',
              value: formatCurrency(d?.todayCollected),
              accent: AppColors.success,
              icon: Icons.account_balance_wallet,
              valueColor: AppColors.success,
            ),
            if (call.isOnCall) ...[
              _divider(),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 14),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: AppColors.pillRedBg,
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(color: AppColors.idleBorder),
                  ),
                  child: Text(
                    'On call ${call.fmt(call.elapsed)}',
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w800,
                      color: AppColors.danger,
                      fontFeatures: [FontFeature.tabularFigures()],
                    ),
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _divider() => Container(width: 1, height: 32, color: const Color(0xFFEEF2F7));

  Widget _metric({
    required String label,
    required String value,
    Color? accent,
    required IconData icon,
    bool? good,
    Color? valueColor,
    Color? backgroundColor,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: backgroundColor != null
          ? BoxDecoration(
              color: backgroundColor,
              borderRadius: BorderRadius.circular(8),
            )
          : null,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: accent ?? const Color(0xFF94a3b8)),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                label.toUpperCase(),
                style: const TextStyle(
                  fontSize: 9,
                  color: Color(0xFF94a3b8),
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.8,
                ),
              ),
              const SizedBox(height: 2),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    value,
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                      color: valueColor ?? AppColors.ink,
                      fontFeatures: const [FontFeature.tabularFigures()],
                    ),
                  ),
                  if (good != null) ...[
                    const SizedBox(width: 6),
                    Icon(
                      good ? Icons.arrow_upward : Icons.arrow_downward,
                      size: 14,
                      color: good ? AppColors.success : AppColors.danger,
                    ),
                  ],
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _rippleRing(double t) {
    final scale = 1.0 + 0.3 * t;
    final opacity = (1.0 - t).clamp(0.0, 1.0);
    return Positioned.fill(
      child: IgnorePointer(
        child: Transform.scale(
          scale: scale,
          alignment: Alignment.center,
          child: Container(
            decoration: BoxDecoration(
              border: Border.all(
                color: const Color(0xFF7F1D1D).withValues(alpha: (opacity * 0.6).clamp(0.0, 1.0)),
                width: 1.5,
              ),
              borderRadius: BorderRadius.zero,
            ),
          ),
        ),
      ),
    );
  }
}
