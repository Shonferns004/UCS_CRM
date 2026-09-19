import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

class MenuItem extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color? iconColor;
  final Color? labelColor;
  final bool isDestructive;
  final VoidCallback? onTap;

  const MenuItem({
    super.key,
    required this.icon,
    required this.label,
    this.iconColor,
    this.labelColor,
    this.isDestructive = false,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final sc = Theme.of(context).colorScheme;
    final effectiveIconColor = iconColor ?? (isDestructive
        ? sc.error
        : sc.onSurfaceVariant);
    final effectiveLabelColor = labelColor ?? (isDestructive
        ? sc.error
        : sc.onSurface);

    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        child: Row(
          children: [
            Icon(icon, size: 20, color: effectiveIconColor),
            const SizedBox(width: 16),
            Expanded(
              child: Text(
                label,
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: effectiveLabelColor,
                ),
              ),
            ),
            Icon(
              LucideIcons.chevronRight,
              size: 20,
              color: sc.outlineVariant,
            ),
          ],
        ),
      ),
    );
  }
}
