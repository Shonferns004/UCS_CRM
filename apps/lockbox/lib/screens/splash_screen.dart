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
            _LogoBadge(size: 92),
            const SizedBox(height: 20),
            Text(
              'LockBox',
              style: TextStyle(
                fontSize: 30,
                fontWeight: FontWeight.w800,
                color: dark ? AppColors.darkTextPrimary : AppColors.textPrimary,
                letterSpacing: 0.5,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Stay Focused.\nUse What Matters.',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 14,
                height: 1.4,
                color: dark ? AppColors.darkTextSecondary : AppColors.textSecondary,
              ),
            ),
            const Spacer(flex: 2),
            const SizedBox(
              width: 22,
              height: 22,
              child: CircularProgressIndicator(strokeWidth: 2.4),
            ),
            const Spacer(flex: 3),
            Text(
              'UCS',
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                letterSpacing: 2,
                color: dark ? AppColors.darkTextTertiary : AppColors.textTertiary,
              ),
            ),
            const SizedBox(height: 24),
          ],
        ),
      ),
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