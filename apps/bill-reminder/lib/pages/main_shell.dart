import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../models/reminder.dart';
import '../pages/all_reminders_page.dart';
import '../pages/categories_page.dart';
import '../pages/dashboard_page.dart';
import '../pages/detail_page.dart';
import '../pages/settings_page.dart';
import '../services/reminders_controller.dart';
import '../theme.dart';

class MainShell extends StatefulWidget {
  final VoidCallback onLogout;
  const MainShell({super.key, required this.onLogout});

  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> {
  final RemindersController _controller = RemindersController();
  int _currentIndex = 0;

  @override
  void initState() {
    super.initState();
    RemindersController.instance = _controller;
    _controller.refresh();
    RemindersController.registerFcmToken();
  }

  @override
  void dispose() {
    if (RemindersController.instance == _controller) RemindersController.instance = null;
    _controller.dispose();
    super.dispose();
  }

  void _openDetail(Reminder r) {
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => DetailPage(reminder: r, controller: _controller),
    ));
  }

  @override
  Widget build(BuildContext context) {
    final children = [
      DashboardPage(controller: _controller, onOpenDetail: _openDetail),
      AllRemindersPage(controller: _controller, onOpenDetail: _openDetail),
      CategoriesPage(controller: _controller, onOpenDetail: _openDetail),
      SettingsPage(controller: _controller, onLogout: widget.onLogout),
    ];

    const tabs = [
      (LucideIcons.layoutDashboard, 'Home'),
      (LucideIcons.list, 'All'),
      (LucideIcons.layoutGrid, 'Categories'),
      (LucideIcons.settings, 'Settings'),
    ];

    return Scaffold(
      backgroundColor: AppColors.bg,
      body: _LazyIndexedStack(index: _currentIndex, children: children),
      bottomNavigationBar: Container(
        decoration: const BoxDecoration(
          color: Colors.white,
          border: Border(top: BorderSide(color: AppColors.line)),
          boxShadow: [
            BoxShadow(color: Color(0x140f172a), blurRadius: 16, offset: Offset(0, -4)),
          ],
        ),
        child: SafeArea(
          top: false,
          child: SizedBox(
            height: 64,
            child: Row(
              children: [
                for (var i = 0; i < tabs.length; i++)
                  Expanded(
                    child: _NavItem(
                      icon: tabs[i].$1,
                      label: tabs[i].$2,
                      isActive: i == _currentIndex,
                      onTap: () {
                        if (i != _currentIndex) setState(() => _currentIndex = i);
                      },
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool isActive;
  final VoidCallback onTap;
  const _NavItem({required this.icon, required this.label, required this.isActive, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          AnimatedContainer(
            duration: const Duration(milliseconds: 220),
            curve: Curves.easeOut,
            width: isActive ? 46 : 34,
            height: 30,
            decoration: BoxDecoration(
              color: isActive ? AppColors.blue.withValues(alpha: 0.10) : Colors.transparent,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(
              icon,
              size: 20,
              color: isActive ? AppColors.blue : AppColors.inkMute,
            ),
          ),
          const SizedBox(height: 3),
          Text(label,
            style: TextStyle(
              fontSize: 10.5,
              fontWeight: isActive ? FontWeight.w800 : FontWeight.w600,
              color: isActive ? AppColors.blue : AppColors.inkMute,
            )),
        ],
      ),
    );
  }
}

class _LazyIndexedStack extends StatefulWidget {
  final int index;
  final List<Widget> children;
  const _LazyIndexedStack({required this.index, required this.children});

  @override
  State<_LazyIndexedStack> createState() => _LazyIndexedStackState();
}

class _LazyIndexedStackState extends State<_LazyIndexedStack> {
  final Set<int> _built = {};

  @override
  void initState() {
    super.initState();
    _built.add(widget.index);
    WidgetsBinding.instance.addPostFrameCallback((_) => _warmAll());
  }

  @override
  void didUpdateWidget(covariant _LazyIndexedStack oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.index >= 0 && widget.index < widget.children.length) {
      _built.add(widget.index);
    }
    _warmAll();
  }

  void _warmAll() {
    if (!mounted) return;
    if (widget.children.indexed.every((e) => _built.contains(e.$1))) return;
    setState(() {
      for (var i = 0; i < widget.children.length; i++) {
        _built.add(i);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return IndexedStack(
      index: widget.index,
      children: [
        for (var i = 0; i < widget.children.length; i++)
          _built.contains(i) ? widget.children[i] : const SizedBox.shrink(),
      ],
    );
  }
}