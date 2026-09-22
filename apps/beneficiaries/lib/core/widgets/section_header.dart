import 'package:flutter/material.dart';
import '../theme/app_text_styles.dart';

/// Section title + optional subtitle + optional trailing action
/// (DESIGN.md section 13).
class SectionHeader extends StatelessWidget {
  final String title;
  final String? subtitle;
  final Widget? action;

  const SectionHeader({
    super.key,
    required this.title,
    this.subtitle,
    this.action,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Expanded(
              child: Text(title, style: AppTextStyles.sectionTitle),
            ),
            ?action,
          ],
        ),
        if (subtitle != null) ...[
          const SizedBox(height: 4),
          Text(subtitle!, style: AppTextStyles.pageSubtitle),
        ],
      ],
    );
  }
}