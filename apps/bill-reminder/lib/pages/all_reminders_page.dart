import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../models/reminder.dart';
import '../services/reminders_controller.dart';
import '../theme.dart';
import '../widgets/reminder_tile.dart';
import '../widgets/state_views.dart';
import 'notifications_page.dart';

class AllRemindersPage extends StatefulWidget {
  final RemindersController controller;
  final ValueChanged<Reminder> onOpenDetail;
  final String? initialCategory;
  const AllRemindersPage({
    super.key,
    required this.controller,
    required this.onOpenDetail,
    this.initialCategory,
  });

  @override
  State<AllRemindersPage> createState() => _AllRemindersPageState();
}

class _AllRemindersPageState extends State<AllRemindersPage> {
  late final String? _category = widget.initialCategory;
  String _query = '';
  String _filter = 'all';
  int _sortMode = 0;

  int? _daysLeftFor(Reminder r, DateTime today) {
    if (r.daysLeft != null) return r.daysLeft;
    final v = r.effectiveShowDate;
    if (v == null || v.isEmpty) return null;
    final d = DateTime.tryParse(v.substring(0, 10));
    if (d == null) return null;
    final start = DateTime(today.year, today.month, today.day);
    final t = DateTime(d.year, d.month, d.day);
    return t.difference(start).inDays;
  }

  String _bucket(Reminder r, int? dl) {
    if (r.paid) return 'paid';
    if (dl == null) return 'other';
    if (dl < 0) return 'overdue';
    if (dl == 0) return 'today';
    if (dl <= 10) return 'soon';
    return 'upcoming';
  }

  List<Reminder> _apply(List<Reminder> all, DateTime today) {
    var list = all.where((r) => !r.isDeleted).toList();
    if (_category != null) {
      list = list.where((r) => r.category == _category).toList();
    }
    if (_query.trim().isNotEmpty) {
      final q = _query.trim().toLowerCase();
      list = list.where((r) {
        return r.title.toLowerCase().contains(q) ||
            (r.owner?.toLowerCase().contains(q) ?? false) ||
            (r.notes?.toLowerCase().contains(q) ?? false) ||
            categoryLabel(r.category).toLowerCase().contains(q);
      }).toList();
    }
    if (_filter != 'all') {
      list = list.where((r) => _bucket(r, _daysLeftFor(r, today)) == _filter).toList();
    }
    switch (_sortMode) {
      case 1:
        list.sort((a, b) => (parseAmountFromNotes(a.notes, a.amount)).compareTo(parseAmountFromNotes(b.notes, b.amount)));
      case 2:
        list.sort((a, b) => a.title.toLowerCase().compareTo(b.title.toLowerCase()));
      default:
        list.sort((a, b) => (_daysLeftFor(a, today) ?? 9999).compareTo(_daysLeftFor(b, today) ?? 9999));
    }
    return list;
  }

  @override
  Widget build(BuildContext context) {
    final p = AppPalette.of(context);
    return Scaffold(
      backgroundColor: p.bg,
      body: ListenableBuilder(
        listenable: widget.controller,
        builder: (context, _) {
          final today = DateTime.now();
          final all = widget.controller.reminders.where((r) => !r.isDeleted).toList();
          final list = _apply(all, today);

          if (widget.controller.loading && all.isEmpty) {
            return const SizedBox.expand(child: SkeletonList());
          }

          return RefreshIndicator(
            onRefresh: widget.controller.refresh,
            child: CustomScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              slivers: [
                SliverToBoxAdapter(child: _header(all.length, list.length)),
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                    child: _searchField(),
                  ),
                ),
                SliverToBoxAdapter(child: _filterChips()),
                SliverToBoxAdapter(child: _sortRow()),
                if (list.isEmpty)
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.only(top: 60),
                      child: EmptyState(
                        icon: LucideIcons.searchX,
                        title: all.isEmpty ? 'No reminders yet' : 'No matching reminders',
                        subtitle: widget.controller.error,
                      ),
                    ),
                  )
                else
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                    sliver: SliverToBoxAdapter(
                      child: Column(
                        children: [
                          for (final r in list)
                            ReminderTile(reminder: r, onTap: () => widget.onOpenDetail(r)),
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

  Widget _header(int total, int shown) {
    final catLabel = _category == null ? 'All Reminders' : categoryLabel(_category);
    return Container(
      width: double.infinity,
      padding: EdgeInsets.fromLTRB(20, MediaQuery.paddingOf(context).top + 18, 20, 22),
      decoration: const BoxDecoration(
        gradient: kHeaderGradient,
        borderRadius: BorderRadius.vertical(bottom: Radius.circular(28)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(catLabel,
            style: GoogleFonts.hankenGrotesk(fontSize: 22, fontWeight: FontWeight.w800, color: Colors.white)),
          const SizedBox(height: 4),
          Row(
            children: [
              Text(_category != null ? categoryMeta(_category).label : 'Reminders',
                style: TextStyle(fontSize: 13, color: Colors.white.withValues(alpha: 0.7))),
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text('$total',
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: Colors.white.withValues(alpha: 0.9))),
              ),
              if (_query.isNotEmpty || _filter != 'all')
                Padding(
                  padding: const EdgeInsets.only(left: 8),
                  child: Text('showing $shown',
                    style: TextStyle(fontSize: 11.5, color: Colors.white.withValues(alpha: 0.6))),
                ),
              const Spacer(),
              _alertsButton(context),
            ],
          ),
        ],
      ),
    );
  }

  void _openAlerts(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (sheetContext) => MediaQuery.removePadding(
        context: sheetContext,
        removeTop: true,
        child: FractionallySizedBox(
          heightFactor: 0.88,
          child: Container(
            decoration: BoxDecoration(
              color: AppPalette.of(sheetContext).bg,
              borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
            ),
            clipBehavior: Clip.antiAlias,
            child: Column(
              children: [
                const SizedBox(height: 10),
                Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: AppPalette.of(sheetContext).line,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
                Expanded(
                  child: NotificationsPage(
                    controller: widget.controller,
                    onOpenDetail: (r) {
                      Navigator.pop(sheetContext);
                      widget.onOpenDetail(r);
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

  Widget _alertsButton(BuildContext context) {
    final unread = widget.controller.notifications.where((n) => !n.read).length;
    return Stack(
      clipBehavior: Clip.none,
      children: [
        InkWell(
          onTap: () => _openAlerts(context),
          borderRadius: BorderRadius.circular(12),
          child: Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.14),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Icon(LucideIcons.bellRing, size: 18, color: Colors.white),
          ),
        ),
        if (unread > 0)
          Positioned(
            right: -4,
            top: -4,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
              decoration: BoxDecoration(
                color: const Color(0xFFdc2626),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: Colors.white, width: 1.4),
              ),
              child: Text('$unread',
                style: const TextStyle(fontSize: 9.5, fontWeight: FontWeight.w800, color: Colors.white)),
            ),
          ),
      ],
    );
  }

  Widget _searchField() {
    final p = AppPalette.of(context);
    return TextField(
      onChanged: (v) => setState(() => _query = v),
      style: TextStyle(fontSize: 14, color: p.ink),
      decoration: InputDecoration(
        hintText: 'Search title, owner, category…',
        hintStyle: const TextStyle(fontSize: 13.5),
        prefixIcon: Icon(LucideIcons.search, size: 19, color: p.inkMute),
        suffixIcon: _query.isNotEmpty
            ? IconButton(
                icon: Icon(LucideIcons.x, size: 17, color: p.inkMute),
                onPressed: () => setState(() => _query = ''),
              )
            : null,
        filled: true,
        fillColor: p.field,
        contentPadding: const EdgeInsets.symmetric(vertical: 12),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(color: p.line),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(color: p.blue, width: 1.4),
        ),
      ),
    );
  }

  Widget _filterChips() {
    final p = AppPalette.of(context);
    const filters = [
      ('all', 'All'),
      ('overdue', 'Overdue'),
      ('today', 'Due Today'),
      ('soon', 'Due Soon'),
      ('upcoming', 'Upcoming'),
      ('paid', 'Paid'),
    ];
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 4),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: [
            for (final (key, label) in filters)
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: ChoiceChip(
                  label: Text(label,
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: _filter == key ? p.onBlue : p.inkSoft,
                    )),
                  selected: _filter == key,
                  onSelected: (_) => setState(() => _filter = key),
                  selectedColor: p.blue,
                  backgroundColor: p.card,
                  side: BorderSide(color: _filter == key ? p.blue : p.line),
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 6),
                  showCheckmark: false,
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _sortRow() {
    final p = AppPalette.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
      child: Row(
        children: [
          Icon(LucideIcons.arrowUpDown, size: 14, color: p.inkMute),
          const SizedBox(width: 6),
          Text('Sort', style: TextStyle(fontSize: 12, color: p.inkMute)),
          const SizedBox(width: 10),
          for (final (i, label) in const [(0, 'Soonest'), (1, 'Amount'), (2, 'Name')])
            Padding(
              padding: const EdgeInsets.only(right: 6),
              child: _tinyToggle(label: label, selected: _sortMode == i, onTap: () => setState(() => _sortMode = i)),
            ),
        ],
      ),
    );
  }

  Widget _tinyToggle({required String label, required bool selected, required VoidCallback onTap}) {
    final p = AppPalette.of(context);
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          color: selected ? p.blue.withValues(alpha: 0.1) : Colors.transparent,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: selected ? p.blue.withValues(alpha: 0.4) : p.line),
        ),
        child: Text(label,
          style: TextStyle(
            fontSize: 11.5,
            fontWeight: FontWeight.w700,
            color: selected ? p.blue : p.inkMute,
          )),
      ),
    );
  }
}