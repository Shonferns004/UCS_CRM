import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../models/reminder.dart';
import '../theme.dart';
import '../widgets/reminder_tile.dart';
import '../widgets/state_views.dart';

/// A simple full-screen list of reminders for a dashboard KPI card
/// (e.g. all overdue reminders), so tapping a card shows every matching
/// reminder instead of just the first one.
class RemindersListPage extends StatelessWidget {
  final String title;
  final String subtitle;
  final List<Reminder> reminders;
  final ValueChanged<Reminder> onOpenDetail;
  const RemindersListPage({
    super.key,
    required this.title,
    required this.subtitle,
    required this.reminders,
    required this.onOpenDetail,
  });

  @override
  Widget build(BuildContext context) {
    final p = AppPalette.of(context);
    return Scaffold(
      backgroundColor: p.bg,
      appBar: AppBar(
        backgroundColor: p.card,
        foregroundColor: p.ink,
        elevation: 0,
        scrolledUnderElevation: 0,
        titleSpacing: 0,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(title,
              style: GoogleFonts.hankenGrotesk(
                fontSize: 18, fontWeight: FontWeight.w800, color: p.ink)),
            Text(subtitle,
              style: TextStyle(fontSize: 12, color: p.inkMute)),
          ],
        ),
      ),
      body: reminders.isEmpty
          ? EmptyState(
              icon: LucideIcons.inbox,
              title: 'Nothing here',
              subtitle: 'No reminders match "$title".',
            )
          : ListView.builder(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 24),
              itemCount: reminders.length,
              itemBuilder: (context, i) => ReminderTile(
                reminder: reminders[i],
                onTap: () => onOpenDetail(reminders[i]),
              ),
            ),
    );
  }
}