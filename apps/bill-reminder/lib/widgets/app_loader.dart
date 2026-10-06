import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../theme.dart';

/// A smooth, branded loading indicator: a rotating gradient ring wrapping a
/// gently pulsing icon, the app name, and three bouncing dots.
///
/// Use [onGradient] when placing it over the blue header gradient (e.g. the
/// boot splash) so the colours switch to white.
class AppLoader extends StatefulWidget {
  final String? message;
  final bool onGradient;
  const AppLoader({super.key, this.message, this.onGradient = false});

  @override
  State<AppLoader> createState() => _AppLoaderState();
}

class _AppLoaderState extends State<AppLoader>
    with TickerProviderStateMixin {
  late final AnimationController _spin = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1600),
  )..repeat();

  late final AnimationController _pulse = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1100),
  )..repeat(reverse: true);

  late final AnimationController _dots = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1200),
  )..repeat();

  @override
  void dispose() {
    _spin.dispose();
    _pulse.dispose();
    _dots.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final p = AppPalette.of(context);
    final onGradient = widget.onGradient;
    final accent = onGradient ? Colors.white : p.blue;
    final textColor = onGradient ? Colors.white : p.ink;
    final subColor =
        onGradient ? Colors.white.withValues(alpha: 0.75) : p.inkMute;

    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(
            width: 88,
            height: 88,
            child: Stack(
              alignment: Alignment.center,
              children: [
                RotationTransition(
                  turns: _spin,
                  child: CustomPaint(
                    size: const Size(88, 88),
                    painter: _RingPainter(color: accent),
                  ),
                ),
                ScaleTransition(
                  scale: Tween<double>(begin: 0.88, end: 1.06).animate(
                    CurvedAnimation(parent: _pulse, curve: Curves.easeInOut),
                  ),
                  child: Container(
                    width: 54,
                    height: 54,
                    decoration: BoxDecoration(
                      color: onGradient
                          ? Colors.white.withValues(alpha: 0.16)
                          : p.blue.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Icon(LucideIcons.walletCards,
                        color: accent, size: 26),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          Text('Bill Reminder',
            style: GoogleFonts.hankenGrotesk(
              fontSize: 18,
              fontWeight: FontWeight.w800,
              color: textColor,
              letterSpacing: 0.2,
            )),
          if (widget.message != null) ...[
            const SizedBox(height: 6),
            Text(widget.message!,
              style: TextStyle(fontSize: 12.5, color: subColor)),
          ],
          const SizedBox(height: 18),
          _Dots(controller: _dots, color: accent),
        ],
      ),
    );
  }
}

class _RingPainter extends CustomPainter {
  final Color color;
  _RingPainter({required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    final center = size.center(Offset.zero);
    final radius = (size.width - 6) / 2;
    final rect = Rect.fromCircle(center: center, radius: radius);

    final base = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3
      ..strokeCap = StrokeCap.round
      ..color = color.withValues(alpha: 0.15);
    canvas.drawCircle(center, radius, base);

    final sweep = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3
      ..strokeCap = StrokeCap.round
      ..shader = SweepGradient(
        startAngle: 0,
        endAngle: math.pi * 2,
        colors: [color.withValues(alpha: 0.0), color],
        transform: const GradientRotation(-math.pi / 2),
      ).createShader(rect);
    canvas.drawArc(rect, -math.pi / 2, math.pi * 1.25, false, sweep);
  }

  @override
  bool shouldRepaint(covariant _RingPainter old) => old.color != color;
}

class _Dots extends StatelessWidget {
  final AnimationController controller;
  final Color color;
  const _Dots({required this.controller, required this.color});

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: controller,
      builder: (context, _) {
        return Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (var i = 0; i < 3; i++) ...[
              _dot(i),
              if (i < 2) const SizedBox(width: 7),
            ],
          ],
        );
      },
    );
  }

  Widget _dot(int index) {
    final phase = (controller.value - index * 0.18) % 1.0;
    final wave = (math.sin(phase * math.pi * 2) + 1) / 2; // 0..1
    return Transform.translate(
      offset: Offset(0, -4 * wave),
      child: Container(
        width: 6,
        height: 6,
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.35 + 0.65 * wave),
          shape: BoxShape.circle,
        ),
      ),
    );
  }
}