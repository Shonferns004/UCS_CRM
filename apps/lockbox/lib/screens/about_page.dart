import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../channel.dart';
import '../core/theme/app_colors.dart';
import '../core/widgets/app_widgets.dart';

class AboutPage extends StatefulWidget {
  const AboutPage({super.key});

  @override
  State<AboutPage> createState() => _AboutPageState();
}

class _AboutPageState extends State<AboutPage> {
  String _version = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final s = await LockBoxChannel.getProtectionStatus();
    if (!mounted) return;
    setState(() => _version = s.appVersion);
  }

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final secondaryText = dark ? AppColors.darkTextSecondary : AppColors.textSecondary;

    return Scaffold(
      appBar: AppBar(title: const Text('About')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
          children: [
            Center(
              child: Container(
                width: 88,
                height: 88,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [AppColors.primary, AppColors.primaryDark],
                  ),
                  borderRadius: BorderRadius.circular(24),
                ),
                child: const Icon(LucideIcons.shieldCheck, size: 40, color: Colors.white),
              ),
            ),
            const SizedBox(height: 14),
            const Center(
              child: Text(
                'LockBox',
                style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
              ),
            ),
            const SizedBox(height: 4),
            Center(
              child: Text(
                _version.isEmpty ? 'Version 1.0.0' : 'Version $_version',
                style: TextStyle(fontSize: 13.5, color: secondaryText),
              ),
            ),
            const SizedBox(height: 22),
            const SectionHeader('HOW IT WORKS'),
            AppCard(
              child: Text(
                'LockBox uses an Accessibility Service to detect when a '
                'blocked app opens. It instantly shows a full-screen block '
                'until the app is closed. LockBox itself is not blocked '
                '(essential apps like launcher, settings and phone are '
                'always allowed), and a dialer secret code lets you back in '
                'even while hidden.',
                style: TextStyle(fontSize: 14, height: 1.55, color: secondaryText),
              ),
            ),
            const SizedBox(height: 18),
            const SectionHeader('LIMITATIONS'),
            AppCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _Limitation(
                    icon: LucideIcons.package,
                    text:
                        'Without Device Admin, LockBox cannot stop apps being '
                        'uninstalled or force-stopped, or protect the '
                        'Accessibility settings screen.',
                  ),
                  const SizedBox(height: 12),
                  _Limitation(
                    icon: LucideIcons.power,
                    text:
                        'Blocked apps can be bypassed during a reboot if the '
                        'Accessibility Service is disabled first.',
                  ),
                  const SizedBox(height: 12),
                  _Limitation(
                    icon: LucideIcons.lock,
                    text:
                        'Blocking is active only while the Accessibility '
                        'Service is enabled and protection is on.',
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Limitation extends StatelessWidget {
  final IconData icon;
  final String text;

  const _Limitation({required this.icon, required this.text});

  @override
  Widget build(BuildContext context) {
    final secondaryText = Theme.of(context).brightness == Brightness.dark
        ? AppColors.darkTextSecondary
        : AppColors.textSecondary;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 20, color: AppColors.warning),
        const SizedBox(width: 12),
        Expanded(
          child: Text(
            text,
            style: TextStyle(fontSize: 13.5, height: 1.5, color: secondaryText),
          ),
        ),
      ],
    );
  }
}