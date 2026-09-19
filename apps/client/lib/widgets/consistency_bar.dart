import 'package:flutter/material.dart';

class ConsistencyBar extends StatelessWidget {
  final double presentFraction;
  final double absentFraction;
  final double leaveFraction;
  final double lateFraction;
  final double height;

  const ConsistencyBar({
    super.key,
    required this.presentFraction,
    required this.absentFraction,
    required this.leaveFraction,
    required this.lateFraction,
    this.height = 8,
  });

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(height / 2),
      child: SizedBox(
        width: double.infinity,
        height: height,
        child: Row(
          children: [
            if (presentFraction > 0)
              Flexible(
                flex: (presentFraction * 1000).round(),
                child: Container(color: const Color(0xFF2a6a4b)),
              ),
            if (absentFraction > 0)
              Flexible(
                flex: (absentFraction * 1000).round(),
                child: Container(color: const Color(0xFFba1a1a)),
              ),
            if (leaveFraction > 0)
              Flexible(
                flex: (leaveFraction * 1000).round(),
                child: Container(color: const Color(0xFFd1e4ff)),
              ),
            if (lateFraction > 0)
              Flexible(
                flex: (lateFraction * 1000).round(),
                child: Container(color: const Color(0xFFffddb8)),
              ),
          ],
        ),
      ),
    );
  }
}
