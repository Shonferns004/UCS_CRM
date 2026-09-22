import 'package:flutter/material.dart';
import '../theme/app_colors.dart';

/// Shimmer skeleton primitive used in place of circular progress
/// indicators across the app (splash, page loads and button busy states).
class SkeletonBox extends StatefulWidget {
  final double width;
  final double height;
  final double borderRadius;
  final Color? baseColor;
  final Color? shineColor;

  const SkeletonBox({
    super.key,
    required this.width,
    required this.height,
    this.borderRadius = 12,
    this.baseColor,
    this.shineColor,
  });

  @override
  State<SkeletonBox> createState() => _SkeletonBoxState();
}

class _SkeletonBoxState extends State<SkeletonBox>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1400),
  )..repeat();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final base = widget.baseColor ?? AppColors.surfaceSoft;
    final shine = (widget.shineColor ?? Colors.white).withValues(alpha: 0.9);

    return ClipRRect(
      borderRadius: BorderRadius.circular(widget.borderRadius),
      child: SizedBox(
        width: widget.width,
        height: widget.height,
        child: LayoutBuilder(
          builder: (context, box) {
            final w = box.maxWidth;
            return Stack(
              children: [
                Container(color: base),
                AnimatedBuilder(
                  animation: _controller,
                  builder: (context, child) {
                    final slide = (_controller.value * 2) - 1;
                    return Positioned(
                      left: -w + (slide * w * 2),
                      width: w,
                      child: Container(
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.centerLeft,
                            end: Alignment.centerRight,
                            colors: [
                              base.withValues(alpha: 0),
                              shine,
                              base.withValues(alpha: 0),
                            ],
                            stops: const [0.1, 0.5, 0.9],
                          ),
                        ),
                      ),
                    );
                  },
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

/// Rounded placeholder used for avatar/icon shells.
class SkeletonAvatar extends StatelessWidget {
  final double size;
  final Color? baseColor;

  const SkeletonAvatar({super.key, this.size = 44, this.baseColor});

  @override
  Widget build(BuildContext context) {
    return SkeletonBox(
      width: size,
      height: size,
      borderRadius: size / 2,
      baseColor: baseColor,
    );
  }
}

/// Generic full-page skeleton used by list/table pages while loading.
class SkeletonList extends StatelessWidget {
  final int rows;
  final EdgeInsets padding;

  const SkeletonList({super.key, this.rows = 5, this.padding = const EdgeInsets.all(24)});

  @override
  Widget build(BuildContext context) {
    return ListView.separated(
      padding: padding,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: rows,
      separatorBuilder: (context, index) => const SizedBox(height: 14),
      itemBuilder: (context, index) => Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: AppColors.border),
        ),
        child: Row(
          children: [
            const SkeletonAvatar(size: 44),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SkeletonBox(width: double.infinity, height: 14, borderRadius: 7),
                  const SizedBox(height: 10),
                  SkeletonBox(width: 140, height: 12, borderRadius: 6),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}