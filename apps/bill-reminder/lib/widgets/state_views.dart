import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../theme.dart';

class KpiCard extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color color;
  final String? sub;
  final VoidCallback? onTap;
  const KpiCard({
    super.key,
    required this.label,
    required this.value,
    required this.icon,
    required this.color,
    this.sub,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final p = AppPalette.of(context);
    return Material(
      color: p.card,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: p.line, width: 1),
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [color.withValues(alpha: 0.07), p.card],
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 34,
                    height: 34,
                    decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(10)),
                    child: Icon(icon, size: 17, color: color),
                  ),
                  const Spacer(),
                  Icon(LucideIcons.chevronRight, size: 15, color: p.inkMute),
                ],
              ),
              const SizedBox(height: 12),
              Text(value,
                style: TextStyle(
                  fontSize: 19,
                  fontWeight: FontWeight.w800,
                  color: p.ink,
                  fontFeatures: const [FontFeature.tabularFigures()],
                )),
              const SizedBox(height: 2),
              Text(label,
                style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: p.inkSoft)),
              if (sub != null) ...[
                const SizedBox(height: 3),
                Text(sub!,
                  style: TextStyle(fontSize: 11, color: p.inkMute)),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class EmptyState extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? subtitle;
  const EmptyState({super.key, required this.icon, required this.title, this.subtitle});

  @override
  Widget build(BuildContext context) {
    final p = AppPalette.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 72,
              height: 72,
              decoration: BoxDecoration(color: p.bg, shape: BoxShape.circle),
              child: Icon(icon, size: 32, color: p.inkMute),
            ),
            const SizedBox(height: 16),
            Text(title,
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: p.inkSoft)),
            if (subtitle != null) ...[
              const SizedBox(height: 6),
              Text(subtitle!,
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 13, color: p.inkMute)),
            ],
          ],
        ),
      ),
    );
  }
}

class ErrorState extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;
  const ErrorState({super.key, required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    final p = AppPalette.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(LucideIcons.cloudOff, size: 44, color: p.inkMute),
            const SizedBox(height: 14),
            Text('Could not load reminders',
              style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: p.inkSoft)),
            const SizedBox(height: 6),
            Text(message,
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 13, color: p.inkMute)),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: onRetry,
              icon: const Icon(LucideIcons.refreshCw, size: 16),
              label: const Text('Retry'),
              style: FilledButton.styleFrom(backgroundColor: p.blue, foregroundColor: p.onBlue),
            ),
          ],
        ),
      ),
    );
  }
}

class SkeletonList extends StatelessWidget {
  const SkeletonList({super.key});

  @override
  Widget build(BuildContext context) {
    final p = AppPalette.of(context);
    final color = p.inkMute.withValues(alpha: 0.12);
    return SingleChildScrollView(
      physics: const NeverScrollableScrollPhysics(),
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          for (var i = 0; i < 7; i++) ...[
            Container(
              height: 68,
              decoration: BoxDecoration(
                color: p.card,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: p.line),
              ),
              padding: const EdgeInsets.all(10),
              child: Row(
                children: [
                  Container(width: 44, height: 44, decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(12))),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(width: 160, height: 12, decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(6))),
                        const SizedBox(height: 8),
                        Container(width: 110, height: 10, decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(6))),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 10),
          ],
        ],
      ),
    );
  }
}
