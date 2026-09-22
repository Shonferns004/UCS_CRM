import 'package:flutter/material.dart';
import '../lucide_icons.dart';
import '../theme/app_colors.dart';
import '../theme/app_theme.dart';

/// Compact rounded snackbar (DESIGN.md section 32) styled for the light
/// theme: a floating white pill with a subtle accent per state. Always
/// floats above the bottom tab bar so it is never covered.
void showAppSnackbar(
  BuildContext context,
  String message, {
  bool success = false,
  bool error = false,
  bool warning = false,
  EdgeInsetsGeometry margin =
      const EdgeInsets.fromLTRB(40, 0, 40, 48),
}) {
  final Color accent = success
      ? AppColors.successGreen
      : error
          ? AppColors.error
          : warning
              ? AppColors.warning
              : AppColors.primaryBlue;
  final Color bg = success
      ? AppColors.successGreenLight
      : error
          ? AppColors.errorSoft
          : warning
              ? const Color(0xFFFFF7E6)
              : AppColors.surface;
  final Color border = success
      ? AppColors.statDonationsBorder
      : error
          ? const Color(0xFFFECACA)
          : warning
              ? const Color(0xFFF3E3C1)
              : AppColors.border;
  final IconData? icon = success
      ? LucideIcons.checkCircle
      : error
          ? LucideIcons.alertCircle
          : null;

  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        behavior: SnackBarBehavior.floating,
        backgroundColor: Colors.transparent,
        elevation: 0,
        margin: margin,
        padding: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
        ),
        duration: const Duration(milliseconds: 2500),
        content: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 340),
            child: Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: bg,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: border),
                boxShadow: const [
                  BoxShadow(
                    color: Color(0x14111827),
                    blurRadius: 16,
                    offset: Offset(0, 4),
                  ),
                ],
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (icon != null) ...[
                    Icon(icon, size: 18, color: accent),
                    const SizedBox(width: 8),
                  ],
                  Flexible(
                    child: Text(
                      message,
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: accent,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
}

/// Success state hint (DESIGN.md section 29).
Widget successHint(BuildContext context, String message) {
  return Container(
    width: double.infinity,
    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
    decoration: BoxDecoration(
      color: AppTheme.greenSoft,
      borderRadius: AppTheme.radiusSmall,
    ),
    child: Row(
      children: [
        const Icon(LucideIcons.checkCircle, size: 20, color: AppTheme.success),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            message,
            style:
                const TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: AppColors.successGreen),
          ),
        ),
      ],
    ),
  );
}

/// Error state hint (DESIGN.md section 30).
Widget errorHint(BuildContext context, String message) {
  return Container(
    width: double.infinity,
    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
    decoration: BoxDecoration(
      color: AppTheme.errorSoft,
      borderRadius: AppTheme.radiusSmall,
    ),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Icon(LucideIcons.alertCircle, size: 20, color: AppTheme.error),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            message,
            style: const TextStyle(fontSize: 13, height: 1.4, color: AppColors.error),
          ),
        ),
      ],
    ),
  );
}