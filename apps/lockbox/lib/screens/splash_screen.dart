import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../core/theme/app_colors.dart';

/// Design Screen 01 — splash. Decides routing in main.dart; this is purely
/// visual so the user never sees a blank frame while state loads.
class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Scaffold(
      backgroundColor: dark ? AppColors.darkBg : AppColors.background,
      body: SafeArea(
        child: Column(
          children: [
            const Spacer(flex: 3),
            // Staggered rise-and-fade so the branding assembles rather than
            // appearing all at once.
            _Rise(
              delayMs: 0,
              child: _LogoBadge(size: 92),
            ),
            const SizedBox(height: 20),
            _Rise(
              delayMs: 90,
              child: Text(
                'LockBox',
                style: TextStyle(
                  fontSize: 30,
                  fontWeight: FontWeight.w800,
                  color: dark ? AppColors.darkTextPrimary : AppColors.textPrimary,
                  letterSpacing: 0.5,
                ),
              ),
            ),
            const SizedBox(height: 8),
            _Rise(
              delayMs: 180,
              child: Text(
                'Stay Focused.\nUse What Matters.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 14,
                  height: 1.4,
                  color: dark ? AppColors.darkTextSecondary : AppColors.textSecondary,
                ),
              ),
            ),
            const Spacer(flex: 2),
            _Rise(
              delayMs: 260,
              child: SizedBox(
                width: 22,
                height: 22,
                child: CircularProgressIndicator(strokeWidth: 2.4),
              ),
            ),
            const Spacer(flex: 3),
            _Rise(
              delayMs: 340,
              child: Text(
                'UCS',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 2,
                  color: dark ? AppColors.darkTextTertiary : AppColors.textTertiary,
                ),
              ),
            ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }
}

/// Fades and lifts its child in after [delayMs].
class _Rise extends StatefulWidget {
  final int delayMs;
  final Widget child;

  const _Rise({required this.delayMs, required this.child});

  @override
  State<_Rise> createState() => _RiseState();
}

class _RiseState extends State<_Rise> with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 480),
  );

  @override
  void initState() {
    super.initState();
    if (widget.delayMs == 0) {
      _controller.forward();
    } else {
      Future<void>.delayed(Duration(milliseconds: widget.delayMs), () {
        if (mounted) _controller.forward();
      });
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
      builder: (context, child) {
        final t = Curves.easeOutCubic.transform(_controller.value);
        return Opacity(
          opacity: t,
          child: Transform.translate(offset: Offset(0, 14 * (1 - t)), child: child),
        );
      },
      child: widget.child,
    );
  }
}

class _LogoBadge extends StatelessWidget {
  final double size;
  const _LogoBadge({required this.size});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [AppColors.primary, AppColors.primaryDark],
        ),
        borderRadius: BorderRadius.circular(size * 0.28),
        boxShadow: [
          BoxShadow(
            color: AppColors.primary.withValues(alpha: 0.35),
            blurRadius: 28,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Center(
        child: Icon(LucideIcons.lockKeyhole, size: size * 0.48, color: Colors.white),
      ),
    );
  }
}