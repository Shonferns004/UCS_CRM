import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../channel.dart';
import '../core/theme/app_colors.dart';
import 'setup_wizard.dart';

/// Design Screen 03 — Accessibility permission. Never assumes the permission
/// was granted; re-checks on resume and via the "I've enabled it" button.
class AccessibilityPage extends StatefulWidget {
  final WizardModel model;
  final VoidCallback onNext;

  const AccessibilityPage({super.key, required this.model, required this.onNext});

  @override
  State<AccessibilityPage> createState() => _AccessibilityPageState();
}

class _AccessibilityPageState extends State<AccessibilityPage> with WidgetsBindingObserver {
  bool _checking = false;
  bool _enabled = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // User returns from Settings → re-check immediately (design requirement).
    if (state == AppLifecycleState.resumed && _enabled == false) {
      _check();
    }
  }

  Future<void> _check() async {
    if (_checking) return;
    setState(() => _checking = true);
    final on = await LockBoxChannel.isAccessibilityEnabled();
    if (!mounted) return;
    setState(() {
      _enabled = on;
      _checking = false;
      widget.model.accessibilityReady = on;
    });
    if (on) {
      // Small delay so the state feels deliberate, then advance automatically.
      Future.delayed(const Duration(milliseconds: 450), () {
        if (mounted && !_enabled) return;
        widget.onNext();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final primaryText = dark ? AppColors.darkTextPrimary : AppColors.textPrimary;
    final secondaryText = dark ? AppColors.darkTextSecondary : AppColors.textSecondary;

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 32),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SizedBox(height: 8),
          Center(
            child: Container(
              width: 76,
              height: 76,
              decoration: BoxDecoration(
                color: AppColors.primary.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(22),
              ),
              child: const Icon(LucideIcons.accessibility, size: 34, color: AppColors.primary),
            ),
          ),
          const SizedBox(height: 20),
          Text(
            'Enable Accessibility Service',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: primaryText),
          ),
          const SizedBox(height: 10),
          Text(
            'LockBox needs Accessibility access to detect which app is in the '
            'foreground. It only reads the active window\'s package name — '
            'never app content or logs.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 14, height: 1.5, color: secondaryText),
          ),
          const SizedBox(height: 26),
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: dark ? AppColors.darkSurface : Colors.white,
              borderRadius: AppRadii.card,
              border: Border.all(color: dark ? AppColors.darkBorder : AppColors.border),
            ),
            child: Column(
              children: [
                _StepTile(n: 1, text: 'Tap Open Settings'),
                const SizedBox(height: 14),
                _StepTile(n: 2, text: 'Find LockBox'),
                const SizedBox(height: 14),
                _StepTile(n: 3, text: 'Turn on the service'),
              ],
            ),
          ),
          const SizedBox(height: 16),
          if (_enabled)
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: AppColors.successSoft,
                borderRadius: AppRadii.button,
              ),
              child: Row(
                children: const [
                  Icon(LucideIcons.checkCircle2, color: AppColors.success, size: 20),
                  SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'Accessibility service enabled',
                      style: TextStyle(color: AppColors.success, fontWeight: FontWeight.w600),
                    ),
                  ),
                ],
              ),
            )
          else if (_checking)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 10),
              child: Center(child: CircularProgressIndicator(strokeWidth: 2.5)),
            ),
          if (!_enabled && !_checking) const SizedBox(height: 16),
          if (_enabled) const SizedBox(height: 6),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: _checking ? null : () {
                _checking = false;
                LockBoxChannel.openAccessibilitySettings();
              },
              icon: const Icon(LucideIcons.settings, size: 20),
              label: const Text('Open Settings'),
            ),
          ),
          const SizedBox(height: 12),
          if (_enabled)
            OutlinedButton(onPressed: widget.onNext, child: const Text('Continue'))
          else
            OutlinedButton.icon(
              onPressed: _checking ? null : _check,
              icon: _checking
                  ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(LucideIcons.refreshCw, size: 20),
              label: const Text("I've enabled it"),
            ),
          if (!_enabled && !_checking) ...[
            const SizedBox(height: 14),
            const Text(
              'Accessibility service is still disabled.',
              textAlign: TextAlign.center,
              style: TextStyle(color: AppColors.warning, fontSize: 13, fontWeight: FontWeight.w600),
            ),
          ],
        ],
      ),
    );
  }
}

class _StepTile extends StatelessWidget {
  final int n;
  final String text;

  const _StepTile({required this.n, required this.text});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 26,
          height: 26,
          alignment: Alignment.center,
          decoration: const BoxDecoration(color: AppColors.primary, shape: BoxShape.circle),
          child: Text('$n', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 13)),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Text(text, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
        ),
      ],
    );
  }
}