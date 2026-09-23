import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../channel.dart';
import '../core/theme/app_colors.dart';
import '../core/widgets/app_widgets.dart';
import '../screens/about_page.dart';
import '../screens/change_secret_code_page.dart';
import '../screens/manage_apps_page.dart';
import '../screens/recovery_notification_page.dart';

/// App home once setup is done. Contains Status (Screen 06) and
/// Settings (Screen 08), wired to live native events.
class Shell extends StatefulWidget {
  final VoidCallback onReset;

  const Shell({super.key, required this.onReset});

  @override
  State<Shell> createState() => _ShellState();
}

class _ShellState extends State<Shell> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(
        index: _tab,
        children: [
          _StatusView(onReset: widget.onReset),
          _SettingsView(onReset: widget.onReset),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: const [
          NavigationDestination(
            icon: Icon(LucideIcons.shield),
            selectedIcon: Icon(LucideIcons.shieldCheck),
            label: 'Protection',
          ),
          NavigationDestination(
            icon: Icon(LucideIcons.slidersHorizontal),
            selectedIcon: Icon(LucideIcons.settings),
            label: 'Settings',
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Status (Design Screen 06)
// ---------------------------------------------------------------------------

class _StatusView extends StatefulWidget {
  final VoidCallback onReset;

  const _StatusView({required this.onReset});

  @override
  State<_StatusView> createState() => _StatusViewState();
}

class _StatusViewState extends State<_StatusView> {
  ProtectionStatus? _status;
  List<BlockLogEntry> _log = const [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _refresh();
    LockBoxChannel.events.listen((event) {
      _refresh();
    });
  }

  Future<void> _refresh() async {
    final status = await LockBoxChannel.getProtectionStatus();
    final log = await LockBoxChannel.getBlockedLog(limit: 50);
    if (!mounted) return;
    setState(() {
      _status = status;
      _log = log;
      _loading = false;
    });
  }

  Future<void> _clearLog() async {
    await LockBoxChannel.clearBlockedLog();
    await _refresh();
  }

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final primaryText = dark ? AppColors.darkTextPrimary : AppColors.textPrimary;
    final secondaryText = dark ? AppColors.darkTextSecondary : AppColors.textSecondary;

    if (_loading || _status == null) {
      return const SafeArea(child: BusyScreen(message: 'Loading status…'));
    }

    final s = _status!;
    final active = s.active;
    final paused = s.paused;
    final color = active ? AppColors.success : (paused ? AppColors.warning : AppColors.error);
    final label = active ? 'Protection Active' : (paused ? 'Protection Paused' : 'Protection Off');
    final sub = active
        ? 'All apps not on your allowlist are being blocked.'
        : paused
            ? 'The accessibility service is off. LockBox can\'t block apps right now.'
            : 'Setup incomplete. Re-run setup to protect this device.';

    return SafeArea(
      child: RefreshIndicator(
        onRefresh: _refresh,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 32),
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Status',
                  style: TextStyle(
                    fontSize: 28,
                    fontWeight: FontWeight.w800,
                    color: primaryText,
                  ),
                ),
                IconButton(
                  onPressed: _refresh,
                  tooltip: 'Refresh',
                  icon: const Icon(LucideIcons.refreshCw),
                ),
              ],
            ),
            const SizedBox(height: 6),

            // Hero card
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [color, color.withValues(alpha: 0.75)],
                ),
                borderRadius: AppRadii.card,
                boxShadow: [
                  BoxShadow(
                    color: color.withValues(alpha: 0.35),
                    blurRadius: 24,
                    offset: const Offset(0, 10),
                  ),
                ],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(active ? LucideIcons.shieldCheck : LucideIcons.shieldOff,
                          color: Colors.white, size: 40),
                      const Spacer(),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.22),
                          borderRadius: AppRadii.button,
                        ),
                        child: Text(
                          active ? 'ACTIVE' : 'PAUSED',
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 12,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 0.6,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  Text(
                    label,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 20,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    sub,
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.9),
                      fontSize: 13.5,
                      height: 1.45,
                    ),
                  ),
                  if (paused) ...[
                    const SizedBox(height: 14),
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton.icon(
                        onPressed: () => LockBoxChannel.openAccessibilitySettings(),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.white,
                          foregroundColor: color,
                        ),
                        icon: const Icon(LucideIcons.settings, size: 18),
                        label: const Text('Enable Accessibility'),
                      ),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 24),

            // Stat tiles
            Row(
              children: [
                Expanded(
                  child: _StatTile(
                    icon: LucideIcons.listChecks,
                    value: '${s.allowlistCount}',
                    caption: 'Allowed apps',
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _StatTile(
                    icon: LucideIcons.timerOff,
                    value: '${s.blockedToday}',
                    caption: 'Blocked today',
                    valueColor: s.blockedToday > 0 ? AppColors.warning : null,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: _StatTile(
                    icon: LucideIcons.phone,
                    value: s.secretCode,
                    caption: 'Secret code',
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _StatTile(
                    icon: s.recoveryNotification ? LucideIcons.bell : LucideIcons.bellOff,
                    value: s.recoveryNotification ? 'On' : 'Off',
                    caption: 'Recovery note',
                  ),
                ),
              ],
            ),
            const SizedBox(height: 26),

            // Recent blocked attempts
            Row(
              children: [
                Expanded(
                  child: SectionHeader('RECENT BLOCKED ATTEMPTS'),
                ),
                if (_log.isNotEmpty)
                  TextButton.icon(
                    onPressed: _clearLog,
                    icon: const Icon(LucideIcons.trash2, size: 16),
                    label: const Text('Clear'),
                  ),
              ],
            ),
            if (_log.isEmpty)
              AppEmptyState(
                icon: LucideIcons.inbox,
                title: 'No blocked attempts yet',
                subtitle: 'Attempts to open blocked apps will show here.',
              )
            else
              ..._log.map(
                (e) => Container(
                  margin: const EdgeInsets.only(bottom: 10),
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  decoration: BoxDecoration(
                    color: dark ? AppColors.darkSurface : Colors.white,
                    borderRadius: AppRadii.card,
                    border: Border.all(
                      color: dark ? AppColors.darkBorder : AppColors.border,
                    ),
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 42,
                        height: 42,
                        decoration: BoxDecoration(
                          color: AppColors.warningSoft,
                          borderRadius: AppRadii.small,
                        ),
                        child: const Icon(LucideIcons.shieldX, color: AppColors.warning, size: 20),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              e.label.isEmpty ? e.package : e.label,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(fontWeight: FontWeight.w600),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              e.package,
                              style: TextStyle(
                                fontSize: 12.5,
                                color: dark ? AppColors.darkTextTertiary : AppColors.textTertiary,
                              ),
                            ),
                          ],
                        ),
                      ),
                      Text(
                        _timeAgo(e.ts),
                        style: TextStyle(
                          fontSize: 12.5,
                          color: secondaryText,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  String _timeAgo(int tsMs) {
    final diff = DateTime.now().millisecondsSinceEpoch - tsMs;
    final s = diff ~/ 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return '${s ~/ 60}m ago';
    if (s < 86400) return '${s ~/ 3600}h ago';
    return '${s ~/ 86400}d ago';
  }
}

class _StatTile extends StatelessWidget {
  final IconData icon;
  final String value;
  final String caption;
  final Color? valueColor;

  const _StatTile({
    required this.icon,
    required this.value,
    required this.caption,
    this.valueColor,
  });

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: dark ? AppColors.darkSurface : Colors.white,
        borderRadius: AppRadii.card,
        border: Border.all(color: dark ? AppColors.darkBorder : AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20, color: Theme.of(context).colorScheme.primary),
          const SizedBox(height: 8),
          Text(
            value,
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w800,
              color: valueColor ?? (dark ? AppColors.darkTextPrimary : AppColors.textPrimary),
            ),
          ),
          const SizedBox(height: 2),
          Text(
            caption,
            style: TextStyle(
              fontSize: 12.5,
              color: dark ? AppColors.darkTextSecondary : AppColors.textSecondary,
            ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Settings (Design Screen 08)
// ---------------------------------------------------------------------------

class _SettingsView extends StatefulWidget {
  final VoidCallback onReset;

  const _SettingsView({required this.onReset});

  @override
  State<_SettingsView> createState() => _SettingsViewState();
}

class _SettingsViewState extends State<_SettingsView> {
  bool? _iconVisible;
  bool? _recoveryOn;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final s = await LockBoxChannel.getProtectionStatus();
    if (!mounted) return;
    setState(() {
      _iconVisible = s.launcherVisible;
      _recoveryOn = s.recoveryNotification;
    });
  }

  Future<void> _toggleIcon(bool on) async {
    setState(() => _busy = true);
    await LockBoxChannel.setLauncherVisible(on);
    await LockBoxChannel.getProtectionStatus();
    if (!mounted) return;
    setState(() {
      _iconVisible = on;
      _busy = false;
    });
    if (!on) _snack('Icon hidden — use your dialer secret code to reopen LockBox.');
  }

  void _snack(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  Future<void> _resetAll() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        icon: const Icon(LucideIcons.alertTriangle, color: AppColors.error, size: 32),
        title: const Text('Reset all data?'),
        content: const Text(
          'Clears your passcode, secret code, allowlist and blocked log, and '
          'shows the LockBox icon again. Setup restarts on next open.',
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
            child: const Text('Reset'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    await LockBoxChannel.resetAllData();
    widget.onReset();
  }

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final primaryText = dark ? AppColors.darkTextPrimary : AppColors.textPrimary;

    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 32),
        children: [
          Text(
            'Settings',
            style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800, color: primaryText),
          ),
          const SizedBox(height: 6),
          const SectionHeader('SECURITY'),
          _IconSubPageContext(
            child: ChevronTile(
              title: 'Change secret code',
              subtitle: 'Dial this code to reopen LockBox',
              icon: LucideIcons.phone,
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const ChangeSecretCodePage()),
              ),
            ),
          ),
          const SizedBox(height: 10),
          Opacity(
            opacity: _busy && _iconVisible != null ? 0.55 : 1,
            child: AppSwitchTile(
              icon: LucideIcons.appWindow,
              title: 'Show app in launcher',
              subtitle: 'Hides the LockBox icon when off',
              value: _iconVisible ?? true,
              onChanged: _toggleIcon,
            ),
          ),
          const SizedBox(height: 10),
          ChevronTile(
            title: 'Recovery notification',
            subtitle: _recoveryOn == true ? 'On — a quiet way back to LockBox' : 'Off',
            icon: _recoveryOn == true ? LucideIcons.bell : LucideIcons.bellOff,
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const RecoveryNotificationPage()),
            ),
          ),
          const SizedBox(height: 20),
          const SectionHeader('APPS'),
          ChevronTile(
            title: 'Manage allowed apps',
            subtitle: 'Decide what stays accessible',
            icon: LucideIcons.listChecks,
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const ManageAppsPage()),
            ),
          ),
          const SizedBox(height: 20),
          const SectionHeader('ABOUT'),
          ChevronTile(
            title: 'About LockBox',
            subtitle: 'Version, how blocking works, limitations',
            icon: LucideIcons.info,
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const AboutPage()),
            ),
          ),
          const SizedBox(height: 20),
          const SectionHeader('DANGER ZONE'),
          ChevronTile(
            title: 'Reset all data',
            subtitle: 'Unlock everything and start over',
            icon: LucideIcons.trash2,
            trailingIcon: LucideIcons.chevronRight,
            onTap: _resetAll,
          ),
        ],
      ),
    );
  }
}

/// Thin wrapper so ChevronTile keeps its own ripple + card padding on taps.
class _IconSubPageContext extends StatelessWidget {
  final Widget child;
  const _IconSubPageContext({required this.child});

  @override
  Widget build(BuildContext context) => child;
}