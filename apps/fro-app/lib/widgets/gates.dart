import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../services/call_service.dart';
import '../services/meeting_service.dart';
import '../theme.dart';

class StatusPill extends StatelessWidget {
  final String status;
  final bool isIdle;
  const StatusPill({super.key, required this.status, required this.isIdle});

  @override
  Widget build(BuildContext context) {
    final key = status == 'offline' ? 'offline' : (isIdle ? 'idle' : 'active');
    final (bg, border, text, dot) = switch (key) {
      'active' => (AppColors.activeBg, AppColors.activeBorder, AppColors.activeText, AppColors.success),
      'idle' => (AppColors.idleBg, AppColors.idleBorder, AppColors.idleText, AppColors.danger),
      _ => (AppColors.offlineBg, AppColors.offlineBorder, AppColors.offlineText, const Color(0xFF9ca3af)),
    };
    final label = switch (key) {
      'active' => 'Active',
      'idle' => 'Idle',
      _ => 'Offline',
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
      decoration: BoxDecoration(
        color: bg,
        border: Border.all(color: border),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 7,
            height: 7,
            decoration: BoxDecoration(color: dot, shape: BoxShape.circle),
          ),
          const SizedBox(width: 6),
          Text(
            label,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: text,
            ),
          ),
        ],
      ),
    );
  }
}

class PauseGate extends StatelessWidget {
  const PauseGate({super.key});

  @override
  Widget build(BuildContext context) {
    final call = context.watch<CallService>();
    if (!call.paused) return const SizedBox.shrink();
    final meeting = context.read<MeetingService>();
    return Container(
      color: const Color(0xD10F172A).withValues(alpha: 0.82),
      alignment: Alignment.center,
      padding: const EdgeInsets.all(16),
      child: Container(
        width: double.infinity,
        constraints: const BoxConstraints(maxWidth: 420),
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(18),
          boxShadow: const [
            BoxShadow(color: Color(0x73000000), blurRadius: 60, offset: Offset(0, 24)),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 52,
              height: 52,
              decoration: const BoxDecoration(color: AppColors.pillYellowBg, shape: BoxShape.circle),
              child: const Icon(Icons.pause, color: AppColors.warning, size: 26),
            ),
            const SizedBox(height: 12),
            const Text(
              'You are paused',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppColors.ink),
            ),
            const SizedBox(height: 6),
            Text(
              [
                if (call.pausedBy != null && call.pausedBy!.isNotEmpty)
                  'Paused by ${call.pausedBy}.',
                'All your timers are stopped — nothing is being counted right now.',
              ].join('\n'),
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 13, color: AppColors.inkSoft, height: 1.6),
            ),
            const SizedBox(height: 14),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFFFFFBEB),
                border: Border.all(color: const Color(0xFFFDE68A)),
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Text(
                'Contact your admin to resume, or press Play below — this screen lifts the moment anyone resumes you.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: AppColors.pillYellowText, height: 1.55),
              ),
            ),
            const SizedBox(height: 14),
            SizedBox(
              width: double.infinity,
              height: 48,
              child: ElevatedButton.icon(
                style: ElevatedButton.styleFrom(backgroundColor: AppColors.success),
                icon: const Icon(Icons.play_arrow, color: Colors.white),
                label: const Text('Play — Resume Work'),
                onPressed: () async {
                  try {
                    await call.resumeSelf();
                    meeting.refresh();
                  } catch (_) {}
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class MeetingGate extends StatelessWidget {
  const MeetingGate({super.key});

  @override
  Widget build(BuildContext context) {
    final meeting = context.watch<MeetingService>();
    if (!meeting.active) return const SizedBox.shrink();
    final title = meeting.meeting?['title']?.toString() ?? 'Meeting in progress';
    return Container(
      color: const Color(0xD10F172A).withValues(alpha: 0.82),
      alignment: Alignment.center,
      padding: const EdgeInsets.all(16),
      child: Container(
        width: double.infinity,
        constraints: const BoxConstraints(maxWidth: 420),
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(18),
          boxShadow: const [
            BoxShadow(color: Color(0x73000000), blurRadius: 60, offset: Offset(0, 24)),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 52,
              height: 52,
              decoration: const BoxDecoration(color: AppColors.pillBlueBg, shape: BoxShape.circle),
              child: const Icon(Icons.people, color: AppColors.pillBlueText, size: 26),
            ),
            const SizedBox(height: 12),
            const Text(
              'Meeting in progress',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppColors.ink),
            ),
            const SizedBox(height: 6),
            Text(
              title,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 13, color: AppColors.inkSoft, height: 1.6),
            ),
            const SizedBox(height: 14),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.pillBlueBg,
                border: Border.all(color: const Color(0xFFBFDBFE)),
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Text(
                'All timers are frozen while the meeting is active. This screen lifts when the meeting ends.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: AppColors.pillBlueText, height: 1.55),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
