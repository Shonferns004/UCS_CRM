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
    return _SkeletonAnimationScope(animation: _anim, child: widget.child);
  }
}

class _SkeletonAnimationScope extends InheritedWidget {
  final Animation<double> animation;
  const _SkeletonAnimationScope({
    required this.animation,
    required super.child,
  });

  static Animation<double>? of(BuildContext context) => context
      .dependOnInheritedWidgetOfExactType<_SkeletonAnimationScope>()
      ?.animation;

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
    this.color = const Color(0xffdceaf6),
  });

  @override
  Widget build(BuildContext context) {
    final anim = _SkeletonAnimationScope.of(context);
    if (anim == null) {
      return _Block(
        width: width,
        height: height,
        borderRadius: borderRadius,
        color: color,
      );
    }
    return AnimatedBuilder(
      animation: anim,
      builder: (_, __) {
        // Pulse the block color instead of wrapping the whole tree in an
        // Opacity layer (which forces an expensive off-screen composite of
        // the entire skeleton subtree every frame).
        final t = anim.value;
        final lerped = Color.lerp(color, Colors.white, (t - 0.3) / 0.4 * 0.6)!;
        return _Block(
          width: width,
          height: height,
          borderRadius: borderRadius,
          color: lerped,
        );
      },
    );
  }
}

class _Block extends StatelessWidget {
  final double width;
  final double height;
  final double borderRadius;
  final Color color;
  const _Block({
    required this.width,
    required this.height,
    required this.borderRadius,
    required this.color,
  });

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

  static Widget _card({required Widget child, double? height}) {
    return Container(
      height: height,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        boxShadow: [
          BoxShadow(
            color: const Color(0xff174a7c).withValues(alpha: 0.05),
            blurRadius: 24,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: child,
    );
  }

  @override
  Widget build(BuildContext context) {
    return SkeletonLoader(
      child: Scaffold(
        backgroundColor: const Color(0xffe6f0fa),
        body: SafeArea(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 120),
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        SkeletonBlock(height: 11, width: 90),
                        SizedBox(height: 6),
                        SkeletonBlock(height: 24, width: 150),
                      ],
                    ),
                  ),
                  const SkeletonBlock(width: 48, height: 48, borderRadius: 24),
                ],
              ),
              const SizedBox(height: 24),
              const Center(
                child: SkeletonBlock(width: 110, height: 30, borderRadius: 15),
              ),
              const SizedBox(height: 36),
              const Center(
                child: SkeletonBlock(width: 192, height: 192, borderRadius: 96),
              ),
              const SizedBox(height: 40),
              Row(
                children: [
                  Expanded(
                    child: _card(
                      height: 78,
                      child: const Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          SkeletonBlock(height: 10, width: 26),
                          SizedBox(height: 8),
                          SkeletonBlock(height: 18, width: 70),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _card(
                      height: 78,
                      child: const Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          SkeletonBlock(height: 10, width: 26),
                          SizedBox(height: 8),
                          SkeletonBlock(height: 18, width: 70),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 20),
              SizedBox(
                height: 128,
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Expanded(
                      child: Column(
                        children: [
                          Expanded(
                            child: SkeletonBlock(
                              height: double.infinity,
                              borderRadius: 18,
                            ),
                          ),
                          SizedBox(height: 10),
                          Expanded(
                            child: SkeletonBlock(
                              height: double.infinity,
                              borderRadius: 18,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: SkeletonBlock(
                        height: double.infinity,
                        borderRadius: 22,
                      ),
                    ),
                  ],
                ),
              ),
            ],
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
            color: const Color(0xffe6f0fa),
            borderRadius: BorderRadius.circular(14),
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
        backgroundColor: Color(0xffe6f0fa),
        body: SafeArea(child: ListSkeleton()),
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
      child: SkeletonBlock(
        width: size,
        height: size,
        borderRadius: size / 2,
        color: color,
      ),
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

  static Widget _card({required Widget child}) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        boxShadow: [
          BoxShadow(
            color: const Color(0xff174a7c).withValues(alpha: 0.05),
            blurRadius: 24,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: child,
    );
  }

  static Widget _statRow() {
    return const Row(
      children: [
        Expanded(child: SkeletonBlock(height: 38, borderRadius: 14)),
        SizedBox(width: 12),
        Expanded(child: SkeletonBlock(height: 38, borderRadius: 14)),
      ],
    );
  }

  static Widget _calendarGrid() {
    return Column(
      children: [
        Row(
          children: List.generate(
            7,
            (_) => const Expanded(
              child: Center(child: SkeletonBlock(height: 9, width: 12)),
            ),
          ),
        ),
        const SizedBox(height: 8),
        for (var row = 0; row < 5; row++)
          Padding(
            padding: const EdgeInsets.only(bottom: 4),
            child: Row(
              children: List.generate(
                7,
                (_) => const Expanded(
                  child: Padding(
                    padding: EdgeInsets.all(2),
                    child: SkeletonBlock(height: 34, borderRadius: 12),
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return SkeletonLoader(
      child: Scaffold(
        backgroundColor: const Color(0xffe6f0fa),
        body: SafeArea(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 120),
            children: [
              const SkeletonBlock(height: 26, width: 110),
              const SizedBox(height: 8),
              const SkeletonBlock(height: 12, width: 200),
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: const Color(0xff174a7c),
                  borderRadius: BorderRadius.circular(28),
                  boxShadow: [
                    BoxShadow(
                      color: const Color(0xff174a7c).withValues(alpha: 0.18),
                      blurRadius: 28,
                      offset: const Offset(0, 12),
                    ),
                  ],
                ),
                child: const Row(
                  children: [
                    SkeletonBlock(
                      width: 88,
                      height: 88,
                      borderRadius: 44,
                      color: Color(0x33ffffff),
                    ),
                    SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          SkeletonBlock(
                            height: 20,
                            width: 130,
                            color: Color(0x33ffffff),
                          ),
                          SizedBox(height: 8),
                          SkeletonBlock(
                            height: 12,
                            width: 90,
                            color: Color(0x26ffffff),
                          ),
                          SizedBox(height: 10),
                          SkeletonBlock(
                            height: 11,
                            width: 70,
                            color: Color(0x26ffffff),
                          ),
                          SizedBox(height: 12),
                          SkeletonBlock(
                            height: 24,
                            width: 135,
                            borderRadius: 12,
                            color: Color(0x26ffffff),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              _card(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Row(
                      children: [
                        SkeletonBlock(height: 16, width: 120),
                        Spacer(),
                        SkeletonBlock(height: 12, width: 70),
                      ],
                    ),
                    const SizedBox(height: 14),
                    _statRow(),
                    const SizedBox(height: 10),
                    _statRow(),
                    const SizedBox(height: 10),
                    _statRow(),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              _card(
                child: const Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        SkeletonBlock(height: 16, width: 150),
                        Spacer(),
                        SkeletonBlock(height: 12, width: 60),
                      ],
                    ),
                    SizedBox(height: 16),
                    Row(
                      children: [
                        SkeletonBlock(width: 86, height: 54, borderRadius: 14),
                        SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              SkeletonBlock(height: 12, width: 90),
                              SizedBox(height: 8),
                              SkeletonBlock(height: 10),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              _card(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const SkeletonBlock(height: 18, width: 170),
                    const SizedBox(height: 16),
                    const SkeletonBlock(height: 8),
                    const SizedBox(height: 20),
                    const Row(
                      children: [
                        SkeletonBlock(width: 38, height: 38, borderRadius: 19),
                        Spacer(),
                        SkeletonBlock(height: 14, width: 110),
                        Spacer(),
                        SkeletonBlock(width: 38, height: 38, borderRadius: 19),
                      ],
                    ),
                    const SizedBox(height: 14),
                    _calendarGrid(),
                    const SizedBox(height: 16),
                    const Row(
                      children: [
                        SkeletonBlock(height: 10, width: 60),
                        SizedBox(width: 16),
                        SkeletonBlock(height: 10, width: 50),
                        SizedBox(width: 16),
                        SkeletonBlock(height: 10, width: 55),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              _card(
                child: const Row(
                  children: [
                    SkeletonBlock(width: 20, height: 20, borderRadius: 10),
                    SizedBox(width: 10),
                    SkeletonBlock(height: 16, width: 100),
                  ],
                ),
              ),
              const SizedBox(height: 24),
              const SkeletonBlock(height: 52, borderRadius: 14),
            ],
          ),
        ),
      ),
    );
  }
}
