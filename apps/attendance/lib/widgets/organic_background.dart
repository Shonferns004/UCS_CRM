import 'dart:math';
import 'package:flutter/material.dart';

class OrganicBackground extends StatelessWidget {
  final List<Color> colors;
  final List<double> stops;

  const OrganicBackground({
    super.key,
    this.colors = const [Color(0xFFf6fafe), Color(0xFFf0f4f8)],
    this.stops = const [0.0, 1.0],
  });

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        return Stack(
          children: [
            Container(
              width: constraints.maxWidth,
              height: constraints.maxHeight,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: colors,
                  stops: stops,
                ),
              ),
            ),
            Positioned(
              top: -80,
              right: -60,
              child: CustomPaint(
                size: Size(320, 320),
                painter: _BlobPainter(const Color(0xFFd1e4ff).withValues(alpha: 0.15)),
              ),
            ),
            Positioned(
              bottom: -40,
              left: -40,
              child: CustomPaint(
                size: Size(260, 260),
                painter: _BlobPainter(const Color(0xFFbfdbfe).withValues(alpha: 0.10)),
              ),
            ),
            Positioned(
              top: constraints.maxHeight * 0.3,
              right: -30,
              child: CustomPaint(
                size: Size(180, 180),
                painter: _BlobPainter(const Color(0xFFeaeef2).withValues(alpha: 0.2)),
              ),
            ),
          ],
        );
      },
    );
  }
}

class _BlobPainter extends CustomPainter {
  final Color color;

  _BlobPainter(this.color);

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = color;
    final path = Path();
    final w = size.width;
    final h = size.height;
    final rng = Random(42);

    path.moveTo(w * 0.5, 0);
    for (int i = 0; i < 12; i++) {
      final angle = (i / 12) * 2 * pi;
      final nextAngle = ((i + 1) / 12) * 2 * pi;
      final radius = (0.4 + rng.nextDouble() * 0.15) * min(w, h) * 0.5;
      final cpAngle = angle + (nextAngle - angle) * 0.5;
      final cpRadius = radius * 0.6;
      final x = w / 2 + cos(angle) * radius;
      final y = h / 2 + sin(angle) * radius;
      final cpx = w / 2 + cos(cpAngle) * cpRadius;
      final cpy = h / 2 + sin(cpAngle) * cpRadius;
      if (i == 0) {
        path.moveTo(x, y);
      } else {
        path.quadraticBezierTo(cpx, cpy, x, y);
      }
    }
    path.close();
    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
