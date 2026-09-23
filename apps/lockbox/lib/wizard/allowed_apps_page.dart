import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../channel.dart';
import '../core/theme/app_colors.dart';
import '../screens/apps_picker.dart';
import 'setup_wizard.dart';

/// Design Screen 04 — Select Allowed Apps (Step 2 of 3).
class AllowedAppsPage extends StatefulWidget {
  final WizardModel model;
  final VoidCallback onNext;

  const AllowedAppsPage({super.key, required this.model, required this.onNext});

  @override
  State<AllowedAppsPage> createState() => _AllowedAppsPageState();
}

class _AllowedAppsPageState extends State<AllowedAppsPage> {
  late Future<List<InstalledApp>> _apps;
  Future<Set<String>>? _essentials;

  @override
  void initState() {
    super.initState();
    _apps = widget.model.ensureApps();
    _essentials = LockBoxChannel.getEssentialPackages();
  }

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final secondaryText = dark ? AppColors.darkTextSecondary : AppColors.textSecondary;

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Select Allowed Apps',
            style: TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.w800,
              color: dark ? AppColors.darkTextPrimary : AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            'Choose the apps you want to keep accessible. All other apps will be blocked.',
            style: TextStyle(fontSize: 14, height: 1.5, color: secondaryText),
          ),
          const SizedBox(height: 14),
          if (widget.model.loadFailed) ...[
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.warningSoft,
                borderRadius: AppRadii.button,
              ),
              child: Row(
                children: [
                  const Icon(LucideIcons.alertTriangle,
                      color: AppColors.warning, size: 20),
                  const SizedBox(width: 10),
                  const Expanded(
                    child: Text(
                      'App list could not be loaded. You can continue now — '
                      'only essential apps stay allowed.',
                      style: TextStyle(fontSize: 13.5, height: 1.4),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
          ],
          Expanded(
            child: FutureBuilder<Set<String>>(
              future: _essentials,
              builder: (context, snap) {
                final locked = snap.data ?? const <String>{};
                return AppsPicker(
                  future: _apps,
                  locked: locked,
                  selected: widget.model.selected,
                  onToggle: (pkg) => setState(() {
                    if (locked.contains(pkg)) return;
                    widget.model.selected.contains(pkg)
                        ? widget.model.selected.remove(pkg)
                        : widget.model.selected.add(pkg);
                  }),
                  onBulkChange: (next) => setState(() {
                    widget.model.selected
                      ..clear()
                      ..addAll(next);
                  }),
                );
              },
            ),
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: (widget.model.selected.isEmpty && !widget.model.loadFailed)
                  ? null
                  : () async {
                      // Persist now so a later crash never loses the choice.
                      try {
                        await LockBoxChannel.saveAllowlist(widget.model.selected);
                      } catch (_) {
                        if (!context.mounted) return;
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content: Text('Couldn\'t save apps. Try again.'),
                          ),
                        );
                        return;
                      }
                      if (!context.mounted) return;
                      widget.onNext();
                    },
              child: const Text('Next'),
            ),
          ),
        ],
      ),
    );
  }
}