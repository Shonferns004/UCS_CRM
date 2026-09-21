import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../models/reminder.dart';
import '../services/reminders_controller.dart';
import '../theme.dart';
import 'all_reminders_page.dart';

class CategoriesPage extends StatelessWidget {
  final RemindersController controller;
  final ValueChanged<Reminder> onOpenDetail;
  const CategoriesPage({super.key, required this.controller, required this.onOpenDetail});

  DateTime? _parse(String? v) {
    if (v == null || v.isEmpty) return null;
    return DateTime.tryParse(v.substring(0, 10));
  }

  DateTime? _currentMonthDate(Reminder r, DateTime today) {
    final ft = r.frequencyType;
    if (ft == 'DAY') return DateTime(today.year, today.month, today.day);
    if (ft == 'MONTH') {
      final ref = _parse(r.dueDate) ?? today;
      final dom = r.dayOfMonth ?? ref.day;
      final last = DateTime(today.year, today.month + 1, 0).day;
      return DateTime(today.year, today.month, dom.clamp(1, last));
    }
    if (ft == 'YEAR') {
      final ref = _parse(r.dueDate) ?? today;
      final mo = r.monthOfYear ?? ref.month;
      final dom = r.dayOfMonth ?? ref.day;
      final last = DateTime(today.year, mo.clamp(1, 12) + 1, 0).day;
      return DateTime(today.year, mo.clamp(1, 12), dom.clamp(1, last));
    }
    final ld = _parse(r.dueDate) ?? _parse(r.renewalDate);
    return (ld != null && ld.month == today.month && ld.year == today.year) ? ld : null;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      body: ListenableBuilder(
        listenable: controller,
        builder: (context, _) {
          final today = DateTime.now();
          final all = controller.reminders.where((r) => !r.isDeleted).toList();
          final byCat = <String, List<Reminder>>{};
          for (final r in all) {
            byCat.putIfAbsent(r.category ?? 'OTHER_BILL', () => []).add(r);
          }

          return RefreshIndicator(
            onRefresh: controller.refresh,
            child: CustomScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              slivers: [
                SliverToBoxAdapter(
                  child: Container(
                    width: double.infinity,
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
                        Text('Categories',
                          style: GoogleFonts.hankenGrotesk(fontSize: 22, fontWeight: FontWeight.w800, color: Colors.white)),
                        const SizedBox(height: 4),
                        Text('${all.length} reminders across ${byCat.length} categories',
                          style: TextStyle(fontSize: 13, color: Colors.white.withValues(alpha: 0.7))),
                      ],
                    ),
                  ),
                ),
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(16, 14, 16, 24),
                  sliver: SliverToBoxAdapter(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        for (final group in kGroups) ...[
                          Padding(
                            padding: const EdgeInsets.fromLTRB(4, 10, 4, 10),
                            child: Row(
                              children: [
                                Icon(group.icon, size: 15, color: group.color),
                                const SizedBox(width: 8),
                                Text(group.label,
                                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800, letterSpacing: 0.3, color: AppColors.inkSoft)),
                              ],
                            ),
                          ),
                          for (final cat in group.cats)
                            if (byCat.containsKey(cat))
                              Padding(
                                padding: const EdgeInsets.only(bottom: 10),
                                child: _CategoryCard(
                                  catId: cat,
                                  reminders: byCat[cat]!,
                                  monthDate: (r) => _currentMonthDate(r, today),
                                  today: today,
                                  onTap: () {
                                    Navigator.of(context).push(MaterialPageRoute(
                                      builder: (_) => AllRemindersPage(
                                        controller: controller,
                                        onOpenDetail: onOpenDetail,
                                        initialCategory: cat,
                                      ),
                                    ));
                                  },
                                ),
                              ),
                          const SizedBox(height: 8),
                        ],
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
}

class _CategoryCard extends StatelessWidget {
  final String catId;
  final List<Reminder> reminders;
  final DateTime? Function(Reminder) monthDate;
  final DateTime today;
  final VoidCallback onTap;
  const _CategoryCard({
    required this.catId,
    required this.reminders,
    required this.monthDate,
    required this.today,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final meta = categoryMeta(catId);
    double monthly = 0, paid = 0, overdueAmt = 0;
    int overdueCount = 0;
    for (final r in reminders) {
      final amt = parseAmountFromNotes(r.notes, r.amount);
      if (monthDate(r) != null) monthly += amt;
      if (r.paid) paid += amt;
      if (r.daysLeft != null && r.daysLeft! < 0 && !r.paid) {
        overdueAmt += amt;
        overdueCount++;
      }
      if (r.daysLeft == null) {
        final ed = r.effectiveShowDate;
        if (ed != null && ed.isNotEmpty) {
          final d = DateTime.tryParse(ed.substring(0, 10));
          if (d != null && !r.paid) {
            final start = DateTime(today.year, today.month, today.day);
            final t = DateTime(d.year, d.month, d.day);
            if (t.difference(start).inDays < 0) overdueAmt += amt;
          }
        }
      }
    }
    final pct = monthly > 0 ? (paid / monthly).clamp(0.0, 1.0).toDouble() : 0.0;

    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.line),
          ),
          child: Row(
            children: [
              Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(color: meta.iconBg, borderRadius: BorderRadius.circular(13)),
                child: Icon(meta.icon, size: 20, color: meta.color),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(meta.label,
                      style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w800, color: AppColors.ink)),
                    const SizedBox(height: 3),
                    Row(
                      children: [
                        Text('${reminders.length} reminders',
                          style: const TextStyle(fontSize: 12, color: AppColors.inkMute)),
                        if (overdueCount > 0) ...[
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                            decoration: BoxDecoration(
                              color: const Color(0xFFdc2626).withValues(alpha: 0.08),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Text('$overdueCount overdue',
                              style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, color: Color(0xFFdc2626))),
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 10),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(4),
                      child: LinearProgressIndicator(
                        value: pct,
                        minHeight: 4,
                        backgroundColor: AppColors.line,
                        valueColor: AlwaysStoppedAnimation(meta.color),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(formatCompactINR(monthly),
                    style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: AppColors.ink)),
                  const SizedBox(height: 2),
                  Text(overdueAmt > 0 ? '${formatCompactINR(overdueAmt)} due' : 'fully paid',
                    style: TextStyle(
                      fontSize: 10.5,
                      fontWeight: FontWeight.w700,
                      color: overdueAmt > 0 ? const Color(0xFFdc2626) : const Color(0xFF16a34a),
                    )),
                  const SizedBox(height: 6),
                  const Icon(LucideIcons.chevronRight, size: 16, color: AppColors.inkMute),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}