import 'dart:math';
import 'package:flutter/material.dart';

class ProgressCircle extends StatelessWidget {
  final double size;
  final double thickness;
  final double value;
  final Color color;
  final Color? backgroundColor;
  final IconData? icon;
  final Color? iconColor;
  final double iconSize;

  const ProgressCircle({
    super.key,
    this.size = 48,
    this.thickness = 4,
    required this.value,
    required this.color,
    this.backgroundColor,
    this.icon,
    this.iconColor,
    this.iconSize = 16,
  });

  @override
  Widget build(BuildContext context) {
    final bg = backgroundColor ?? const Color(0xFFeaeef2);

    return SizedBox(
      width: size,
      height: size,
      child: CustomPaint(
        painter: _CirclePainter(
          value: value.clamp(0.0, 1.0),
          color: color,
          backgroundColor: bg,
          thickness: thickness,
        ),
        child: icon != null
            ? Center(
                child: Icon(icon, size: iconSize, color: iconColor ?? color),
              )
            : null,
      ),
    );
  }
}

class _CirclePainter extends CustomPainter {
  final double value;
  final Color color;
  final Color backgroundColor;
  final double thickness;

  _CirclePainter({
    required this.value,
    required this.color,
    required this.backgroundColor,
    required this.thickness,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = (size.width - thickness) / 2;

    final bgPaint = Paint()
      ..color = backgroundColor
      ..style = PaintingStyle.stroke
      ..strokeWidth = thickness
      ..strokeCap = StrokeCap.round;

    canvas.drawCircle(center, radius, bgPaint);

    if (value > 0) {
      final fgPaint = Paint()
        ..color = color
        ..style = PaintingStyle.stroke
        ..strokeWidth = thickness
        ..strokeCap = StrokeCap.round;

      final sweepAngle = 2 * pi * value;
      canvas.drawArc(
        Rect.fromCircle(center: center, radius: radius),
        -pi / 2,
        sweepAngle,
        false,
        fgPaint,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _CirclePainter oldDelegate) =>
      oldDelegate.value != value || oldDelegate.color != color;
}
