import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../models/notification_item.dart';
import '../models/reminder.dart';
import '../services/reminders_controller.dart';
import '../theme.dart';
import '../widgets/state_views.dart';

class NotificationsPage extends StatelessWidget {
  final RemindersController controller;
  final ValueChanged<Reminder> onOpenDetail;
  const NotificationsPage({super.key, required this.controller, required this.onOpenDetail});

  Future<void> _markRead(BuildContext context, NotificationItem n) async {
    if (n.read || n.id == null) return;
    await controller.markNotificationRead(n.id!);
  }

  Future<void> _delete(BuildContext context, NotificationItem n) async {
    if (n.id == null) return;
    await controller.deleteNotification(n.id!);
  }

  Future<void> _markAll(BuildContext context) async {
    await controller.markAllNotificationsRead();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      body: ListenableBuilder(
        listenable: controller,
        builder: (context, _) {
          final items = controller.notifications;
          final unread = items.where((n) => !n.read).length;

          return RefreshIndicator(
            onRefresh: controller.refresh,
            child: CustomScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              slivers: [
                SliverToBoxAdapter(
                  child: Container(
                    padding: EdgeInsets.fromLTRB(20, MediaQuery.paddingOf(context).top + 18, 20, 24),
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
                        Text('Alerts',
                          style: GoogleFonts.hankenGrotesk(fontSize: 22, fontWeight: FontWeight.w800, color: Colors.white)),
                        const SizedBox(height: 4),
                        Row(
                          children: [
                            Text('${items.length}${unread > 0 ? ' · $unread unread' : ''}',
                              style: TextStyle(fontSize: 13, color: Colors.white.withValues(alpha: 0.7))),
                            const Spacer(),
                            if (unread > 0)
                              InkWell(
                                onTap: () => _markAll(context),
                                borderRadius: BorderRadius.circular(10),
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                                  child: Row(
                                    children: [
                                      const Icon(LucideIcons.checkCheck, size: 13, color: Colors.white),
                                      const SizedBox(width: 5),
                                      Text('Mark all read',
                                        style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Colors.white.withValues(alpha: 0.9))),
                                    ],
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
                if (items.isEmpty)
                  const SliverToBoxAdapter(
                    child: Padding(
                      padding: EdgeInsets.only(top: 60),
                      child: EmptyState(
                        icon: LucideIcons.bellOff,
                        title: 'No alerts',
                        subtitle: 'When a reminder needs attention, alerts will appear here.',
                      ),
                    ),
                  )
                else
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(16, 14, 16, 24),
                    sliver: SliverToBoxAdapter(
                      child: Column(
                        children: [
                          for (final n in items) _alertCard(context, n),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _alertCard(BuildContext context, NotificationItem n) {
    Reminder? remind;
    if (n.reminderId != null) {
      for (final r in controller.reminders) {
        if (r.id == n.reminderId) { remind = r; break; }
      }
    }
    final typeColor = n.alertType == 'overdue'
        ? const Color(0xFFdc2626)
        : n.alertType == 'due_today'
            ? const Color(0xFFea580c)
            : n.alertType == 'due_soon'
                ? const Color(0xFFd97706)
                : n.alertType == 'renewal'
                    ? const Color(0xFF7c3aed)
                    : const Color(0xFF2563eb);

    return Dismissible(
      key: ValueKey(n.id ?? n.message),
      direction: DismissDirection.endToStart,
      background: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.only(right: 20),
        alignment: Alignment.centerRight,
        decoration: BoxDecoration(
          color: const Color(0xFFdc2626),
          borderRadius: BorderRadius.circular(16),
        ),
        child: const Icon(LucideIcons.trash2, size: 20, color: Colors.white),
      ),
      onDismissed: (_) => _delete(context, n),
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(13),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: n.read ? AppColors.line : typeColor.withValues(alpha: 0.45), width: n.read ? 1 : 1.2),
        ),
        child: InkWell(
          onTap: () {
            _markRead(context, n);
            if (remind != null) onOpenDetail(remind);
          },
          borderRadius: BorderRadius.circular(16),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(color: typeColor.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(11)),
                child: Icon(_iconFor(n.alertType), size: 17, color: typeColor),
              ),
              const SizedBox(width: 11),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(remind?.title ?? 'Alert',
                            maxLines: 1, overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 13.5,
                              fontWeight: n.read ? FontWeight.w600 : FontWeight.w800,
                              color: AppColors.ink,
                            )),
                        ),
                        if (!n.read) Container(width: 8, height: 8, decoration: BoxDecoration(color: typeColor, shape: BoxShape.circle)),
                      ],
                    ),
                    const SizedBox(height: 3),
                    Text(n.message ?? '',
                      maxLines: 2, overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 12.5, height: 1.3, color: AppColors.inkMute)),
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        Text(_formatTime(n.createdAt),
                          style: const TextStyle(fontSize: 11, color: AppColors.inkSoft)),
                        const Spacer(),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                          decoration: BoxDecoration(color: typeColor.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(8)),
                          child: Text(_labelFor(n.alertType),
                            style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w800, color: typeColor)),
                        ),
                      ],
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

  IconData _iconFor(String? type) {
    switch (type) {
      case 'overdue':
        return LucideIcons.alertOctagon;
      case 'due_today':
        return LucideIcons.clock;
      case 'renewal':
        return LucideIcons.refreshCcw;
      case 'due_soon':
        return LucideIcons.bellRing;
      default:
        return LucideIcons.bell;
    }
  }

  String _labelFor(String? type) {
    switch (type) {
      case 'overdue':
        return 'OVERDUE';
      case 'due_today':
        return 'DUE TODAY';
      case 'renewal':
        return 'RENEWAL';
      case 'due_soon':
        return 'DUE SOON';
      default:
        return 'ALERT';
    }
  }

  String _formatTime(String? raw) {
    if (raw == null || raw.isEmpty) return '';
    final d = DateTime.tryParse(raw.replaceFirst(' ', 'T'));
    if (d == null) return raw;
    final now = DateTime.now();
    final diff = now.difference(d);
    if (diff.inMinutes < 1) return 'just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    if (diff.inDays < 7) return '${diff.inDays}d ago';
    return DateFormat('d MMM, h:mm a').format(d);
  }
}