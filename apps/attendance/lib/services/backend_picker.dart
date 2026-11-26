import 'package:flutter/material.dart';
import '../theme/app_palette.dart';
import '../widgets/app_toast.dart';
import '../widgets/ui_motion.dart';

import 'backend_switcher.dart';

/// Small tappable circular button that opens the backend picker.
/// Tap to switch between local dev server / emulator / cloudflared / production.
class BackendPicker extends StatelessWidget {
  const BackendPicker({super.key, this.dark = false});

  /// Set true on dark backgrounds.
  final bool dark;

  @override
  Widget build(BuildContext context) {
    final isCustom = BackendSwitcher.currentId == 'custom';
    return Padding(
      padding: const EdgeInsets.only(top: 14),
      child: Center(
        child: Tooltip(
          message: 'Backend: ${BackendSwitcher.baseUrl}\nTap to change',
          child: Semantics(
            button: true,
            label: 'Change backend',
            child: Container(
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                boxShadow: dark ? null : AppPalette.lift(0.7),
              ),
              child: Material(
                color: dark
                    ? Colors.white.withValues(alpha: 0.14)
                    : AppPalette.white,
                shape: const CircleBorder(),
                clipBehavior: Clip.antiAlias,
                child: InkWell(
                  onTap: () => BackendPicker.showPicker(context),
                  child: SizedBox(
                    width: 46,
                    height: 46,
                    child: Stack(
                      alignment: Alignment.center,
                      children: [
                        Icon(
                          Icons.dns_rounded,
                          size: 21,
                          color: dark ? Colors.white : AppPalette.ocean,
                        ),
                        Positioned(
                          right: 8,
                          bottom: 8,
                          child: Container(
                            width: 9,
                            height: 9,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: isCustom
                                  ? const Color(0xFFD97706)
                                  : AppPalette.aqua,
                              border: Border.all(
                                color: dark
                                    ? AppPalette.oceanDeep
                                    : AppPalette.white,
                                width: 1.5,
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  /// Opens the backend picker sheet. Also used by the login logo long-press.
  static Future<void> showPicker(BuildContext context) async {
    final current = BackendSwitcher.currentId;
    final picked = await showSpringSheet<String>(
      context: context,
      builder: (ctx) => _BackendSheet(currentId: current),
    );

    if (picked == null || !context.mounted) return;

    String target;
    if (picked == '__custom__') {
      final ctrl = TextEditingController(text: BackendSwitcher.baseUrl);
      final custom = await showSpringDialog<String>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Backend URL'),
          content: TextField(
            controller: ctrl,
            autofocus: true,
            keyboardType: TextInputType.url,
            decoration: const InputDecoration(
              hintText: 'http://192.168.1.152:5000',
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(ctx, ctrl.text.trim()),
              child: const Text('Save'),
            ),
          ],
        ),
      );
      if (custom == null || custom.isEmpty) return;
      target = custom;
    } else {
      target = picked;
    }

    await BackendSwitcher.set(target);
    if (!context.mounted) return;
    AppToast.info('Backend set to ${BackendSwitcher.baseUrl}');
  }
}

class _BackendSheet extends StatelessWidget {
  final String currentId;

  const _BackendSheet({required this.currentId});

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return SafeArea(
      top: false,
      child: Container(
        decoration: const BoxDecoration(
          color: AppPalette.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(32)),
        ),
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: AppPalette.iceDeep,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 18),
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Select backend',
                    style: textTheme.headlineSmall?.copyWith(
                      color: AppPalette.ink,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                Material(
                  color: AppPalette.iceSoft,
                  shape: const CircleBorder(),
                  clipBehavior: Clip.antiAlias,
                  child: InkWell(
                    onTap: () => Navigator.pop(context),
                    child: const SizedBox(
                      width: 34,
                      height: 34,
                      child: Icon(
                        Icons.close_rounded,
                        size: 18,
                        color: AppPalette.muted,
                      ),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              'Choose which server the app talks to.',
              style: TextStyle(fontSize: 12.5, color: AppPalette.muted),
            ),
            const SizedBox(height: 18),
            for (final option in BackendSwitcher.options)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: _BackendTile(
                  selected: currentId == option['id'],
                  title: _titleOf(option['label'] ?? ''),
                  subtitle: _noteOf(option['label'] ?? ''),
                  url: option['url'] ?? '',
                  icon: Icons.cloud_outlined,
                  onTap: () => Navigator.pop(context, option['id']),
                ),
              ),
            _BackendTile(
              selected: currentId == 'custom',
              title: 'Custom URL',
              subtitle: 'Point the app at any server',
              url: currentId == 'custom' ? BackendSwitcher.baseUrl : '',
              icon: Icons.link_rounded,
              onTap: () => Navigator.pop(context, '__custom__'),
            ),
          ],
        ),
      ),
    );
  }

  static String _titleOf(String label) {
    final open = label.indexOf('(');
    return (open >= 0 ? label.substring(0, open) : label).trim();
  }

  static String _noteOf(String label) {
    final open = label.indexOf('(');
    if (open < 0) return '';
    return label.substring(open + 1).replaceAll(')', '').trim();
  }
}

class _BackendTile extends StatelessWidget {
  final bool selected;
  final String title;
  final String subtitle;
  final String url;
  final IconData icon;
  final VoidCallback onTap;

  const _BackendTile({
    required this.selected,
    required this.title,
    required this.subtitle,
    required this.url,
    required this.icon,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final radius = BorderRadius.circular(20);
    return Material(
      color: selected ? AppPalette.aquaSoft : AppPalette.iceSoft,
      borderRadius: radius,
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        borderRadius: radius,
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: selected ? AppPalette.aqua : AppPalette.white,
                  borderRadius: BorderRadius.circular(13),
                ),
                child: Icon(
                  icon,
                  size: 20,
                  color: selected ? AppPalette.white : AppPalette.ocean,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: TextStyle(
                        fontSize: 14.5,
                        fontWeight: FontWeight.w700,
                        color: AppPalette.ink,
                      ),
                    ),
                    if (subtitle.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Text(
                          subtitle,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 11.5,
                            color: AppPalette.muted,
                          ),
                        ),
                      ),
                    if (url.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Text(
                          url,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 11,
                            color: AppPalette.oceanSoft,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Icon(
                selected
                    ? Icons.check_circle_rounded
                    : Icons.radio_button_unchecked_rounded,
                size: 21,
                color: selected ? AppPalette.aquaDeep : AppPalette.iceDeep,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
