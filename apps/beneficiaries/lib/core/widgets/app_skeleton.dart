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

/// Row of number-over-label stat cards, shaped like the cards it stands in for
/// (Kits program/summary cards) so the layout does not jump when the real
/// counts arrive.
class SkeletonStatRow extends StatelessWidget {
  final int cards;
  final double height;
  final double gap;
  final double numberWidth;

  const SkeletonStatRow({
    super.key,
    this.cards = 3,
    this.height = 78,
    this.gap = 10,
    this.numberWidth = 44,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        for (var i = 0; i < cards; i++) ...[
          if (i > 0) SizedBox(width: gap),
          Expanded(
            child: Container(
              height: height,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: AppColors.border),
              ),
              // FittedBox keeps the placeholder inside the card on short or
              // narrow screens instead of overflowing when the card ends up
              // with less room than the number+label stack needs.
              child: FittedBox(
                fit: BoxFit.scaleDown,
                alignment: Alignment.centerLeft,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SkeletonBox(width: numberWidth, height: 20, borderRadius: 8),
                    const SizedBox(height: 6),
                    const SkeletonBox(width: 52, height: 10, borderRadius: 6),
                  ],
                ),
              ),
            ),
          ),
        ],
      ],
    );
  }
}

/// Column of card-shaped placeholder rows. Used where a [SkeletonList] cannot
/// be, because the real content already lives inside a parent scroll view (a
/// nested ListView would be unbounded there).
class SkeletonCardRows extends StatelessWidget {
  final int rows;
  final double gap;
  final double leadingSize;
  final double leadingRadius;
  final int lines;

  const SkeletonCardRows({
    super.key,
    this.rows = 3,
    this.gap = 10,
    this.leadingSize = 44,
    this.lines = 2,
    double? leadingRadius,
  }) : leadingRadius = leadingRadius ?? leadingSize / 2;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        for (var i = 0; i < rows; i++) ...[
          if (i > 0) SizedBox(height: gap),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(18),
            ),
            child: Row(
              children: [
                SkeletonBox(
                  width: leadingSize,
                  height: leadingSize,
                  borderRadius: leadingRadius,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      for (var l = 0; l < lines; l++) ...[
                        if (l > 0) const SizedBox(height: 8),
                        SkeletonBox(
                          width: l == 0 ? double.infinity : 140,
                          height: l == 0 ? 14 : 11,
                          borderRadius: 6,
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ],
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