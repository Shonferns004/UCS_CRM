import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../models/reminder.dart';
import '../services/api_service.dart';
import '../services/reminders_controller.dart';
import '../theme.dart';
import '../widgets/status_pill.dart';

class DetailPage extends StatefulWidget {
  final Reminder reminder;
  final RemindersController? controller;
  const DetailPage({super.key, required this.reminder, this.controller});

  @override
  State<DetailPage> createState() => _DetailPageState();
}

class _DetailPageState extends State<DetailPage> {
  late Reminder reminder = widget.reminder;
  bool _marking = false;

  Future<void> _markPaid() async {
    final messenger = ScaffoldMessenger.of(context);
    final navigator = Navigator.of(context);

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (d) => AlertDialog(
        title: const Text('Mark as paid?'),
        content: Text('Mark "${reminder.title}" as completed?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(d, false), child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.pop(d, true),
            child: const Text('Yes, paid'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    setState(() => _marking = true);
    try {
      await ApiService.completeReminder('${reminder.id}');
      final ctrl = widget.controller ?? RemindersController.instance;
      await ctrl?.refresh();
      if (mounted) navigator.pop();
      messenger.showSnackBar(const SnackBar(content: Text('Marked as paid ✓')));
    } catch (e) {
      if (mounted) {
        setState(() => _marking = false);
        messenger.showSnackBar(SnackBar(
          content: Text('Could not mark as paid — ${e.toString().replaceFirst('Exception: ', '')}'),
        ));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final meta = statusMeta(reminder.statusLabel);
    final cat = categoryMeta(reminder.category);
    final ownerColor = kOwnerColors[reminder.owner] ?? const Color(0xFF64748b);
    final isPaid = reminder.paid;
    final daysLeft = reminder.daysLeft;
    final showRef = reminder.dueDate ?? reminder.renewalDate;

    String? countdown;
    if (!isPaid && daysLeft != null) {
      if (daysLeft < 0) {
        countdown = 'Overdue by ${-daysLeft} day${-daysLeft == 1 ? '' : 's'}';
      } else if (daysLeft == 0) {
        countdown = 'Due today';
      } else {
        countdown = '$daysLeft day${daysLeft == 1 ? '' : 's'} left';
      }
    } else if (isPaid) {
      countdown = 'Paid ✓';
    }

    return Scaffold(
      backgroundColor: AppColors.bg,
      body: CustomScrollView(
        slivers: [
          SliverAppBar(
            pinned: true,
            stretch: true,
            backgroundColor: const Color(0xFF0f172a),
            foregroundColor: Colors.white,
            expandedHeight: 210,
            flexibleSpace: FlexibleSpaceBar(
              stretchModes: const [StretchMode.zoomBackground],
              background: Container(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [ownerColor.withValues(alpha: 0.55), const Color(0xFF0f172a)],
                  ),
                ),
                child: SafeArea(
                  bottom: false,
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(20, 56, 20, 18),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                              decoration: BoxDecoration(
                                color: ownerColor,
                                borderRadius: BorderRadius.circular(20),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  const Icon(LucideIcons.user, size: 12, color: Colors.white),
                                  const SizedBox(width: 5),
                                  Text(reminder.owner ?? 'Unassigned',
                                    style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800, color: Colors.white)),
                                ],
                              ),
                            ),
                            const Spacer(),
                            StatusPill(status: reminder.statusLabel),
                          ],
                        ),
                        const Spacer(),
                        Text(reminder.title,
                          maxLines: 2, overflow: TextOverflow.ellipsis,
                          style: GoogleFonts.hankenGrotesk(
                            fontSize: 26, fontWeight: FontWeight.w800, color: Colors.white, height: 1.15)),
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            Icon(cat.icon, size: 14, color: Colors.white.withValues(alpha: 0.7)),
                            const SizedBox(width: 6),
                            Text(cat.label,
                              style: TextStyle(fontSize: 12.5, color: Colors.white.withValues(alpha: 0.75))),
                            const SizedBox(width: 10),
                            const Icon(LucideIcons.calendarDays, size: 13, color: Colors.white54),
                            const SizedBox(width: 5),
                            Text(showRef != null ? dateFull(showRef) : 'No due date',
                              style: TextStyle(fontSize: 12.5, color: Colors.white.withValues(alpha: 0.75))),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
          SliverToBoxAdapter(
            child: Container(
              transform: Matrix4.translationValues(0, -14, 0),
              margin: const EdgeInsets.symmetric(horizontal: 16),
              padding: const EdgeInsets.fromLTRB(18, 18, 18, 4),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(18),
                boxShadow: const [BoxShadow(color: Color(0x110f172a), blurRadius: 18, offset: Offset(0, 6))],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('Amount', style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: AppColors.inkMute, letterSpacing: 0.4)),
                            const SizedBox(height: 4),
                            Text(formatINRZero(reminder.amount),
                              style: GoogleFonts.hankenGrotesk(fontSize: 32, fontWeight: FontWeight.w800, color: AppColors.ink)),
                          ],
                        ),
                      ),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                            decoration: BoxDecoration(
                              color: meta.color.withValues(alpha: 0.1),
                              borderRadius: BorderRadius.circular(20),
                            ),
                            child: Text(meta.label,
                              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: meta.color)),
                          ),
                          if (countdown != null) ...[
                            const SizedBox(height: 5),
                            Text(countdown,
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w700,
                                color: daysLeft != null && daysLeft < 0 ? const Color(0xFFdc2626) : AppColors.inkSoft)),
                          ],
                        ],
                      ),
                    ],
                  ),
                  if (reminder.priority != null) ...[
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        const Icon(LucideIcons.flag, size: 13, color: AppColors.inkMute),
                        const SizedBox(width: 6),
                        Text('Priority: ${reminder.priority}',
                          style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: kPriorityColors[reminder.priority] ?? AppColors.inkSoft)),
                      ],
                    ),
                  ],
                  const SizedBox(height: 14),
                  _infoGrid(context),
                ],
              ),
            ),
          ),
          SliverToBoxAdapter(
            child: Container(
              margin: const EdgeInsets.fromLTRB(16, 10, 16, 8),
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AppColors.line),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Schedule',
                    style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: AppColors.ink)),
                  const SizedBox(height: 12),
                  _row(LucideIcons.calendarCheck2, 'Last Due', dateMedium(reminder.dueDate)),
                  _row(LucideIcons.bellRing, 'Renewal', dateMedium(reminder.renewalDate)),
                  _row(LucideIcons.repeat, 'Frequency', reminder.displayFrequency ?? reminder.frequencyType ?? '—'),
                  _row(LucideIcons.hourglass, 'Remind before',
                      reminder.remindDaysBefore != null ? '${reminder.remindDaysBefore} day${reminder.remindDaysBefore == 1 ? '' : 's'}' : '—'),
                  _row(LucideIcons.checkCircle2, 'Last paid', dateMedium(reminder.paidAt)),
                ],
              ),
            ),
          ),
          if ((reminder.notes?.isNotEmpty ?? false) || (reminder.description?.isNotEmpty ?? false))
            SliverToBoxAdapter(
              child: Container(
                margin: const EdgeInsets.fromLTRB(16, 10, 16, 8),
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: AppColors.line),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (reminder.description?.isNotEmpty ?? false) ...[
                      const Text('Description',
                        style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: AppColors.ink)),
                      const SizedBox(height: 6),
                      Text(reminder.description!,
                        style: const TextStyle(fontSize: 13.5, height: 1.5, color: AppColors.inkSoft)),
                      const SizedBox(height: 14),
                    ],
                    if (reminder.notes?.isNotEmpty ?? false) ...[
                      const Text('Notes',
                        style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: AppColors.ink)),
                      const SizedBox(height: 6),
                      Text(reminder.notes!,
                        style: const TextStyle(fontSize: 13.5, height: 1.5, color: AppColors.inkSoft)),
                    ],
                  ],
                ),
              ),
            ),
          if (!reminder.paid)
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
                child: FilledButton.icon(
                  onPressed: _marking ? null : _markPaid,
                  style: FilledButton.styleFrom(
                    backgroundColor: const Color(0xFF16a34a),
                    foregroundColor: Colors.white,
                    disabledBackgroundColor: const Color(0xFF16a34a).withValues(alpha: 0.55),
                    minimumSize: const Size.fromHeight(52),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  ),
                  icon: _marking
                      ? const SizedBox(
                          width: 18, height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2.2, color: Colors.white))
                      : const Icon(LucideIcons.checkCircle2, size: 20),
                  label: const Text('Mark as paid',
                    style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, letterSpacing: 0.2)),
                ),
              ),
            ),
          const SliverToBoxAdapter(child: SizedBox(height: 20)),
        ],
      ),
    );
  }

  Widget _infoGrid(BuildContext context) {
    return Column(
      children: [
        _row(LucideIcons.circleDollarSign, 'Owner', reminder.owner ?? '—'),
        _row(LucideIcons.folderKanban, 'Category', categoryLabel(reminder.category)),
        _row(LucideIcons.users, 'Family group', groupOf(reminder.category).label),
      ],
    );
  }

  Widget _row(IconData icon, String label, String? value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 7),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 16, color: AppColors.inkMute),
          const SizedBox(width: 10),
          SizedBox(
            width: 118,
            child: Text(label, style: const TextStyle(fontSize: 13, color: AppColors.inkMute)),
          ),
          Expanded(
            child: Text(value ?? '—',
              style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: AppColors.ink)),
          ),
        ],
      ),
    );
  }
}