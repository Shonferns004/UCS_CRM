import 'package:flutter/material.dart';

import '../theme.dart';

/// A bento card matching the web panel's `.card` look: tinted gradient, colored
/// border, rounded corners, optional tap.
class DashboardCard extends StatelessWidget {
  final Widget child;
  final Color borderColor;
  final List<Color>? gradient;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;

  const DashboardCard({
    super.key,
    required this.child,
    this.borderColor = AppColors.line,
    this.gradient,
    this.padding = const EdgeInsets.all(12),
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final spec = ThemeServiceSpec.of(context);
    final grad = gradient ??
        [spec.paper, spec.paper];
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Ink(
          padding: padding,
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: grad,
            ),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: borderColor, width: 1.5),
          ),
          child: child,
        ),
      ),
    );
  }
}

/// Segmented pill toggle (the web's small inline switch). `options` is a list
/// of (value, label) pairs; `selected` is the active value.
///
/// With `expand: true` (default) it fills the available width (web's `flex:1`
/// card toggles). With `expand: false` it sizes to its labels — for use in a
/// header `trailing` slot or any unbounded-width context.
class TogglePills extends StatelessWidget {
  final List<(String, String)> options;
  final String selected;
  final ValueChanged<String> onChanged;
  final Color? activeColor;
  final bool expand;

  const TogglePills({
    super.key,
    required this.options,
    required this.selected,
    required this.onChanged,
    this.activeColor,
    this.expand = true,
  });

  @override
  Widget build(BuildContext context) {
    final spec = ThemeServiceSpec.of(context);
    final active = activeColor ?? spec.sage;

    Widget pill((String, String) opt) {
      final (value, label) = opt;
      final selected2 = selected == value;
      return GestureDetector(
        onTap: () => onChanged(value),
        child: Container(
          padding: expand
              ? const EdgeInsets.symmetric(vertical: 4, horizontal: 6)
              : const EdgeInsets.symmetric(vertical: 4, horizontal: 10),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: selected2 ? active : Colors.transparent,
            borderRadius: BorderRadius.circular(5),
          ),
          child: FittedBox(
            fit: BoxFit.scaleDown,
            child: Text(
              label,
              maxLines: 1,
              style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w600,
                color: selected2 ? Colors.white : spec.inkSoft,
              ),
            ),
          ),
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.all(2),
      decoration: BoxDecoration(
        color: spec.sand,
        borderRadius: BorderRadius.circular(7),
      ),
      child: Row(
        mainAxisSize: expand ? MainAxisSize.max : MainAxisSize.min,
        children: [
          for (final opt in options)
            expand ? Expanded(child: pill(opt)) : pill(opt),
        ],
      ),
    );
  }
}

/// Card header: icon + label + optional trailing widget (e.g. a toggle).
class CardHeader extends StatelessWidget {
  final IconData icon;
  final Color iconColor;
  final String label;
  final Widget? trailing;

  const CardHeader({
    super.key,
    required this.icon,
    required this.iconColor,
    required this.label,
    this.trailing,
  });

  @override
  Widget build(BuildContext context) {
    final spec = ThemeServiceSpec.of(context);
    return Row(
      children: [
        Icon(icon, size: 16, color: iconColor),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            label,
            style: TextStyle(
              fontSize: 12,
              color: spec.inkSoft,
              fontWeight: FontWeight.w500,
            ),
          ),
        ),
        if (trailing != null) trailing!,
      ],
    );
  }
}

/// A small dot used for "slice of the total" lines (High Tier, etc.).
class DotLine extends StatelessWidget {
  final Color color;
  final String text;
  const DotLine({super.key, required this.color, required this.text});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 6,
          height: 6,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 6),
        Expanded(
          child: Text(
            text,
            style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700),
          ),
        ),
      ],
    );
  }
}

/// Lightweight InheritedWidget so dashboard widgets can read the active
/// [FroThemeSpec] without wiring `ThemeService` into every constructor.
class ThemeServiceSpec extends InheritedWidget {
  final FroThemeSpec spec;
  const ThemeServiceSpec({
    super.key,
    required this.spec,
    required super.child,
  });

  static FroThemeSpec of(BuildContext context) {
    final w = context
        .dependOnInheritedWidgetOfExactType<ThemeServiceSpec>();
    return w?.spec ?? skyTheme;
  }

  @override
  bool updateShouldNotify(ThemeServiceSpec oldWidget) =>
      oldWidget.spec != spec;
}
