import 'package:flutter/material.dart';

import '../theme.dart';

class SkeletonBlock extends StatefulWidget {
  final double height;
  final double? width;
  const SkeletonBlock({super.key, required this.height, this.width});

  @override
  State<SkeletonBlock> createState() => _SkeletonBlockState();
}

class _SkeletonBlockState extends State<SkeletonBlock>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1400),
  )..repeat();

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _ctrl,
      builder: (context, _) {
        final t = (_ctrl.value * 2) % 1.0;
        final begin = t < 0.5 ? t * 2 : (1 - (t - 0.5) * 2);
        return Container(
          width: widget.width ?? double.infinity,
          height: widget.height,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(10),
            gradient: LinearGradient(
              begin: Alignment(-1 + begin * 2, 0),
              end: Alignment(begin * 2, 0),
              colors: const [AppColors.line, Color(0xFFF8F9FB), AppColors.line],
            ),
          ),
        );
      },
    );
  }
}
