import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../channel.dart';
import '../core/theme/app_colors.dart';
import '../core/widgets/app_widgets.dart';

/// Design Screen 11 — Recovery Notification. Quiet, always-visible alert that
/// reopens LockBox. Its settings toggle jumps to the app notification settings.
class RecoveryNotificationPage extends StatefulWidget {
  const RecoveryNotificationPage({super.key});

  @override
  State<RecoveryNotificationPage> createState() => _RecoveryNotificationPageState();
}

class _RecoveryNotificationPageState extends State<RecoveryNotificationPage> {
  bool? _enabled;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final s = await LockBoxChannel.getProtectionStatus();
    if (!mounted) return;
    setState(() => _enabled = s.recoveryNotification);
  }

  Future<void> _toggle(bool on) async {
    setState(() => _busy = true);
    if (on) {
      await LockBoxChannel.enableRecoveryNotification();
    } else {
      await LockBoxChannel.disableRecoveryNotification();
    }
    if (!mounted) return;
    setState(() {
      _enabled = on;
      _busy = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final secondaryText = dark ? AppColors.darkTextSecondary : AppColors.textSecondary;

    return Scaffold(
      appBar: AppBar(title: const Text('Recovery Notification')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
          children: [
            Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                color: AppColors.primarySoft,
                borderRadius: AppRadii.card,
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(LucideIcons.bell, color: AppColors.primary, size: 28),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Text(
                      'When the icon is hidden, a quiet notification keeps a '
                      'tap of LockBox within reach — even after reboot.',
                      style: TextStyle(
                        fontSize: 14,
                        height: 1.5,
                        color: dark ? AppColors.darkTextPrimary : AppColors.textPrimary,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 18),
            _enabled == null
                ? const BusyScreen(message: 'Loading…')
                : Opacity(
                    opacity: _busy ? 0.55 : 1,
                    child: AppSwitchTile(
                      icon: _enabled! ? LucideIcons.bell : LucideIcons.bellOff,
                      title: 'Show recovery notification',
                      subtitle: 'A persistent, low-priority alert',
                      value: _enabled!,
                      onChanged: _toggle,
                    ),
                  ),
            const SizedBox(height: 24),
            const SectionHeader('NOTIFICATION PERMISSION'),
            AppCard(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'On Android 13+, notification permission must be granted '
                    'before the recovery notification can be shown.',
                    style: TextStyle(fontSize: 13.5, height: 1.5, color: secondaryText),
                  ),
                  const SizedBox(height: 14),
                  OutlinedButton.icon(
                    onPressed: () => LockBoxChannel.openNotificationSettings(),
                    icon: const Icon(LucideIcons.bellPlus, size: 20),
                    label: const Text('Open app settings'),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),
            const SectionHeader('WHAT IT LOOKS LIKE'),
            AppCard(
              color: dark ? AppColors.darkSurface : Colors.white,
              child: Row(
                children: [
                  Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      color: AppColors.primary,
                      borderRadius: AppRadii.small,
                    ),
                    child: const Icon(LucideIcons.shield, color: Colors.white, size: 22),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'LockBox is active',
                          style: TextStyle(fontWeight: FontWeight.w600),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          'Tap to open protected app settings',
                          style: TextStyle(
                            fontSize: 12.5,
                            color: secondaryText,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const Icon(LucideIcons.chevronRight, size: 18),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}