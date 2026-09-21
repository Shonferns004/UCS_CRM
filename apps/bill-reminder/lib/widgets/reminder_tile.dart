import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../models/reminder.dart';
import '../theme.dart';
import 'status_pill.dart';

class ReminderTile extends StatelessWidget {
  final Reminder reminder;
  final VoidCallback onTap;
  final bool showOwner;
  const ReminderTile({super.key, required this.reminder, required this.onTap, this.showOwner = true});

  @override
  Widget build(BuildContext context) {
    final cat = categoryMeta(reminder.category);
    final amount = parseAmountFromNotes(reminder.notes, reminder.amount);
    final status = reminder.statusLabel;
    final daysLeft = reminder.daysLeft;
    final owner = reminder.owner;

    final String dateLine;
    if (reminder.dueDate != null && reminder.dueDate!.isNotEmpty) {
      dateLine = 'Due ${dateShort(reminder.dueDate)}';
    } else if (reminder.renewalDate != null && reminder.renewalDate!.isNotEmpty) {
      dateLine = 'Renew ${dateShort(reminder.renewalDate)}';
    } else {
      dateLine = 'No due date';
    }

    final daysPill = _daysLabel(status, daysLeft, reminder);

    return Card(
      margin: const EdgeInsets.symmetric(vertical: 5),
      elevation: 0,
      color: AppColors.card,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: const BorderSide(color: AppColors.line, width: 1),
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(10, 12, 12, 12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: cat.iconBg,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(cat.icon, size: 20, color: cat.color),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(reminder.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.manrope(
                        fontSize: 14.5,
                        fontWeight: FontWeight.w700,
                        color: AppColors.ink,
                      )),
                    const SizedBox(height: 3),
                    Row(
                      children: [
                        if (showOwner && owner != null && owner.isNotEmpty) ...[
                          Container(
                            width: 5,
                            height: 5,
                            decoration: BoxDecoration(color: ownerColor(owner), shape: BoxShape.circle),
                          ),
                          const SizedBox(width: 5),
                          Flexible(
                            child: Text(owner,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(fontSize: 12, color: AppColors.inkMute)),
                          ),
                          const SizedBox(width: 8),
                        ],
                        const Icon(LucideIcons.calendarClock, size: 13, color: AppColors.inkMute),
                        const SizedBox(width: 4),
                        Flexible(
                          child: Text(dateLine,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 12, color: AppColors.inkMute)),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  if (amount > 0) ...[
                    Text(formatINR(amount),
                      style: GoogleFonts.manrope(fontSize: 13.5, fontWeight: FontWeight.w800, color: AppColors.ink)),
                    const SizedBox(height: 4),
                  ],
                  if (daysPill != null) ...[
                    _badge(daysPill),
                    const SizedBox(height: 4),
                  ],
                  StatusPill(status: status, dense: true),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  String? _daysLabel(String status, int? daysLeft, Reminder r) {
    if (r.paid || status.startsWith('Due') || status == 'Overdue') return null;
    if (daysLeft != null && daysLeft >= 0) return '${daysLeft}d';
    return null;
  }

  Widget _badge(String text) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
      decoration: BoxDecoration(
        color: AppColors.blue.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(text,
        style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.w800, color: AppColors.blue)),
    );
  }
}