import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../channel.dart';
import '../core/theme/app_colors.dart';
import 'welcome_page.dart';
import 'accessibility_page.dart';
import 'allowed_apps_page.dart';
import 'setup_complete_page.dart';

/// Shared mutable state across wizard steps. Lazy-loads the app list so
/// navigating back/forward never refetches (state preserved between steps).
class WizardModel {
  final Set<String> selected = {};
  List<InstalledApp>? apps;
  bool accessibilityReady = false;

  /// True when the native app list could not be loaded. The wizard then
  /// warns the user and still lets them proceed (rather than getting stuck
  /// with an empty selection that disables "Next" forever).
  bool loadFailed = false;

  Future<List<InstalledApp>> ensureApps() async {
    if (apps != null) return apps!;
    try {
      final loaded = await LockBoxChannel.getInstalledApps();
      final essential = await LockBoxChannel.getEssentialPackages();
      apps = loaded;
      selected
        ..clear()
        ..addAll(loaded
            .where((a) => essential.contains(a.package))
            .map((a) => a.package));
    } catch (_) {
      loadFailed = true;
      apps = const [];
    }
    return apps!;
  }
}

/// Design Screen 02–05 — the guided setup flow.
class SetupWizard extends StatefulWidget {
  final VoidCallback onFinished;

  const SetupWizard({super.key, required this.onFinished});

  @override
  State<SetupWizard> createState() => _SetupWizardState();
}

class _SetupWizardState extends State<SetupWizard> with SingleTickerProviderStateMixin {
  final _model = WizardModel();
  late final PageController _page;
  int _index = 0;
  bool _finalizing = false;

  @override
  void initState() {
    super.initState();
    _page = PageController();
  }

  @override
  void dispose() {
    _page.dispose();
    super.dispose();
  }

  bool get _inSteps => _index >= 1; // welcome (0) has no step label

  void _go(int i) {
    _page.animateToPage(i,
        duration: const Duration(milliseconds: 300), curve: Curves.easeOutCubic);
  }

  Future<String?> _finalize(String pin) async {
    if (_finalizing) return null;
    setState(() => _finalizing = true);

    await LockBoxChannel.saveAllowlist(_model.selected);
    if (pin.isNotEmpty) await LockBoxChannel.setPin(pin);
    await LockBoxChannel.setSetupComplete(true);
    await LockBoxChannel.setLauncherVisible(false);

    if (!mounted) return 'Hiding the icon failed.';
    // Recoverable: icon still visible → warn instead of claiming success.
    final stillVisible = await LockBoxChannel.isLauncherVisible();
    return stillVisible ? 'Hiding the icon failed.' : null;
  }

  void _skipSetup() {
    // Confirmed skip → protection is left inactive; wizard reappears next open.
    widget.onFinished();
  }

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return PopScope(
      canPop: false,
      child: Scaffold(
        backgroundColor: dark ? AppColors.darkBg : AppColors.background,
        body: SafeArea(
          child: Column(
            children: [
              SizedBox(
                height: 56,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  child: Row(
                    children: [
                      if (_inSteps)
                        IconButton(
                          tooltip: 'Back',
                          onPressed: _index > 1 ? () => _go(_index - 1) : null,
                          icon: const Icon(LucideIcons.arrowLeft),
                        )
                      else
                        const SizedBox(width: 48),
                      Expanded(
                        child: _inSteps
                            ? Center(
                                child: Text(
                                  'Step $_index of 3',
                                  style: TextStyle(
                                    fontSize: 14,
                                    fontWeight: FontWeight.w600,
                                    color: dark
                                        ? AppColors.darkTextSecondary
                                        : AppColors.textSecondary,
                                  ),
                                ),
                              )
                            : const SizedBox(),
                      ),
                      if (_index == 0)
                        TextButton(
                          onPressed: () => _confirmSkip(),
                          child: const Text('Skip'),
                        )
                      else
                        const SizedBox(width: 48),
                    ],
                  ),
                ),
              ),
              if (_inSteps) _ProgressBar(current: _index - 1, total: 3),
              Expanded(
                child: PageView(
                  controller: _page,
                  physics: const NeverScrollableScrollPhysics(),
                  onPageChanged: (i) => setState(() => _index = i),
                  children: [
                    WelcomePage(onStart: () => _go(1)),
                    AccessibilityPage(
                      model: _model,
                      onNext: () => _go(2),
                    ),
                    AllowedAppsPage(model: _model, onNext: () => _go(3)),
                    SetupCompletePage(
                      onFinalize: _finalize,
                      onFinished: () => widget.onFinished(),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _confirmSkip() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        icon: Icon(LucideIcons.shieldAlert,
            color: AppColors.warning, size: 32),
        title: const Text('Skip setup?'),
        content: const Text(
          'LockBox will not protect anything until setup is finished. '
          'You can restart setup the next time you open the app.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Continue Setup')),
          FilledButton(
            style: _dangerButtonStyle(),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Skip Anyway'),
          ),
        ],
      ),
    );
    if (confirmed == true) _skipSetup();
  }
}

ButtonStyle _dangerButtonStyle() {
  return FilledButton.styleFrom(
    backgroundColor: AppColors.error,
    foregroundColor: Colors.white,
    minimumSize: const Size(0, 44),
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
  );
}

class _ProgressBar extends StatelessWidget {
  final int current;
  final int total;

  const _ProgressBar({required this.current, required this.total});

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final track = dark ? AppColors.darkBorder : AppColors.border;
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 14),
      child: Row(
        children: List.generate(total * 2 - 1, (i) {
          final isDot = i.isEven;
          final point = i ~/ 2;
          final done = point < current;
          final activeColor = done ? AppColors.primary : (dark ? AppColors.darkTextTertiary : AppColors.textTertiary);
          if (isDot) {
            return AnimatedContainer(
              duration: const Duration(milliseconds: 250),
              width: 8,
              height: 8,
              margin: const EdgeInsets.symmetric(horizontal: 4),
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: done ? activeColor : track,
              ),
            );
          }
          return Expanded(
            child: Container(
              height: 2,
              color: track,
              margin: const EdgeInsets.symmetric(horizontal: 2),
            ),
          );
        }),
      ),
    );
  }
}