import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../channel.dart';
import '../core/theme/app_colors.dart';
import '../core/widgets/app_widgets.dart';

/// Reusable allowlist picker — used by the setup wizard (Screen 04) and by
/// Manage Allowed Apps (Screen 09). Handles search + filter chips + tiles.
class AppsPicker extends StatefulWidget {
  final Future<List<InstalledApp>> future;
  final Set<String> selected;
  final Set<String> locked; // cannot be disabled
  final ValueChanged<String> onToggle;
  final ValueChanged<Set<String>> onBulkChange;
  final String? headerNote;

  const AppsPicker({
    super.key,
    required this.future,
    required this.selected,
    required this.onToggle,
    required this.onBulkChange,
    this.locked = const {},
    this.headerNote,
  });

  @override
  State<AppsPicker> createState() => _AppsPickerState();
}

enum _Filter { all, system, user }

class _AppsPickerState extends State<AppsPicker> {
  String _query = '';
  _Filter _filter = _Filter.all;
  late Future<List<InstalledApp>> _future;

  @override
  void initState() {
    super.initState();
    _future = widget.future;
  }

  @override
  void didUpdateWidget(covariant AppsPicker oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.future != widget.future) _future = widget.future;
  }

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final secondaryText = dark ? AppColors.darkTextSecondary : AppColors.textSecondary;

    return Column(
      children: [
        if (widget.headerNote != null) ...[
          Text(
            widget.headerNote!,
            style: TextStyle(fontSize: 14, height: 1.5, color: secondaryText),
          ),
          const SizedBox(height: 16),
        ],
        TextField(
          key: const ValueKey('appSearch'),
          decoration: InputDecoration(
            hintText: 'Search apps...',
            prefixIcon: SizedBox(
              width: 46,
              height: 46,
              child: Icon(LucideIcons.search, size: 20,
                  color: dark ? AppColors.darkTextTertiary : AppColors.textTertiary),
            ),
            suffixIcon: _query.isNotEmpty
                ? IconButton(
                    tooltip: 'Clear',
                    icon: const Icon(LucideIcons.x, size: 18),
                    onPressed: () => setState(() => _query = ''),
                  )
                : null,
          ),
          onChanged: (v) => setState(() => _query = v.toLowerCase()),
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            _Chip.filter(label: 'All', selected: _filter == _Filter.all,
                onTap: () => setState(() => _filter = _Filter.all)),
            const SizedBox(width: 8),
            _Chip.filter(label: 'System', selected: _filter == _Filter.system,
                onTap: () => setState(() => _filter = _Filter.system)),
            const SizedBox(width: 8),
            _Chip.filter(label: 'User', selected: _filter == _Filter.user,
                onTap: () => setState(() => _filter = _Filter.user)),
            const Spacer(),
            Text(
              '${widget.selected.length} allowed',
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: Theme.of(context).colorScheme.primary,
              ),
            ),
          ],
        ),
        const SizedBox(height: 6),
        Expanded(
          child: FutureBuilder<List<InstalledApp>>(
            future: _future,
            builder: (context, snap) {
              if (snap.connectionState == ConnectionState.waiting) {
                return const BusyScreen(message: 'Loading apps…');
              }
              if (snap.hasError) {
                return AppEmptyState(
                  icon: LucideIcons.alertTriangle,
                  title: 'Couldn\'t load apps',
                  subtitle: snap.error.toString(),
                );
              }
              final apps = snap.data ?? const <InstalledApp>[];
              final filtered = apps.where((a) {
                final matchQuery = _query.isEmpty || a.label.toLowerCase().contains(_query);
                final matchFilter = switch (_filter) {
                  _Filter.all => true,
                  _Filter.system => a.isSystem,
                  _Filter.user => !a.isSystem,
                };
                return matchQuery && matchFilter;
              }).toList();

              if (filtered.isEmpty) {
                return AppEmptyState(
                  icon: LucideIcons.searchX,
                  title: 'No apps found',
                  subtitle: _query.isNotEmpty ? 'Try a different search.' : null,
                );
              }

              return ListView.builder(
                key: const ValueKey('appsList'),
                itemCount: filtered.length,
                itemBuilder: (context, i) => _AppRow(
                  app: filtered[i],
                  allowed: widget.selected.contains(filtered[i].package),
                  locked: widget.locked.contains(filtered[i].package),
                  onToggle: () => widget.onToggle(filtered[i].package),
                  onToggleRequest: () async => _toggle(filtered[i]),
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  Future<void> _toggle(InstalledApp app) async {
    final isNowAllowed = widget.selected.contains(app.package);
    // Safety: removing a critical system app requires confirmation.
    if (isNowAllowed && app.isSystem && !widget.locked.contains(app.package)) {
      final ok = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          icon: const Icon(LucideIcons.alertTriangle, color: AppColors.warning, size: 32),
          title: Text('Block ${app.label}?'),
          content: Text(
            '${app.label} is a system app. Blocking it may affect your device. '
            'Critical apps (launcher, settings, phone) can\'t be removed.',
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
            FilledButton(
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.error,
                foregroundColor: Colors.white,
                minimumSize: const Size(0, 44),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Block Anyway'),
            ),
          ],
        ),
      );
      if (ok != true) return;
      widget.onToggle(app.package);
    } else {
      widget.onToggle(app.package);
    }
  }
}

class _Chip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _Chip.filter({required this.label, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? AppColors.primary : Colors.transparent,
      borderRadius: AppRadii.button,
      child: InkWell(
        onTap: onTap,
        borderRadius: AppRadii.button,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(
            borderRadius: AppRadii.button,
            border: Border.all(color: selected ? AppColors.primary : (Theme.of(context).brightness == Brightness.dark ? AppColors.darkBorder : AppColors.border)),
          ),
          child: Text(
            label,
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: selected ? Colors.white : (Theme.of(context).brightness == Brightness.dark ? AppColors.darkTextSecondary : AppColors.textSecondary),
            ),
          ),
        ),
      ),
    );
  }
}

class _AppRow extends StatelessWidget {
  final InstalledApp app;
  final bool allowed;
  final bool locked;
  final VoidCallback onToggle;
  final VoidCallback onToggleRequest;

  const _AppRow({
    required this.app,
    required this.allowed,
    required this.locked,
    required this.onToggle,
    required this.onToggleRequest,
  });

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Container(
        padding: const EdgeInsets.fromLTRB(12, 10, 8, 10),
        decoration: BoxDecoration(
          color: dark ? AppColors.darkSurface : Colors.white,
          borderRadius: AppRadii.card,
          border: Border.all(color: dark ? AppColors.darkBorder : AppColors.border),
        ),
        child: Row(
          children: [
            AppIcon(app: app, size: 44),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    app.label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    app.isSystem ? 'System app' : 'Installed app',
                    style: TextStyle(
                      fontSize: 12.5,
                      color: dark ? AppColors.darkTextTertiary : AppColors.textTertiary,
                    ),
                  ),
                ],
              ),
            ),
            if (locked)
              Tooltip(
                message: 'Always allowed — required by the device',
                child: Container(
                  padding: const EdgeInsets.all(6),
                  decoration: BoxDecoration(
                    color: AppColors.primarySoft,
                    borderRadius: AppRadii.small,
                  ),
                  child: const Icon(LucideIcons.lock, size: 16, color: AppColors.primary),
                ),
              )
            else
              Switch(
                value: allowed,
                onChanged: (_) => onToggleRequest(),
                activeTrackColor: AppColors.primary,
              ),
          ],
        ),
      ),
    );
  }
}