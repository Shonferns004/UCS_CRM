import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../services/api_service.dart';
import '../services/reminders_controller.dart';
import '../theme.dart';

class SettingsPage extends StatefulWidget {
  final RemindersController controller;
  final VoidCallback onLogout;
  const SettingsPage({super.key, required this.controller, required this.onLogout});

  @override
  State<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends State<SettingsPage> {
  bool? _fcmRegistered;
  bool _checkingFcm = true;
  bool _refreshing = false;
  String? _myToken;

  @override
  void initState() {
    super.initState();
    _checkFcm();
  }

  Future<void> _checkFcm() async {
    setState(() => _checkingFcm = true);
    try {
      final token = await ApiService.resolveFcmToken();
      if (mounted) {
        setState(() {
          _myToken = token;
          _fcmRegistered = token != null && token.isNotEmpty;
          _checkingFcm = false;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _fcmRegistered = false;
          _checkingFcm = false;
        });
      }
    }
  }

  void _snack(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  Future<void> _copyToken() async {
    final t = _myToken;
    if (t == null) {
      _snack('No token loaded yet — tap Re-register below');
      return;
    }
    await Clipboard.setData(ClipboardData(text: t));
    if (mounted) _snack('Device token copied');
  }

  Future<void> _sendTestPush() async {
    if (_myToken == null) {
      _snack('Register a token first — tap Re-register below');
      return;
    }
    setState(() => _refreshing = true);
    try {
      final r = await ApiService.sendTestPush();
      if (mounted) _snack('${r['message'] ?? 'Test push sent'}');
    } catch (e) {
      if (mounted) _snack('Failed: ${e.toString().replaceFirst('Exception: ', '')}');
    } finally {
      if (mounted) setState(() => _refreshing = false);
    }
  }

  Future<void> _reRegister() async {
    setState(() => _refreshing = true);
    RemindersController.registerFcmToken();
    await Future<void>.delayed(const Duration(milliseconds: 800));
    await _checkFcm();
    if (mounted) setState(() => _refreshing = false);
  }

  Future<void> _sync() async {
    setState(() => _refreshing = true);
    await widget.controller.refresh();
    if (mounted) setState(() => _refreshing = false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      body: ListenableBuilder(
        listenable: widget.controller,
        builder: (context, _) {
          final c = widget.controller;
          return RefreshIndicator(
            onRefresh: _sync,
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: EdgeInsets.zero,
              children: [
                Container(
                  padding: EdgeInsets.fromLTRB(20, MediaQuery.paddingOf(context).top + 18, 20, 26),
                  decoration: const BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [Color(0xFF0f172a), Color(0xFF1e3a8a)],
                    ),
                    borderRadius: BorderRadius.vertical(bottom: Radius.circular(28)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Settings',
                        style: GoogleFonts.hankenGrotesk(fontSize: 22, fontWeight: FontWeight.w800, color: Colors.white)),
                      const SizedBox(height: 4),
                      Text('Account, sync & preferences',
                        style: TextStyle(fontSize: 13, color: Colors.white.withValues(alpha: 0.7))),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _section('Account'),
                      _card([
                        _tile(
                          icon: LucideIcons.userCog,
                          iconBg: const Color(0xFF2563eb),
                          title: 'Signed in as',
                          subtitle: 'Super Admin (UFS House)',
                        ),
                        const Divider(height: 1, color: AppColors.line),
                        _tile(
                          icon: LucideIcons.clock3,
                          iconBg: const Color(0xFF64748b),
                          title: 'Last login',
                          subtitle: c.lastLogin ?? '—',
                        ),
                      ]),
                      const SizedBox(height: 20),
                      _section('Notifications'),
                      _card([
                        _tile(
                          icon: LucideIcons.bellRing,
                          iconBg: const Color(0xFF7c3aed),
                          title: 'Push alerts',
                          subtitle: _checkingFcm
                              ? 'Checking…'
                              : (_fcmRegistered == true
                                  ? 'Registered on this device'
                                  : 'Not registered yet'),
                          trailing: _checkingFcm
                              ? const SizedBox(
                                  width: 16, height: 16,
                                  child: CircularProgressIndicator(strokeWidth: 2))
                              : _statusDot(_fcmRegistered == true),
                        ),
                        if (_fcmRegistered != true) ...[
                          const Divider(height: 1, color: AppColors.line),
                          InkWell(
                            onTap: _reRegister,
                            child: Padding(
                              padding: const EdgeInsets.symmetric(vertical: 12),
                              child: Row(
                                children: [
                                  const SizedBox(width: 34),
                                  if (_refreshing)
                                    const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2))
                                  else
                                    const Icon(LucideIcons.refreshCw, size: 14, color: AppColors.blue),
                                  const SizedBox(width: 8),
                                  const Text('Re-register push token',
                                    style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: AppColors.blue)),
                                ],
                              ),
                            ),
                          ),
                        ],
                      const Divider(height: 1, color: AppColors.line),
                        _tile(
                          icon: LucideIcons.keyRound,
                          iconBg: const Color(0xFF475569),
                          title: 'Device token',
                          subtitle: _checkingFcm
                              ? 'Loading…'
                              : (_myToken != null && _myToken!.isNotEmpty ? _myToken! : 'Missing'),
                          isToken: true,
                          trailing: IconButton(
                            onPressed: _copyToken,
                            icon: const Icon(LucideIcons.copy, size: 15, color: AppColors.inkMute),
                            tooltip: 'Copy token',
                          ),
                        ),
                      ]),
                      const SizedBox(height: 20),
                      _section('Push Test'),
                      _card([
                        _tile(
                          icon: LucideIcons.send,
                          iconBg: const Color(0xFF2563eb),
                          title: 'Send test push',
                          subtitle: 'Instantly notifies this phone via FCM',
                          onTap: _sendTestPush,
                          trailing: _refreshing
                              ? const SizedBox(
                                  width: 16, height: 16,
                                  child: CircularProgressIndicator(strokeWidth: 2))
                              : const Icon(LucideIcons.chevronRight, size: 16, color: AppColors.inkMute),
                        ),
                      ]),
                      const SizedBox(height: 20),
                      _section('Data & Sync'),
                      _card([
                        _tile(
                          icon: LucideIcons.layers,
                          iconBg: const Color(0xFF0891b2),
                          title: 'Reminders',
                          subtitle: '${c.reminders.length} active · ${c.notifications.length} alerts',
                        ),
                        const Divider(height: 1, color: AppColors.line),
                        _tile(
                          icon: LucideIcons.refreshCw,
                          iconBg: const Color(0xFF16a34a),
                          title: 'Last synced',
                          subtitle: c.syncedAt != null ? DateFormat('d MMM yyyy, h:mm a').format(c.syncedAt!) : 'Not yet',
                          onTap: _sync,
                        ),
                      ]),
                      const SizedBox(height: 20),
                      _section('About'),
                      _card([
                        _tile(
                          icon: LucideIcons.walletCards,
                          iconBg: const Color(0xFFd97706),
                          title: 'Bill Reminder',
                          subtitle: 'Version 1.0.0 · Android',
                        ),
                        const Divider(height: 1, color: AppColors.line),
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          child: Row(
                            children: [
                              const Icon(LucideIcons.globe, size: 15, color: AppColors.inkMute),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Text(ApiService.baseUrl,
                                  maxLines: 1, overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(fontSize: 12, color: AppColors.inkMute)),
                              ),
                            ],
                          ),
                        ),
                      ]),
                      const SizedBox(height: 26),
                      SizedBox(
                        width: double.infinity,
                        height: 50,
                        child: FilledButton.icon(
                          onPressed: widget.onLogout,
                          style: FilledButton.styleFrom(
                            backgroundColor: const Color(0xFFdc2626).withValues(alpha: 0.1),
                            foregroundColor: const Color(0xFFdc2626),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                          ),
                          icon: const Icon(LucideIcons.logOut, size: 18),
                          label: const Text('Sign out',
                            style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w800)),
                        ),
                      ),
                      const SizedBox(height: 8),
                      const Center(
                        child: Text('Managed from the Bill Reminder web admin',
                          style: TextStyle(fontSize: 11, color: AppColors.inkMute)),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _section(String title) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(title,
        style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800, letterSpacing: 1, color: AppColors.inkMute)),
    );
  }

  Widget _card(List<Widget> children) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.line),
      ),
      child: Column(children: children),
    );
  }

  Widget _tile({
    required IconData icon,
    required Color iconBg,
    required String title,
    required String subtitle,
    Widget? trailing,
    VoidCallback? onTap,
    bool isToken = false,
  }) {
    return InkWell(
      onTap: onTap ?? () {},
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(
          children: [
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(color: iconBg.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(9)),
              child: Icon(icon, size: 15, color: iconBg),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: AppColors.ink)),
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    overflow: TextOverflow.ellipsis,
                    maxLines: isToken ? 2 : 1,
                    style: TextStyle(fontSize: isToken ? 10.5 : 12, color: AppColors.inkMute),
                  ),
                ],
              ),
            ),
            trailing ?? const SizedBox.shrink(),
          ],
        ),
      ),
    );
  }

  Widget _statusDot(bool ok) {
    return Container(
      width: 9,
      height: 9,
      decoration: BoxDecoration(
        color: ok ? const Color(0xFF16a34a) : const Color(0xFFdc2626),
        shape: BoxShape.circle,
        boxShadow: [BoxShadow(color: (ok ? const Color(0xFF16a34a) : const Color(0xFFdc2626)).withValues(alpha: 0.4), blurRadius: 6, spreadRadius: 1)],
      ),
    );
  }
}