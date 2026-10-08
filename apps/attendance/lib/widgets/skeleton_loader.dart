import 'package:flutter/material.dart';

class SkeletonLoader extends StatefulWidget {
  final Widget child;
  const SkeletonLoader({super.key, required this.child});

  @override
  State<SkeletonLoader> createState() => _SkeletonLoaderState();
}

class _SkeletonLoaderState extends State<SkeletonLoader>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _anim;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    )..repeat(reverse: true);
    _anim = Tween<double>(begin: 0.3, end: 0.7).animate(_controller);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return _SkeletonAnimationScope(
      animation: _anim,
      child: widget.child,
    );
  }
}

class _SkeletonAnimationScope extends InheritedWidget {
  final Animation<double> animation;
  const _SkeletonAnimationScope({required this.animation, required super.child});

  static Animation<double>? of(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<_SkeletonAnimationScope>()?.animation;

  @override
  bool updateShouldNotify(covariant _SkeletonAnimationScope oldWidget) => false;
}

class SkeletonBlock extends StatelessWidget {
  final double width;
  final double height;
  final double borderRadius;
  final Color color;
  const SkeletonBlock({
    super.key,
    this.width = double.infinity,
    required this.height,
    this.borderRadius = 8,
    this.color = const Color(0xFFe0e4ea),
  });

  @override
  Widget build(BuildContext context) {
    final anim = _SkeletonAnimationScope.of(context);
    if (anim == null) {
      return _Block(width: width, height: height, borderRadius: borderRadius, color: color);
    }
    return AnimatedBuilder(
      animation: anim,
      builder: (_, __) {
        // Pulse the block color instead of wrapping the whole tree in an
        // Opacity layer (which forces an expensive off-screen composite of
        // the entire skeleton subtree every frame).
        final t = anim.value;
        final lerped = Color.lerp(color, Colors.white, (t - 0.3) / 0.4 * 0.6)!;
        return _Block(width: width, height: height, borderRadius: borderRadius, color: lerped);
      },
    );
  }
}

class _Block extends StatelessWidget {
  final double width;
  final double height;
  final double borderRadius;
  final Color color;
  const _Block({required this.width, required this.height, required this.borderRadius, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(borderRadius),
      ),
    );
  }
}

class HomeSkeleton extends StatelessWidget {
  const HomeSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return SkeletonLoader(
      child: Scaffold(
        backgroundColor: const Color(0xFFf6fafe),
        body: SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(16, 24, 16, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SkeletonBlock(height: 12, width: 80),
                const SizedBox(height: 8),
                SkeletonBlock(height: 24, width: 180),
                const SizedBox(height: 32),
                SkeletonBlock(height: 48, width: double.infinity),
                const SizedBox(height: 16),
                SkeletonBlock(height: 80, width: double.infinity),
                const SizedBox(height: 16),
                Row(children: [
                  Expanded(child: SkeletonBlock(height: 120)),
                  const SizedBox(width: 12),
                  Expanded(child: SkeletonBlock(height: 120)),
                ]),
                const SizedBox(height: 16),
                SkeletonBlock(height: 100, width: double.infinity),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Generic card-list skeleton for page-level loading states.
class ListSkeleton extends StatelessWidget {
  final int itemCount;
  const ListSkeleton({super.key, this.itemCount = 8});

  @override
  Widget build(BuildContext context) {
    return SkeletonLoader(
      child: ListView.builder(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 40),
        physics: const NeverScrollableScrollPhysics(),
        itemCount: itemCount,
        itemBuilder: (context, i) => Container(
          margin: const EdgeInsets.only(bottom: 10),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: const Color(0xFFf6fafe),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: const Color(0xFFe0e4ea)),
          ),
          child: const Row(
            children: [
              SkeletonBlock(width: 40, height: 40, borderRadius: 20),
              SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SkeletonBlock(height: 14, width: 120),
                    SizedBox(height: 8),
                    SkeletonBlock(height: 12),
                  ],
                ),
              ),
              SkeletonBlock(width: 60, height: 24, borderRadius: 12),
            ],
          ),
        ),
      ),
    );
  }
}

/// Full-screen skeleton used while a page loads its initial data.
class PageSkeleton extends StatelessWidget {
  const PageSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return const SkeletonLoader(
      child: Scaffold(
        backgroundColor: Color(0xFFf6fafe),
        body: SafeArea(
          child: ListSkeleton(),
        ),
      ),
    );
  }
}

/// Small pulsing block used inside buttons while an action is in progress.
class ButtonSkeleton extends StatelessWidget {
  final double size;
  final Color color;
  const ButtonSkeleton({super.key, this.size = 20, this.color = Colors.white});

  @override
  Widget build(BuildContext context) {
    return SkeletonLoader(
      child: SkeletonBlock(width: size, height: size, borderRadius: 4, color: color),
    );
  }
}

class SplashSkeleton extends StatelessWidget {
  const SplashSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      backgroundColor: Color(0xFFFFFFFF),
      body: Center(
        child: SkeletonBlock(width: 120, height: 120, borderRadius: 12),
      ),
    );
  }
}

class ProfileSkeleton extends StatelessWidget {
  const ProfileSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return SkeletonLoader(
      child: Scaffold(
        backgroundColor: const Color(0xFFf6fafe),
        body: SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(16, 24, 16, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(children: [
                  SkeletonBlock(width: 80, height: 80, borderRadius: 40),
                  const SizedBox(width: 16),
                  Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    SkeletonBlock(height: 20, width: 140),
                    const SizedBox(height: 6),
                    SkeletonBlock(height: 14, width: 100),
                    const SizedBox(height: 6),
                    SkeletonBlock(height: 14, width: 80),
                  ]),
                ]),
                const SizedBox(height: 32),
                Row(children: [
                  Expanded(child: SkeletonBlock(height: 100)),
                  const SizedBox(width: 12),
                  Expanded(child: SkeletonBlock(height: 100)),
                ]),
                const SizedBox(height: 12),
                Row(children: [
                  Expanded(child: SkeletonBlock(height: 100)),
                  const SizedBox(width: 12),
                  Expanded(child: SkeletonBlock(height: 100)),
                ]),
                const SizedBox(height: 32),
                SkeletonBlock(height: 24, width: 160),
                const SizedBox(height: 12),
                SkeletonBlock(height: 200, width: double.infinity),
                const SizedBox(height: 24),
                SkeletonBlock(height: 20, width: 180),
                const SizedBox(height: 12),
                SkeletonBlock(height: 48, width: double.infinity),
                const SizedBox(height: 8),
                SkeletonBlock(height: 48, width: double.infinity),
                const SizedBox(height: 8),
                SkeletonBlock(height: 48, width: double.infinity),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
