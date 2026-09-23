import 'package:flutter/material.dart';

import '../theme/app_colors.dart';

/// Animated dots row reflecting current digit count.
class PinDots extends StatelessWidget {
  final int length;
  final bool error;

  const PinDots({super.key, required this.length, this.error = false});

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final base = dark ? AppColors.darkTextTertiary : AppColors.border;
    final fill = error
        ? AppColors.error
        : Theme.of(context).colorScheme.primary;
    return AnimatedContainer(
      duration: const Duration(milliseconds: 150),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: List.generate(6, (i) {
          final filled = i < length;
          return AnimatedContainer(
            duration: const Duration(milliseconds: 120),
            width: 16,
            height: 16,
            margin: const EdgeInsets.symmetric(horizontal: 7),
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: filled ? fill : base.withValues(alpha: 0.5),
              border: error ? Border.all(color: AppColors.error, width: 1.2) : null,
            ),
          );
        }),
      ),
    );
  }
}

/// Numeric keypad matching modern banking apps.
class PinKeypad extends StatelessWidget {
  final ValueChanged<String> onDigit;
  final VoidCallback onBackspace;
  final bool enabled;

  const PinKeypad({
    super.key,
    required this.onDigit,
    required this.onBackspace,
    this.enabled = true,
  });

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final keyColor = dark ? AppColors.darkTextPrimary : AppColors.textPrimary;

    Widget key(String label, {bool icon = false, IconData? iconData}) {
      return InkWell(
        onTap: enabled ? () => (icon ? onBackspace() : onDigit(label)) : null,
        borderRadius: BorderRadius.circular(56),
        child: Container(
          width: 72,
          height: 64,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(56),
            color: Colors.transparent,
          ),
          child: icon
              ? Icon(iconData, size: 26, color: keyColor)
              : Text(
                  label,
                  style: TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.w600,
                    color: keyColor,
                  ),
                ),
        ),
      );
    }

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (final row in const [
          ['1', '2', '3'],
          ['4', '5', '6'],
          ['7', '8', '9'],
        ])
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [for (final k in row) key(k)],
          ),
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(width: 72, height: 64),
            key('0'),
            key('', icon: true, iconData: Icons.backspace_outlined),
          ],
        ),
      ],
    );
  }
}