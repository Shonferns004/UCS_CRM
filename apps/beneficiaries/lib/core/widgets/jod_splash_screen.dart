import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../theme/app_colors.dart';

/// JOD story splash — the logo is *built* through a short visual story in
/// pure vector layers (never a flattened PNG), so every element animates
/// independently.
///
/// Timeline (seconds, total ~3.65):
///   0.00   blank white + faint brand glow
///   0.15   blue figures enter from opposite sides (staggered 0.10)
///   0.60   the two blues move toward each other and settle
///   0.85   a heart forms between them (easeOutBack — never shown too early)
///   1.15   heart pulses once with a soft glow
///   1.35   green person emerges from inside / behind the heart
///   1.75   green person raises arms in quiet joy (tiny bounce)
///   1.90   orange person joins from the right
///   2.20   JOD is revealed letter by letter; a leaf grows inside the O
///   2.60   "Join • Organize • Deliver"
///   2.90   "Your Registration, Your Identity."
///   3.15   "PEOPLE • OPPORTUNITIES • A BETTER TOMORROW"
///   3.45   final settle (0.985 → 1.0); everything then stays perfectly still
///
/// [onFinished] fires once the story completes so the parent can crossfade
/// into the application.
class JodSplashScreen extends StatefulWidget {
  const JodSplashScreen({super.key, required this.onFinished});

  final VoidCallback onFinished;

  @override
  State<JodSplashScreen> createState() => _JodSplashScreenState();
}

class _JodSplashScreenState extends State<JodSplashScreen>
    with SingleTickerProviderStateMixin {
  static const Duration _kTotal = Duration(milliseconds: 3650);
  static const double _kTotalSeconds = 3.65;

  late final AnimationController _controller;
  bool _notified = false;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(vsync: this, duration: _kTotal)
      ..addStatusListener(_onStatus)
      ..forward();
  }

  void _onStatus(AnimationStatus status) {
    if (status == AnimationStatus.completed && !_notified) {
      _notified = true;
      widget.onFinished();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, _) {
        final pose =
            _JodPose.fromSeconds(_controller.value * _kTotalSeconds);
        return SizedBox.expand(
          child: CustomPaint(painter: _JodSplashPainter(pose)),
        );
      },
    );
  }
}

/// Brand palette used by the story (single source: AppColors where possible).
const Color _kBlue = AppColors.primaryBlue;
const Color _kGreen = AppColors.successGreen;
const Color _kOrange = Color(0xFFF97316);
const Color _kInk = AppColors.textPrimary;
const Color _kDim = AppColors.textSecondary;
const Color _kFaint = AppColors.textTertiary;

class _JodPose {
  const _JodPose({
    required this.contentScale,
    required this.blueLength,
    required this.blueRightLength,
    required this.bluesNudge,
    required this.blueLScale,
    required this.blueRScale,
    required this.heartOpacity,
    required this.heartFloor,
    required this.heartSwell,
    required this.heartGlow,
    required this.greenOpacity,
    required this.greenFloor,
    required this.greenScale,
    required this.greenSpring,
    required this.greenArms,
    required this.greenHalo,
    required this.orangeEntrance,
    required this.orangeOpacity,
    required this.orangeSettle,
    required this.jLetter,
    required this.oLetter,
    required this.dLetter,
    required this.jRise,
    required this.oRise,
    required this.dRise,
    required this.leafOpacity,
    required this.leafGrow,
    required this.leafSpin,
    required this.descriptorOpacity,
    required this.descriptorRise,
    required this.taglineOpacity,
    required this.taglineRise,
    required this.supportOpacity,
    required this.supportTracking,
  });

  final double contentScale;

  /// Entering blue figure progress (0 → 1), left and right.
  final double blueLength;
  final double blueRightLength;

  /// 0 → 1 → 0 "moving together" pulse.
  final double bluesNudge;

  final double blueLScale;
  final double blueRScale;

  final double heartOpacity;

  /// Heart scale floor (0.65 → 1, easeOutBack).
  final double heartFloor;

  /// 1.06 pulse multiplier.
  final double heartSwell;

  final double heartGlow;
  final double greenOpacity;
  final double greenFloor;

  /// Green body scale (0.65 → 1).
  final double greenScale;
  final double greenSpring;

  /// Arms 0 (rest) → 1 (raised).
  final double greenArms;
  final double greenHalo;
  final double orangeEntrance;
  final double orangeOpacity;
  final double orangeSettle;
  final double jLetter;
  final double oLetter;
  final double dLetter;
  final double jRise;
  final double oRise;
  final double dRise;
  final double leafOpacity;
  final double leafGrow;
  final double leafSpin;
  final double descriptorOpacity;
  final double descriptorRise;
  final double taglineOpacity;
  final double taglineRise;
  final double supportOpacity;
  final double supportTracking;

  factory _JodPose.fromSeconds(double t) {
    double seg(double t0, double t1, double b, double e, Curve curve) {
      if (t1 <= t0) return b;
      final double p = ((t - t0) / (t1 - t0)).clamp(0.0, 1.0);
      return b + (e - b) * curve.transform(p);
    }

    double pulse(double t0, double t1, double peak, Curve up, Curve down) {
      if (t <= t0 || t >= t1 || t1 <= t0) return 0.0;
      final double mid = (t0 + t1) / 2;
      if (t <= mid) return peak * up.transform((t - t0) / (mid - t0));
      return peak * (1 - down.transform((t - mid) / (t1 - mid)));
    }

    return _JodPose(
      // 3. Blue figures enter (staggered), 4. move together, then settle.
      blueLength: seg(0.15, 0.60, 0, 1, Curves.easeOutCubic),
      blueRightLength: seg(0.25, 0.70, 0, 1, Curves.easeOutCubic),
      bluesNudge: pulse(0.58, 1.12, 1, Curves.easeInOutCubic, Curves.easeInOutCubic),
      blueLScale: (0.85 + 0.15 * seg(0.15, 0.60, 0, 1, Curves.easeOutCubic)) *
          (1 + 0.03 * pulse(0.58, 1.12, 1, Curves.easeInOutCubic, Curves.easeInOutCubic)),
      blueRScale: (0.85 + 0.15 * seg(0.25, 0.70, 0, 1, Curves.easeOutCubic)) *
          (1 + 0.03 * pulse(0.58, 1.12, 1, Curves.easeInOutCubic, Curves.easeInOutCubic)),
      // 5. Heart forms between the blues.
      heartOpacity: seg(0.85, 1.20, 0, 1, Curves.easeOut),
      heartFloor: seg(0.85, 1.30, 0.65, 1.0, Curves.easeOutBack),
      // 6. One small pulse + glow, not continuous.
      heartSwell: 1 + 0.06 * pulse(1.15, 1.45, 1, Curves.easeOut, Curves.easeIn),
      heartGlow: pulse(1.15, 1.45, 0.13, Curves.easeOut, Curves.easeIn),
      // 7. Green person emerges from the heart.
      greenOpacity: seg(1.35, 1.80, 0, 1, Curves.easeOut),
      greenFloor: seg(1.35, 1.90, 0, 1, Curves.easeOutBack),
      greenScale: 0.65 + 0.35 * seg(1.35, 1.90, 0, 1, Curves.easeOutBack),
      greenSpring:
          (1 - seg(1.35, 1.90, 0, 1, Curves.easeOutBack)) * 35 +
              pulse(1.75, 2.05, -6, Curves.easeOut, Curves.easeIn),
      // 8. Joy: arms raise once, subtle bounce.
      greenArms: seg(1.75, 2.05, 0, 1, Curves.easeOutCubic),
      // 9. Green glow (growth + hope).
      greenHalo: seg(1.90, 2.15, 0, 1, Curves.easeIn),
      // 10. Orange person joins from the right.
      orangeEntrance: seg(1.90, 2.25, 0, 1, Curves.easeOutCubic),
      orangeOpacity: seg(1.90, 2.25, 0, 1, Curves.easeOutCubic),
      orangeSettle: 0.9 + 0.1 * seg(1.90, 2.25, 0, 1, Curves.easeOutCubic),
      // 13. JOD letters, staggered.
      jLetter: seg(2.20, 2.55, 0, 1, Curves.easeOutCubic),
      oLetter: seg(2.27, 2.62, 0, 1, Curves.easeOutCubic),
      dLetter: seg(2.34, 2.69, 0, 1, Curves.easeOutCubic),
      jRise: (1 - seg(2.20, 2.55, 0, 1, Curves.easeOutCubic)) * 15,
      oRise: (1 - seg(2.27, 2.62, 0, 1, Curves.easeOutCubic)) * 15,
      dRise: (1 - seg(2.34, 2.69, 0, 1, Curves.easeOutCubic)) * 15,
      // 14. Leaf grows inside the O.
      leafOpacity: seg(2.27, 2.62, 0, 1, Curves.easeOutCubic),
      leafGrow: seg(2.27, 2.62, 0.5, 1, Curves.easeOutBack),
      leafSpin:
          seg(2.27, 2.62, -10, 0, Curves.easeOutCubic) * math.pi / 180,
      // 15/16/17. Descriptor, tagline, supporting line.
      descriptorOpacity: seg(2.60, 2.95, 0, 1, Curves.easeOutCubic),
      descriptorRise: (1 - seg(2.60, 2.95, 0, 1, Curves.easeOutCubic)) * 10,
      taglineOpacity: seg(2.90, 3.25, 0, 1, Curves.easeOutCubic),
      taglineRise: (1 - seg(2.90, 3.25, 0, 1, Curves.easeOutCubic)) * 8,
      supportOpacity: seg(3.15, 3.45, 0, 1, Curves.easeOut),
      supportTracking: seg(3.15, 3.45, 0, 1, Curves.easeInOut),
      // 18. Final settle.
      contentScale: 0.985 + 0.015 * seg(3.45, 3.63, 0, 1, Curves.easeOut),
    );
  }
}

class _JodSplashPainter extends CustomPainter {
  _JodSplashPainter(this.pose);

  final _JodPose pose;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRect(Offset.zero & size, Paint()..color = const Color(0xFFFFFFFF));

    final double u = size.width / 390.0;

    canvas.save();
    canvas.translate(size.width / 2, size.height / 2);
    canvas.scale(pose.contentScale);
    canvas.translate(-size.width / 2, -size.height / 2);

    final Offset symbol = Offset(size.width / 2, size.height * 0.295);

    // 1. Faint brand glow behind the whole composition.
    _drawGlow(canvas, symbol, u);

    // Heart sits behind the figures — created by the blues coming together.
    _drawHeart(canvas, symbol, u);

    // 3/4. Blue community figures.
    _drawPerson(
      canvas,
      Offset(
        symbol.dx - 80 * u + 34 * u * pose.blueLength + 10 * u * pose.bluesNudge,
        symbol.dy + 16 * u,
      ),
      u,
      _kBlue,
      pose.blueLength,
      pose.blueLScale,
      arm: 0,
      lean: 0.05,
    );
    _drawPerson(
      canvas,
      Offset(
        symbol.dx + 80 * u - 34 * u * pose.blueRightLength - 10 * u * pose.bluesNudge,
        symbol.dy + 16 * u,
      ),
      u,
      _kBlue,
      pose.blueRightLength,
      pose.blueRScale,
      arm: 0,
      lean: -0.05,
    );

    // 9/7. Green person emerges from the heart, arms rise in joy.
    if (pose.greenHalo > 0.001) {
      final double haloCenterY = symbol.dy + 46 * u;
      final Rect haloRect = Rect.fromCircle(
        center: Offset(symbol.dx, haloCenterY),
        radius: 185 * u,
      );
      canvas.drawCircle(
        Offset(symbol.dx, haloCenterY),
        185 * u,
        Paint()
          ..shader = RadialGradient(
            colors: [
              _kGreen.withValues(alpha: 0.08 * pose.greenHalo),
              _kGreen.withValues(alpha: 0),
            ],
          ).createShader(haloRect),
      );
    }

    _drawPerson(
      canvas,
      Offset(symbol.dx, symbol.dy + 46 * u + pose.greenSpring * u),
      u,
      _kGreen,
      pose.greenOpacity,
      pose.greenScale,
      arm: pose.greenArms,
      lean: 0,
    );

    // 10. Orange person joins.
    _drawPerson(
      canvas,
      Offset(symbol.dx + 54 * u + (1 - pose.orangeEntrance) * 30 * u,
          symbol.dy + 58 * u),
      u,
      _kOrange,
      pose.orangeOpacity,
      pose.orangeSettle,
      arm: 0,
      lean: -0.04,
    );

    // 12/13/14. JOD wordmark with the growing leaf inside the O.
    _drawWordmark(canvas, size, u);

    canvas.restore();
  }

  void _drawGlow(Canvas canvas, Offset symbol, double u) {
    final List<(Offset, double, Color, double)> glows = [
      (Offset(0, -10 * u), 175 * u, _kBlue, 0.05),
      (Offset(0, 46 * u), 165 * u, _kGreen, 0.02 + 0.06 * pose.greenFloor),
      (Offset(54 * u, 58 * u), 150 * u, _kOrange, 0.02 + 0.03 * pose.orangeOpacity),
    ];
    for (final (center, radius, color, alpha) in glows) {
      if (alpha <= 0.001) continue;
      canvas.drawCircle(
        symbol + center,
        radius,
        Paint()
          ..shader = RadialGradient(
            colors: [
              color.withValues(alpha: alpha),
              color.withValues(alpha: 0),
            ],
          ).createShader(Rect.fromCircle(center: symbol + center, radius: radius)),
      );
    }
  }

  void _drawHeart(Canvas canvas, Offset symbol, double u) {
    if (pose.heartOpacity <= 0.001) return;
    final double s = 32 * u * pose.heartFloor * pose.heartSwell;
    final Offset center = symbol + Offset(0, -10 * u);

    if (pose.heartGlow > 0.001) {
      canvas.drawCircle(
        center,
        110 * u,
        Paint()
          ..shader = RadialGradient(
            colors: [
              _kBlue.withValues(alpha: pose.heartGlow),
              _kBlue.withValues(alpha: 0),
            ],
          ).createShader(Rect.fromCircle(center: center, radius: 110 * u)),
      );
    }

    final Paint fill = Paint()..color = _kBlue.withValues(alpha: pose.heartOpacity);
    final Path path = Path()
      ..moveTo(center.dx, center.dy + s)
      ..cubicTo(center.dx - 0.78 * s, center.dy + 0.42 * s, center.dx - 1.02 * s,
          center.dy - 0.42 * s, center.dx - 0.52 * s, center.dy - 0.60 * s)
      ..cubicTo(center.dx - 0.16 * s, center.dy - 0.72 * s, center.dx,
          center.dy - 0.46 * s, center.dx, center.dy - 0.40 * s)
      ..cubicTo(center.dx, center.dy - 0.46 * s, center.dx + 0.16 * s,
          center.dy - 0.72 * s, center.dx + 0.52 * s, center.dy - 0.60 * s)
      ..cubicTo(center.dx + 1.02 * s, center.dy - 0.42 * s, center.dx + 0.78 * s,
          center.dy + 0.42 * s, center.dx, center.dy + s)
      ..close();
    canvas.drawPath(path, fill);
  }

  /// A stylised figurine: head, bell body and two arms (raised when [arm] > 0).
  void _drawPerson(
    Canvas canvas,
    Offset base,
    double u,
    Color color,
    double opacity,
    double scale, {
    required double arm,
    required double lean,
  }) {
    if (opacity <= 0.001) return;
    final double s = u;
    final Paint fill = Paint()..color = color.withValues(alpha: opacity);

    canvas.save();
    canvas.translate(base.dx, base.dy);
    canvas.rotate(lean);
    canvas.scale(scale);

    final Path body = Path()
      ..moveTo(-12.5 * s, -24 * s)
      ..lineTo(-16.5 * s, -5 * s)
      ..quadraticBezierTo(0, 6 * s, 16.5 * s, -5 * s)
      ..lineTo(12.5 * s, -24 * s)
      ..close();
    canvas.drawPath(body, fill);

    canvas.drawCircle(Offset(0, -36 * s), 15.5 * s, fill);

    final Paint arms = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 7.5 * s
      ..strokeCap = StrokeCap.round
      ..color = color.withValues(alpha: opacity);
    final Offset shoulderL = Offset(-10.5 * s, -22 * s);
    final Offset shoulderR = Offset(10.5 * s, -22 * s);

    canvas.drawPath(
      Path()
        ..moveTo(shoulderR.dx, shoulderR.dy)
        ..quadraticBezierTo(
          15 * s,
          -19 * s + 9 * s * arm,
          13.5 * s,
          1.5 * s - 15.5 * s * arm,
        ),
      arms,
    );
    canvas.drawPath(
      Path()
        ..moveTo(shoulderL.dx, shoulderL.dy)
        ..quadraticBezierTo(
          -15 * s,
          -19 * s + 9 * s * arm,
          -13.5 * s,
          1.5 * s - 15.5 * s * arm,
        ),
      arms,
    );

    canvas.restore();
  }

  void _drawWordmark(Canvas canvas, Size size, double u) {
    final double fs = 48 * u;
    final double wTop = size.height * 0.505;
    final double gap = fs * 0.16;

    final TextPainter tpJ = _text('J', fs, FontWeight.w800, _kInk, pose.jLetter);
    final TextPainter tpO = _text('O', fs, FontWeight.w800, _kInk, pose.oLetter);
    final TextPainter tpD = _text('D', fs, FontWeight.w800, _kInk, pose.dLetter);

    final double total = tpJ.width + tpO.width + tpD.width + gap * 2;
    double x = (size.width - total) / 2;

    tpJ.paint(canvas, Offset(x, wTop + pose.jRise * u));
    x += tpJ.width + gap;
    final double oX = x;
    tpO.paint(canvas, Offset(oX, wTop + pose.oRise * u));
    x += tpO.width + gap;
    tpD.paint(canvas, Offset(x, wTop + pose.dRise * u));

    // 14. Leaf grows inside the counter of the O.
    _drawLeaf(canvas, Offset(oX + tpO.width / 2, wTop + fs * 0.40), fs);

    final TextPainter descriptor = _text(
      'Join • Organize • Deliver', 15.5 * u, FontWeight.w600, _kInk,
      pose.descriptorOpacity,
    );
    descriptor.paint(
      canvas,
      Offset((size.width - descriptor.width) / 2, wTop + 64 * u + pose.descriptorRise * u),
    );

    final TextPainter tagline = _text(
      'Your Registration, Your Identity.', 13.5 * u, FontWeight.w400, _kDim,
      pose.taglineOpacity,
    );
    tagline.paint(
      canvas,
      Offset((size.width - tagline.width) / 2, wTop + 94 * u + pose.taglineRise * u),
    );

    final TextPainter support = TextPainter(
      text: TextSpan(
        text: 'PEOPLE • OPPORTUNITIES • A BETTER TOMORROW',
        style: TextStyle(
          fontSize: 10.5 * u,
          fontWeight: FontWeight.w500,
          letterSpacing: (1 + pose.supportTracking) * u,
          color: _kFaint.withValues(alpha: pose.supportOpacity),
        ),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    support.paint(
      canvas,
      Offset((size.width - support.width) / 2, wTop + 128 * u),
    );
  }

  void _drawLeaf(Canvas canvas, Offset center, double fs) {
    if (pose.leafOpacity <= 0.001) return;
    final double l = fs * 0.46;
    canvas.save();
    canvas.translate(center.dx, center.dy);
    canvas.rotate(pose.leafSpin);
    canvas.scale(pose.leafGrow);

    final Paint fill = Paint()..color = _kGreen.withValues(alpha: pose.leafOpacity);
    final Path leaf = Path()
      ..moveTo(-l * 0.46, 0)
      ..quadraticBezierTo(-l * 0.06, -l * 0.20, l * 0.14, -l * 0.04)
      ..quadraticBezierTo(l * 0.06, 0, l * 0.14, l * 0.04)
      ..quadraticBezierTo(-l * 0.06, l * 0.20, -l * 0.46, 0)
      ..close();
    canvas.drawPath(leaf, fill);

    canvas.drawLine(
      Offset(l * 0.12, 0),
      Offset(-l * 0.42, 0),
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = l * 0.10
        ..strokeCap = StrokeCap.round
        ..color = _kGreen.withValues(alpha: pose.leafOpacity),
    );

    canvas.restore();
  }

  TextPainter _text(String text, double fontSize, FontWeight weight, Color color, double alpha) {
    return TextPainter(
      text: TextSpan(
        text: text,
        style: TextStyle(
          fontSize: fontSize,
          fontWeight: weight,
          height: 1.15,
          color: color.withValues(alpha: alpha.clamp(0.0, 1.0)),
        ),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
  }

  @override
  bool shouldRepaint(covariant _JodSplashPainter oldDelegate) => true;
}