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

class _PerfStripState extends State<PerfStrip> {
  Performance? _data;
  Timer? _poll;
  static const int callTarget = 17;

  @override
  void initState() {
    super.initState();
    _load();
    _poll = Timer.periodic(const Duration(seconds: 30), (_) => _load());
  }

  @override
  void dispose() {
    _poll?.cancel();
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
            _metric(
              label: 'Idle',
              value: formatDuration(d?.idleSeconds),
              good: !(d?.isIdle ?? false),
              accent: (d?.idleSeconds ?? 0) > 0 ? AppColors.danger : AppColors.inkSoft,
              icon: Icons.access_time,
            ),
            _divider(),
            _metric(
              label: 'Performance',
              value: '${d?.performance ?? 0}%',
              good: levelHigh,
              accent: levelHigh ? AppColors.success : AppColors.danger,
              icon: Icons.trending_up,
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
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
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
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                      color: AppColors.ink,
                      fontFeatures: [FontFeature.tabularFigures()],
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
}
