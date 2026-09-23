import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../theme/app_colors.dart';
import '../../channel.dart';

/// App icon; falls back to an initial-letter badge when no icon bitmap arrived.
class AppIcon extends StatelessWidget {
  final InstalledApp app;
  final double size;

  const AppIcon({super.key, required this.app, this.size = 40});

  @override
  Widget build(BuildContext context) {
    final provider = LockBoxChannel.iconImage(app.iconBase64);
    final container = Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(10),
        color: AppColors.surfaceSoft,
      ),
      clipBehavior: Clip.antiAlias,
      child: provider != null
          ? Image(image: provider, width: size, height: size, fit: BoxFit.contain)
          : _LetterBadge(label: app.label, size: size),
    );
    if (!app.isSystem) return container;
    return Badge(
      smallSize: 12,
      backgroundColor: AppColors.surfaceSoft,
      child: container,
    );
  }
}

class _LetterBadge extends StatelessWidget {
  final String label;
  final double size;
  const _LetterBadge({required this.label, required this.size});

  @override
  Widget build(BuildContext context) {
    final letter = (label.isEmpty ? '?' : label.characters.first)
        .toUpperCase();
    return Center(
      child: Text(
        letter,
        style: TextStyle(
          fontSize: size * 0.42,
          fontWeight: FontWeight.w700,
          color: Theme.of(context).colorScheme.primary,
        ),
      ),
    );
  }
}

/// Card with the standard radius/border/surface.
class AppCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;
  final Color? color;

  const AppCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.onTap,
    this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      color: color,
      shape: RoundedRectangleBorder(
        borderRadius: AppRadii.card,
        side: BorderSide(
          color: Theme.of(context).brightness == Brightness.dark
              ? AppColors.darkBorder
              : AppColors.border,
        ),
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: AppRadii.card,
        child: Padding(padding: padding, child: child),
      ),
    );
  }
}

/// Small colored pill for labels/states.
class StatusPill extends StatelessWidget {
  final String label;
  final IconData icon;
  final Color color;

  const StatusPill({
    super.key,
    required this.label,
    required this.icon,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    final soft = color.withValues(alpha: 0.12);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: soft,
        borderRadius: AppRadii.button,
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 15, color: color),
          const SizedBox(width: 6),
          Text(
            label,
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}

/// Section header label ("SECURITY", "ALLOWED APPS", …).
class SectionHeader extends StatelessWidget {
  final String title;
  final EdgeInsets padding;

  const SectionHeader(this.title, {super.key, this.padding = const EdgeInsets.fromLTRB(4, 8, 4, 10)});

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: padding,
      child: Text(
        title,
        style: TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.8,
          color: scheme.primary,
        ),
      ),
    );
  }
}

/// Full-height centered empty state.
class AppEmptyState extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? subtitle;

  const AppEmptyState({
    super.key,
    required this.icon,
    required this.title,
    this.subtitle,
  });

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 56, color: scheme.primary.withValues(alpha: 0.4)),
            const SizedBox(height: 16),
            Text(title, style: Theme.of(context).textTheme.titleMedium),
            if (subtitle != null) ...[
              const SizedBox(height: 8),
              Text(
                subtitle!,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// SwitchListTile with consistent styling + semantic label.
class AppSwitchTile extends StatelessWidget {
  final String title;
  final String? subtitle;
  final bool value;
  final ValueChanged<bool> onChanged;
  final IconData icon;
  final bool enabled;

  const AppSwitchTile({
    super.key,
    required this.title,
    required this.value,
    required this.onChanged,
    required this.icon,
    this.subtitle,
    this.enabled = true,
  });

  @override
  Widget build(BuildContext context) {
    return Opacity(
      opacity: enabled ? 1 : 0.55,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
        decoration: BoxDecoration(
          borderRadius: AppRadii.card,
          color: Theme.of(context).brightness == Brightness.dark
              ? AppColors.darkSurface
              : Colors.white,
          border: Border.all(
            color: Theme.of(context).brightness == Brightness.dark
                ? AppColors.darkBorder
                : AppColors.border,
          ),
        ),
        child: SwitchListTile(
          contentPadding: EdgeInsets.zero,
          secondary: Icon(icon),
          title: Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
          subtitle: subtitle != null ? Text(subtitle!) : null,
          value: value,
          onChanged: enabled ? onChanged : null,
          activeTrackColor: AppColors.primary,
        ),
      ),
    );
  }
}

/// Tappable row with trailing chevron (used on Status + Settings).
class ChevronTile extends StatelessWidget {
  final String title;
  final String? subtitle;
  final IconData icon;
  final IconData? trailingIcon;
  final VoidCallback onTap;
  final Widget? trailing;

  const ChevronTile({
    super.key,
    required this.title,
    required this.icon,
    required this.onTap,
    this.subtitle,
    this.trailingIcon = LucideIcons.chevronRight,
    this.trailing,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return InkWell(
      onTap: onTap,
      borderRadius: AppRadii.card,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          borderRadius: AppRadii.card,
          color: theme.brightness == Brightness.dark ? AppColors.darkSurface : Colors.white,
          border: Border.all(
            color: theme.brightness == Brightness.dark ? AppColors.darkBorder : AppColors.border,
          ),
        ),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: AppColors.primarySoft,
                borderRadius: AppRadii.small,
              ),
              child: Icon(icon, size: 20, color: AppColors.primary),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
                  if (subtitle != null) ...[
                    const SizedBox(height: 3),
                    Text(
                      subtitle!,
                      style: TextStyle(
                        fontSize: 13,
                        color: theme.brightness == Brightness.dark
                            ? AppColors.darkTextSecondary
                            : AppColors.textSecondary,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            trailing ?? Icon(
              trailingIcon ?? LucideIcons.chevronRight,
              size: 20,
              color: theme.brightness == Brightness.dark
                  ? AppColors.darkTextTertiary
                  : AppColors.textTertiary,
            ),
          ],
        ),
      ),
    );
  }
}

/// Full-screen busy panel while waiting on a platform call. Deliberately not
/// a Scaffold so it can be embedded anywhere (Expanded slots, SafeArea, …)
/// without nesting overlays.
class BusyScreen extends StatelessWidget {
  final String message;
  const BusyScreen({super.key, this.message = 'Please wait…'});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(
              width: 28,
              height: 28,
              child: CircularProgressIndicator(strokeWidth: 2.5),
            ),
            const SizedBox(height: 16),
            Text(
              message,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium,
            ),
          ],
        ),
      ),
    );
  }
}

/// Helpers for a consistent loading hiccup.
class FutureGate<T> extends StatelessWidget {
  final Future<T> future;
  final Widget Function(BuildContext, T) builder;
  final Widget? errorWidget;

  const FutureGate({
    super.key,
    required this.future,
    required this.builder,
    this.errorWidget,
  });

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<T>(
      future: future,
      builder: (context, snap) {
        if (snap.connectionState == ConnectionState.waiting) {
          return const BusyScreen();
        }
        if (snap.hasError) {
          return errorWidget ??
              AppEmptyState(
                icon: LucideIcons.alertTriangle,
                title: 'Something went wrong',
                subtitle: snap.error.toString(),
              );
        }
        if (snap.hasData) return builder(context, snap.data as T);
        return errorWidget ?? const BusyScreen();
      },
    );
  }
}