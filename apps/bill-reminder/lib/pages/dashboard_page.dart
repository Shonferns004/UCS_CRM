import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../models/reminder.dart';
import '../services/reminders_controller.dart';
import '../theme.dart';
import '../widgets/state_views.dart';
import '../widgets/status_pill.dart';

class DashboardPage extends StatelessWidget {
  final RemindersController controller;
  final ValueChanged<Reminder> onOpenDetail;
  const DashboardPage({super.key, required this.controller, required this.onOpenDetail});

  DateTime? _parse(String? v) {
    if (v == null || v.isEmpty) return null;
    final s = v.substring(0, 10);
    return DateTime.tryParse(s);
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
    if (ft == 'WEEK') {
      final ld = _parse(r.dueDate);
      return (ld != null && ld.month == today.month && ld.year == today.year) ? ld : null;
    }
    final ld = _parse(r.dueDate) ?? _parse(r.renewalDate);
    return (ld != null && ld.month == today.month && ld.year == today.year) ? ld : null;
  }

  int? _daysLeftFor(Reminder r, DateTime today) {
    if (r.daysLeft != null) return r.daysLeft;
    final ref = _parse(r.effectiveShowDate);
    if (ref == null) return null;
    final start = DateTime(today.year, today.month, today.day);
    final target = DateTime(ref.year, ref.month, ref.day);
    return target.difference(start).inDays;
  }

  String _bucket(Reminder r, int? dl) {
    if (r.paid) return 'paid';
    if (dl == null) return 'off';
    if (dl < 0) return 'overdue';
    if (dl == 0) return 'today';
    if (dl <= 7) return 'week';
    if (dl <= 30) return 'month';
    return 'later';
  }

  @override
  Widget build(BuildContext context) {
    final p = AppPalette.of(context);
    return Scaffold(
      backgroundColor: p.bg,
      body: ListenableBuilder(
        listenable: controller,
        builder: (context, _) {
          final today = DateTime.now();
          final reminders = controller.reminders.where((r) => !r.isDeleted).toList();

          // ---- stats ----
          int overdue = 0, dueToday = 0, dueSoon = 0;
          double overdueAmt = 0, dueTodayAmt = 0, dueSoonAmt = 0;
          Set<String> owners = {};
          for (final r in reminders) {
            final dl = _daysLeftFor(r, today);
            final amt = parseAmountFromNotes(r.notes, r.amount);
            if (r.owner != null && r.owner!.isNotEmpty) owners.add(r.owner!);
            final b = _bucket(r, dl);
            if (b == 'overdue') { overdue++; overdueAmt += amt; }
            else if (b == 'today') { dueToday++; dueTodayAmt += amt; }
            else if (b == 'week') { dueSoon++; dueSoonAmt += amt; }
          }

          double monthlyTotal = 0, monthlyPaid = 0, monthlyPending = 0, monthlyOverdue = 0;
          int paidThisMonth = 0;
          for (final r in reminders) {
            final amt = parseAmountFromNotes(r.notes, r.amount);
            final cm = _currentMonthDate(r, today);
            if (cm == null) continue;
            final dl = _daysLeftFor(r, today);
            if (r.paid) { monthlyPaid += amt; paidThisMonth++; }
            else if (dl != null && dl < 0) { monthlyOverdue += amt; }
            else { monthlyPending += amt; }
            monthlyTotal += amt;
          }
          final paidPct = monthlyTotal > 0 ? (monthlyPaid / monthlyTotal).clamp(0.0, 1.0).toDouble() : 0.0;

          // ---- upcoming (next 7 / 30 days) grouped by category ----
          final upItems = reminders
              .where((r) => { 'week', 'month' }.contains(_bucket(r, _daysLeftFor(r, today))))
              .toList()
            ..sort((a, b) => (_daysLeftFor(a, today) ?? 999).compareTo(_daysLeftFor(b, today) ?? 999));
          final up30 = upItems.where((r) => (_daysLeftFor(r, today) ?? 999) <= 30).toList();

          // ---- renewals next 60 days ----
          final renewals = reminders.where((r) {
            if (r.paid) return false;
            final rd = _parse(r.renewalDate);
            if (rd == null) return false;
            final dl = _daysLeftFor(r, today) ?? 0;
            return dl >= -30 && dl <= 60 && r.renewalDate != null;
          }).toList()
            ..sort((a, b) => (_daysLeftFor(a, today) ?? 999).compareTo(_daysLeftFor(b, today) ?? 999));

          if (controller.loading && reminders.isEmpty) {
            return RefreshIndicator(
              onRefresh: controller.refresh,
              child: const CustomScrollView(
                physics: AlwaysScrollableScrollPhysics(),
                slivers: [SliverFillRemaining(hasScrollBody: false, child: SkeletonList())],
              ),
            );
          }
          if (controller.error != null && reminders.isEmpty) {
            return RefreshIndicator(
              onRefresh: controller.refresh,
              child: ErrorState(message: controller.error!, onRetry: controller.refresh),
            );
          }

          final totalCount = reminders.length;

          return RefreshIndicator(
            onRefresh: controller.refresh,
            child: CustomScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              slivers: [
                SliverToBoxAdapter(
                  child: _gradientHeader(context,
                    totalCount: totalCount,
                    owners: owners.length,
                    syncedAt: controller.syncedAt,
                  ),
                ),
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
                  sliver: SliverToBoxAdapter(
                    child: Row(
                      children: [
                        Expanded(
                          child: KpiCard(
                            label: 'Overdue',
                            value: '$overdue',
                            sub: formatINR(overdueAmt),
                            icon: LucideIcons.alertOctagon,
                            color: p.danger,
                            onTap: () => onOpenDetail(reminders.first),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: KpiCard(
                            label: 'Due Today',
                            value: '$dueToday',
                            sub: formatINR(dueTodayAmt),
                            icon: LucideIcons.clock,
                            color: const Color(0xFFea580c),
                            onTap: () => onOpenDetail(reminders.first),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                  sliver: SliverToBoxAdapter(
                    child: Row(
                      children: [
                        Expanded(
                          child: KpiCard(
                            label: 'Due in 7 days',
                            value: '$dueSoon',
                            sub: formatINR(dueSoonAmt),
                            icon: LucideIcons.bellRing,
                            color: const Color(0xFFd97706),
                            onTap: () => onOpenDetail(reminders.first),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: KpiCard(
                            label: 'Paid this month',
                            value: '$paidThisMonth',
                            sub: formatINR(monthlyPaid),
                            icon: LucideIcons.checkCircle2,
                            color: p.green,
                            onTap: () => onOpenDetail(reminders.first),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                SliverPadding(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  sliver: SliverToBoxAdapter(
                    child: _MonthlySummary(
                      monthlyTotal: monthlyTotal,
                      monthlyPaid: monthlyPaid,
                      monthlyPending: monthlyPending,
                      monthlyOverdue: monthlyOverdue,
                      paidPct: paidPct,
                    ),
                  ),
                ),
                SliverPadding(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  sliver: SliverToBoxAdapter(
                    child: _UpcomingSection(
                      reminders: up30,
                      daysLeftFor: (r) => _daysLeftFor(r, today) ?? 999,
                      onOpenDetail: onOpenDetail,
                    ),
                  ),
                ),
                if (renewals.isNotEmpty)
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                    sliver: SliverToBoxAdapter(
                      child: _RenewalSection(
                        renewals: renewals,
                        daysLeftFor: (r) => _daysLeftFor(r, today) ?? 999,
                        onOpenDetail: onOpenDetail,
                      ),
                    ),
                  )
                else
                  const SliverPadding(padding: EdgeInsets.only(bottom: 24)),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _gradientHeader(BuildContext context, {
    required int totalCount,
    required int owners,
    required DateTime? syncedAt,
  }) {
    final today = DateTime.now();
    return Container(
      padding: EdgeInsets.fromLTRB(20, MediaQuery.paddingOf(context).top + 18, 20, 26),
      decoration: const BoxDecoration(
        gradient: kHeaderGradient,
        borderRadius: BorderRadius.vertical(bottom: Radius.circular(28)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: const Icon(LucideIcons.walletCards, color: Colors.white, size: 24),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Bill Reminder',
                      style: GoogleFonts.hankenGrotesk(
                        fontSize: 20, fontWeight: FontWeight.w800, color: Colors.white,
                      )),
                    Text(DateFormat('EEEE, d MMMM yyyy').format(today),
                      style: TextStyle(fontSize: 12.5, color: Colors.white.withValues(alpha: 0.65))),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Row(
                  children: [
                    const Icon(LucideIcons.layers, size: 15, color: Colors.white),
                    const SizedBox(width: 6),
                    Text('$totalCount',
                      style: GoogleFonts.hankenGrotesk(
                        fontSize: 16, fontWeight: FontWeight.w800, color: Colors.white)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 18),
          Row(
            children: [
              _headerChip(LucideIcons.users, '$owners owners', Colors.white.withValues(alpha: 0.12)),
              const SizedBox(width: 8),
              _headerChip(LucideIcons.refreshCw,
                syncedAt != null ? 'Synced ${DateFormat('h:mm a').format(syncedAt)}' : 'Syncing…',
                const Color(0x3322c55e)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _headerChip(IconData icon, String text, Color bg) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(10)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 13, color: Colors.white70),
          const SizedBox(width: 5),
          Text(text, style: const TextStyle(fontSize: 12, color: Colors.white)),
        ],
      ),
    );
  }
}

class _MonthlySummary extends StatelessWidget {
  final double monthlyTotal;
  final double monthlyPaid;
  final double monthlyPending;
  final double monthlyOverdue;
  final double paidPct;
  const _MonthlySummary({
    required this.monthlyTotal,
    required this.monthlyPaid,
    required this.monthlyPending,
    required this.monthlyOverdue,
    required this.paidPct,
  });

  @override
  Widget build(BuildContext context) {
    final p = AppPalette.of(context);
    final monthLabel = DateFormat('MMMM yyyy').format(DateTime.now());
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: p.card,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: p.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(LucideIcons.pieChart, size: 16, color: p.blue),
              const SizedBox(width: 8),
              Text('Monthly Summary',
                style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5, color: p.ink)),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                decoration: BoxDecoration(
                  color: p.blue.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(monthLabel,
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: p.blue)),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              SizedBox(
                width: 74,
                height: 74,
                child: CustomPaint(
                  painter: _RingPainter(progress: paidPct, color: p.green, bgColor: p.line),
                  child: Center(
                    child: Text('${(paidPct * 100).round()}%',
                      style: GoogleFonts.hankenGrotesk(fontSize: 17, fontWeight: FontWeight.w800, color: p.ink)),
                  ),
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(paidPct >= 1 ? 'All cleared this month' : 'On track to clear this month',
                      style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: p.ink)),
                    const SizedBox(height: 4),
                    Text('${formatINR(monthlyPaid)} of ${formatINR(monthlyTotal)} billed',
                      style: TextStyle(fontSize: 12.5, color: p.inkMute)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Divider(color: p.line, height: 1),
          const SizedBox(height: 14),
          Row(
            children: [
              _finCard('PAID', monthlyPaid, p.green, LucideIcons.checkCircle2, p),
              const SizedBox(width: 8),
              _finCard('PENDING', monthlyPending, const Color(0xFFd97706), LucideIcons.clock, p),
              const SizedBox(width: 8),
              _finCard('OVERDUE', monthlyOverdue, p.danger, LucideIcons.alertTriangle, p),
            ],
          ),
        ],
      ),
    );
  }

  Widget _finCard(String label, double amount, Color color, IconData icon, AppPalette p) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: color.withValues(alpha: 0.2)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(icon, size: 13, color: color),
                const SizedBox(width: 5),
                Text(label,
                  style: TextStyle(fontSize: 9.5, fontWeight: FontWeight.w800, letterSpacing: 0.5, color: color)),
              ],
            ),
            const SizedBox(height: 6),
            Text(formatCompactINR(amount),
              maxLines: 1,
              style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: p.ink)),
          ],
        ),
      ),
    );
  }
}

class _UpcomingSection extends StatelessWidget {
  final List<Reminder> reminders;
  final int Function(Reminder) daysLeftFor;
  final ValueChanged<Reminder> onOpenDetail;
  const _UpcomingSection({required this.reminders, required this.daysLeftFor, required this.onOpenDetail});

  @override
  Widget build(BuildContext context) {
    final p = AppPalette.of(context);
    final map = <String, List<Reminder>>{};
    for (final r in reminders) {
      final key = categoryLabel(r.category);
      map.putIfAbsent(key, () => []).add(r);
    }
    final groups = map.entries.toList()..sort((a, b) => (daysLeftFor(a.value.first)).compareTo(daysLeftFor(b.value.first)));
    final total = reminders.fold<double>(0, (s, r) => s + parseAmountFromNotes(r.notes, r.amount));

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: p.card,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: p.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(LucideIcons.calendarRange, size: 16, color: p.blue),
              const SizedBox(width: 8),
              Text('Upcoming · 30 days',
                style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5, color: p.ink)),
              const Spacer(),
              Text('${reminders.length} · ${formatCompactINR(total)}',
                style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: p.inkMute)),
            ],
          ),
          const SizedBox(height: 12),
          if (reminders.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 10),
              child: Text('Nothing due in the next 30 days',
                style: TextStyle(fontSize: 13, color: p.inkMute)),
            )
          else
            for (final e in groups.take(6)) _UpRow(groupKey: e.key, items: e.value, daysLeftFor: daysLeftFor),
        ],
      ),
    );
  }
}

class _UpRow extends StatelessWidget {
  final String groupKey;
  final List<Reminder> items;
  final int Function(Reminder) daysLeftFor;
  const _UpRow({required this.groupKey, required this.items, required this.daysLeftFor});

  @override
  Widget build(BuildContext context) {
    final p = AppPalette.of(context);
    final dl = daysLeftFor(items.first);
    final amt = items.fold<double>(0, (s, r) => s + parseAmountFromNotes(r.notes, r.amount));
    final cat = categoryMeta(items.first.category);
    final owners = items.map((r) => r.owner).whereType<String>().toSet().join(' · ');
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: p.bg,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(color: cat.iconBg, borderRadius: BorderRadius.circular(9)),
            child: Icon(cat.icon, size: 16, color: cat.color),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(groupKey,
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: p.ink)),
                Text(owners,
                  maxLines: 1, overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 11, color: p.inkMute)),
              ],
            ),
          ),
          if (items.length > 1)
            Container(
              margin: const EdgeInsets.only(right: 8),
              padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
              decoration: BoxDecoration(color: p.bg, borderRadius: BorderRadius.circular(10)),
              child: Text('${items.length}',
                style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w800, color: p.inkSoft)),
            ),
          Text(formatCompactINR(amt),
            style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: p.ink)),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: dl <= 3 ? const Color(0xFFea580c).withValues(alpha: 0.12) : p.blue.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Text('${dl}d',
              style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800,
                color: dl <= 3 ? const Color(0xFFea580c) : p.blue)),
          ),
        ],
      ),
    );
  }
}

class _RenewalSection extends StatelessWidget {
  final List<Reminder> renewals;
  final int Function(Reminder) daysLeftFor;
  final ValueChanged<Reminder> onOpenDetail;
  const _RenewalSection({required this.renewals, required this.daysLeftFor, required this.onOpenDetail});

  @override
  Widget build(BuildContext context) {
    final p = AppPalette.of(context);
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: p.card,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: p.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(LucideIcons.refreshCcw, size: 16, color: Color(0xFF7c3aed)),
              const SizedBox(width: 8),
              Text('Renewal Tracker',
                style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5, color: p.ink)),
              const Spacer(),
              Text('${renewals.length}',
                style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: p.inkMute)),
            ],
          ),
          const SizedBox(height: 12),
          for (final r in renewals.take(6))
            InkWell(
              onTap: () => onOpenDetail(r),
              borderRadius: BorderRadius.circular(10),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 7),
                child: Row(
                  children: [
                    Icon(categoryMeta(r.category).icon, size: 15, color: categoryMeta(r.category).color),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(r.title,
                            maxLines: 1, overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: p.ink)),
                          Text('${categoryLabel(r.category)} · ${r.owner ?? '—'}',
                            maxLines: 1, overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontSize: 11, color: p.inkMute)),
                        ],
                      ),
                    ),
                    Text(dateShort(r.renewalDate),
                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: p.inkSoft)),
                    const SizedBox(width: 8),
                    const StatusPill(status: 'Due Soon', dense: true),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _RingPainter extends CustomPainter {
  final double progress;
  final Color color;
  final Color bgColor;
  _RingPainter({required this.progress, required this.color, required this.bgColor});

  @override
  void paint(Canvas canvas, Size size) {
    const stroke = 10.0;
    final center = Offset(size.width / 2, size.height / 2);
    final radius = (size.width - stroke) / 2;
    final bg = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..strokeCap = StrokeCap.round
      ..color = bgColor;
    canvas.drawCircle(center, radius, bg);
    final fg = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..strokeCap = StrokeCap.round
      ..color = color;
    canvas.drawArc(Rect.fromCircle(center: center, radius: radius), -1.5707963, progress.clamp(0.0, 1.0) * 6.2831853, false, fg);
  }

  @override
  bool shouldRepaint(covariant _RingPainter old) =>
      old.progress != progress || old.color != color || old.bgColor != bgColor;
}