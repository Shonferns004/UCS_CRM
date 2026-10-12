import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../services/call_service.dart';
import '../theme.dart';

class DispositionTimerChip extends StatelessWidget {
  const DispositionTimerChip({super.key});

  String _clock(int totalSeconds) {
    final s = totalSeconds < 0 ? 0 : totalSeconds;
    final m = s ~/ 60;
    final sec = s % 60;
    return '$m:${sec.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    final call = context.watch<CallService>();

    final held = call.paused || call.meetingActive;
    final armed = call.secondsLeft != null;
    final settling = !armed &&
        call.settleSecondsLeft != null &&
        !held &&
        call.inShift;
    final counting = call.inShift && !held && armed;
    final value = armed ? call.secondsLeft! : dispositionWindow;
    final urgent = counting && value <= 60;
    final warn = counting && value <= 120;

    String tone;
    if (call.isIdle) {
      tone = 'urgent';
    } else if (held || !call.inShift || !armed) {
      tone = 'held';
    } else if (urgent) {
      tone = 'urgent';
    } else if (warn) {
      tone = 'warn';
    } else {
      tone = 'live';
    }

    final color = switch (tone) {
      'urgent' => AppColors.danger,
      'warn' => const Color(0xFFB45309),
      'live' => const Color(0xFF0369A1),
      _ => AppColors.inkSoft,
    };
    final border = switch (tone) {
      'urgent' => const Color(0xFFFCA5A5),
      'warn' => const Color(0xFFFCD34D),
      'live' => const Color(0xFFBAE6FD),
      _ => AppColors.line,
    };

    final label = call.isIdle
        ? 'Idle'
        : held
            ? (call.meetingActive ? 'Meeting' : 'Paused')
            : !call.inShift
                ? 'Off shift'
                : settling
                    ? 'Settling in'
                    : !armed
                        ? 'Not started'
                        : urgent
                            ? 'Now'
                            : warn
                                ? 'Due'
                                : 'Disposition';

    final display = call.isIdle
        ? '—:—'
        : armed
            ? _clock(value)
            : settling
                ? _clock(call.settleSecondsLeft!)
                : '—:—';

    final remaining = call.isIdle
        ? 1.0
        : armed
            ? (value / dispositionWindow).clamp(0.0, 1.0)
            : settling
                ? (call.settleSecondsLeft! / settleSeconds).clamp(0.0, 1.0)
                : 1.0;

    return Positioned(
      right: 20,
      top: MediaQuery.of(context).size.height * 0.58 - 40,
      child: Container(
        width: 130,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: Colors.white,
          border: Border.all(color: border),
          borderRadius: BorderRadius.circular(14),
          boxShadow: [
            tone == 'urgent'
                ? const BoxShadow(color: Color(0x38DC2626), blurRadius: 28, offset: Offset(0, 10))
                : const BoxShadow(color: Color(0x290F172A), blurRadius: 22, offset: Offset(0, 8)),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              label.toUpperCase(),
              style: TextStyle(
                fontSize: 9.5,
                fontWeight: FontWeight.w800,
                color: color,
                letterSpacing: 0.5,
                height: 1.2,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              display,
              style: TextStyle(
                fontSize: 26,
                fontWeight: FontWeight.w800,
                color: tone == 'held' ? const Color(0xFF94A3B8) : AppColors.ink,
                height: 1.15,
                fontFeatures: const [FontFeature.tabularFigures()],
                fontFamily: 'monospace',
              ),
            ),
            const SizedBox(height: 7),
            ClipRRect(
              borderRadius: BorderRadius.circular(2),
              child: SizedBox(
                height: 4,
                width: double.infinity,
                child: LinearProgressIndicator(
                  value: remaining,
                  backgroundColor: AppColors.line,
                  valueColor: AlwaysStoppedAnimation(color),
                  minHeight: 4,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
