import 'package:flutter/material.dart';

import '../../core/theme.dart';
import '../../state/app_state.dart';
import '../screens/screens.dart';

const Map<String, String> titleMap = {
  'dashboard': 'Dashboard',
  'network': 'Metro Network',
  'metro-lines': 'Metro Lines',
  'stations': 'Stations',
  'machines': 'Machines',
  'refills': 'Refill Management',
  'pad-stock': 'Pad Stock',
  'stock-issues': 'Stock Issues',
  'maintenance': 'Maintenance',
  'monthly-data': 'Monthly Data',
  'reports': 'Reports',
  'users': 'Users',
  'audit-logs': 'Audit Logs',
  'settings': 'Settings',
};

class AppScaffold extends StatelessWidget {
  final String selected;
  final String? title;
  final String subtitle;
  final List<Widget> actions;
  final Widget body;
  final bool showBack;

  const AppScaffold({
    super.key,
    required this.selected,
    this.title,
    this.subtitle = '',
    this.actions = const [],
    required this.body,
    this.showBack = false,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.home_outlined),
          tooltip: 'Dashboard',
          onPressed: () {
            Navigator.of(context).pushAndRemoveUntil(
              MaterialPageRoute(builder: (_) => const DashboardScreen()),
              (route) => false,
            );
          },
        ),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title ?? titleMap[selected] ?? ''),
            if (subtitle.isNotEmpty)
              Text(
                subtitle,
                style: const TextStyle(fontSize: 12, color: AppColors.textLight),
              ),
          ],
        ),
        actions: [
          ...actions,
          const _UserMenuButton(),
        ],
      ),
      body: body,
      bottomNavigationBar: BottomNavBar(selected: selected),
    );
  }
}

class _UserMenuButton extends StatelessWidget {
  const _UserMenuButton();

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: AppState.auth,
      builder: (context, _) {
        final user = AppState.auth.user;
        return PopupMenuButton<String>(
          icon: const Icon(Icons.account_circle_outlined),
          tooltip: 'Account',
          onSelected: (v) async {
            if (v == 'logout') {
              await AppState.auth.logout();
            }
          },
          itemBuilder: (context) => [
            PopupMenuItem(
              enabled: false,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(user?.name ?? '',
                      style: const TextStyle(fontWeight: FontWeight.w600)),
                  Text('${user?.email ?? ''} · ${user?.role ?? ''}',
                      style:
                          const TextStyle(fontSize: 12, color: AppColors.textLight)),
                ],
              ),
            ),
            const PopupMenuDivider(),
            const PopupMenuItem(value: 'logout', child: Text('Log Out')),
          ],
        );
      },
    );
  }
}

class _NavItem {
  final String label;
  final String route;
  final IconData icon;
  const _NavItem(this.label, this.route, this.icon);
}

class BottomNavBar extends StatelessWidget {
  final String selected;
  const BottomNavBar({super.key, required this.selected});

  static const List<_NavItem> _tabs = [
    _NavItem('Dashboard', 'dashboard', Icons.dashboard_outlined),
    _NavItem('Metro Network', 'network', Icons.map_outlined),
    _NavItem('Refill Management', 'refills', Icons.refresh_outlined),
    _NavItem('Stock Issues', 'stock-issues', Icons.warning_amber_outlined),
  ];

  void _go(BuildContext context, String route) {
    if (route == selected) return;
    Navigator.pushReplacement(
      context,
      MaterialPageRoute(builder: (_) => screenFor(route)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final items = _tabs;

    return Material(
      color: AppColors.white,
      elevation: 8,
      child: SafeArea(
        top: false,
        child: Container(
          decoration: const BoxDecoration(
            border: Border(top: BorderSide(color: AppColors.border)),
          ),
          child: Row(
            children: [
              for (final t in items)
                Expanded(
                  child: InkWell(
                    onTap: () => _go(context, t.route),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            t.icon,
                            size: 22,
                            color: t.route == selected
                                ? AppColors.primary
                                : AppColors.textLight,
                          ),
                          const SizedBox(height: 2),
                          Text(
                            t.label,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: t.route == selected
                                  ? FontWeight.w600
                                  : FontWeight.w500,
                              color: t.route == selected
                                  ? AppColors.primary
                                  : AppColors.textLight,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}