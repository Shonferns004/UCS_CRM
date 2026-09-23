import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/theme/app_colors.dart';

/// Design Screen 02 — Welcome. Explains the app before permissions are asked.
class WelcomePage extends StatelessWidget {
  final VoidCallback onStart;

  const WelcomePage({super.key, required this.onStart});

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final primaryText = dark ? AppColors.darkTextPrimary : AppColors.textPrimary;
    final secondaryText = dark ? AppColors.darkTextSecondary : AppColors.textSecondary;

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 12),
          Center(
            child: Container(
              width: 120,
              height: 120,
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [AppColors.primary, AppColors.primaryDark],
                ),
                borderRadius: BorderRadius.circular(32),
                boxShadow: [
                  BoxShadow(
                    color: AppColors.primary.withValues(alpha: 0.3),
                    blurRadius: 30,
                    offset: const Offset(0, 12),
                  ),
                ],
              ),
              child: const Icon(LucideIcons.shieldCheck, size: 54, color: Colors.white),
            ),
          ),
          const SizedBox(height: 28),
          Text(
            'Welcome to LockBox',
            style: TextStyle(
              fontSize: 26,
              fontWeight: FontWeight.w800,
              color: primaryText,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Block distracting apps, stay focused and use only what matters.',
            style: TextStyle(fontSize: 15, height: 1.5, color: secondaryText),
          ),
          const SizedBox(height: 28),
          _FeatureRow(
            icon: LucideIcons.listChecks,
            iconColor: AppColors.success,
            title: 'Allowlist apps you trust',
            subtitle: 'Choose which apps you can use.',
          ),
          const SizedBox(height: 14),
          _FeatureRow(
            icon: LucideIcons.lock,
            iconColor: AppColors.primary,
            title: 'Automatically blocks others',
            subtitle: 'Everything else is blocked instantly.',
          ),
          const SizedBox(height: 14),
          _FeatureRow(
            icon: LucideIcons.eyeOff,
            iconColor: AppColors.warning,
            title: 'Hidden from launcher',
            subtitle: 'Stays hidden after setup.',
          ),
          const SizedBox(height: 36),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: onStart,
              child: const Text("Let's Get Started"),
            ),
          ),
        ],
      ),
    );
  }
}

class _FeatureRow extends StatelessWidget {
  final IconData icon;
  final Color iconColor;
  final String title;
  final String subtitle;

  const _FeatureRow({
    required this.icon,
    required this.iconColor,
    required this.title,
    required this.subtitle,
  });

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 44,
          height: 44,
          decoration: BoxDecoration(
            color: iconColor.withValues(alpha: 0.12),
            borderRadius: AppRadii.small,
          ),
          child: Icon(icon, size: 22, color: iconColor),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                  color: dark ? AppColors.darkTextPrimary : AppColors.textPrimary,
                ),
              ),
              const SizedBox(height: 3),
              Text(
                subtitle,
                style: TextStyle(
                  fontSize: 13.5,
                  color: dark ? AppColors.darkTextSecondary : AppColors.textSecondary,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}