import 'package:flutter/material.dart';
import '../lucide_icons.dart';
import '../theme/app_colors.dart';

/// Compact beneficiary list row (DESIGN.md section 25).
class BeneficiaryTile extends StatelessWidget {
  final String name;
  final String? code;
  final String? subtitle;
  final Widget? trailing;
  final VoidCallback? onTap;
  final Color accent;

  const BeneficiaryTile({
    super.key,
    required this.name,
    this.code,
    this.subtitle,
    this.trailing,
    this.onTap,
    this.accent = AppColors.primaryBlue,
  });

  @override
  Widget build(BuildContext context) {
    final subtitleText = [code, subtitle].where(
      (e) => e != null && e.isNotEmpty,
    ).join(' • ');

    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          constraints: const BoxConstraints(minHeight: 72),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
          ),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: accent.withAlpha(20),
                  shape: BoxShape.circle,
                ),
                alignment: Alignment.center,
                child: Text(
                  name.isNotEmpty ? name[0].toUpperCase() : '?',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: accent,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                        color: AppColors.textPrimary,
                      ),
                    ),
                    if (subtitleText.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        subtitleText,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 12,
                          color: AppColors.textSecondary,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              if (trailing != null)
                trailing!
              else
                const Icon(
                  LucideIcons.chevronRight,
                  color: AppColors.textTertiary,
                ),
            ],
          ),
        ),
      ),
    );
  }
}