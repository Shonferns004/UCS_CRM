import 'package:flutter/material.dart';

import '../../core/theme.dart';
import '../../state/app_state.dart';
import '../screens/screens.dart';

const Map<String, String> titleMap = {
  'dashboard': 'Dashboard',
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
        leading: showBack
            ? IconButton(
                icon: const Icon(Icons.arrow_back),
                onPressed: () => Navigator.pop(context),
              )
            : Builder(
                builder: (context) => IconButton(
                  icon: const Icon(Icons.menu),
                  onPressed: () => Scaffold.of(context).openDrawer(),
                ),
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
      drawer: NavDrawer(selected: selected),
      body: body,
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
            if (v == 'settings') {
              Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const SettingsScreen()),
              );
            } else if (v == 'logout') {
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
            const PopupMenuItem(value: 'settings', child: Text('Settings')),
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

class NavDrawer extends StatelessWidget {
  final String selected;
  const NavDrawer({super.key, required this.selected});

  void _go(BuildContext context, String route) {
    Navigator.pop(context);
    if (route == selected) return;
    if (route == 'settings') {
      Navigator.push(
        context,
        MaterialPageRoute(builder: (_) => const SettingsScreen()),
      );
      return;
    }
    Navigator.pushReplacement(
      context,
      MaterialPageRoute(builder: (_) => screenFor(route)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final user = AppState.auth.user;
    final isAdmin = user?.role == 'ADMIN';

    final section1 = [_NavItem('Dashboard', 'dashboard', Icons.dashboard_outlined)];
    final section2 = [
      _NavItem('Metro Lines', 'metro-lines', Icons.directions_transit_outlined),
      _NavItem('Stations', 'stations', Icons.location_on_outlined),
    ];
    final section3 = [
      _NavItem('Pad Stock', 'pad-stock', Icons.inventory_2_outlined),
      _NavItem('Machines', 'machines', Icons.memory_outlined),
      _NavItem('Refill Management', 'refills', Icons.refresh_outlined),
      _NavItem('Stock Issues', 'stock-issues', Icons.warning_amber_outlined),
      _NavItem('Maintenance', 'maintenance', Icons.build_outlined),
    ];
    final section4 = [
      _NavItem('Monthly Data', 'monthly-data', Icons.bar_chart_outlined),
      _NavItem('Reports', 'reports', Icons.description_outlined),
    ];
    final section5 = [
      _NavItem('Users', 'users', Icons.group_outlined),
      _NavItem('Audit Logs', 'audit-logs', Icons.history_outlined),
    ];
    final section6 = [_NavItem('Settings', 'settings', Icons.settings_outlined)];

    return Drawer(
      child: Column(
        children: [
          Container(
            color: AppColors.white,
            padding: const EdgeInsets.symmetric(vertical: 20, horizontal: 16),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      colors: [AppColors.primaryLight, AppColors.primary],
                    ),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(Icons.directions_transit,
                      color: Colors.white, size: 20),
                ),
                const SizedBox(width: 10),
                const Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('METROPAD CARE',
                        style:
                            TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
                    Text('Machine Management',
                        style: TextStyle(fontSize: 11, color: AppColors.textLight)),
                  ],
                ),
              ],
            ),
          ),
          const Divider(height: 1),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.symmetric(vertical: 8),
              children: [
                ..._items(context, section1, null),
                ..._items(context, section2, 'Metro Management'),
                ..._items(context, section3, 'Machine Management'),
                ..._items(context, section4, 'Analytics & System'),
                if (isAdmin) ..._items(context, section5, 'Administration'),
                ..._items(context, section6, 'System'),
              ],
            ),
          ),
          const Divider(height: 1),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Row(
                children: [
                  const Icon(Icons.person_outline,
                      size: 18, color: AppColors.textLight),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(user?.name ?? '',
                            style: const TextStyle(
                                fontWeight: FontWeight.w600, fontSize: 13)),
                        Text((user?.role ?? '').replaceAll('_', ' '),
                            style: const TextStyle(
                                fontSize: 11, color: AppColors.textLight)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  List<Widget> _items(BuildContext context, List<_NavItem> items, String? heading) {
    return [
      if (heading != null)
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
          child: Text(heading.toUpperCase(),
              style: const TextStyle(
                  fontSize: 11,
                  color: AppColors.textLight,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.6)),
        ),
      for (final item in items)
        ListTile(
          leading: Icon(item.icon,
              size: 20,
              color: selected == item.route
                  ? AppColors.primary
                  : AppColors.textLight),
          title: Text(item.label,
              style: TextStyle(
                  fontSize: 14,
                  fontWeight:
                      selected == item.route ? FontWeight.w600 : FontWeight.w500,
                  color: selected == item.route
                      ? AppColors.primary
                      : AppColors.text)),
          onTap: () => _go(context, item.route),
        ),
    ];
  }
}