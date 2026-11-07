import 'package:flutter/material.dart';

import '../models/dashboard.dart';
import '../theme.dart';

/// The AKI incentive calendar from the web panel's `IncentiveCalendar` — a
/// 7-column month grid where each eligible day (AKI > 0) is highlighted green
/// and shows its collection and AKI badge.
class AkiCalendar extends StatelessWidget {
  final List<AkiDay> akiPerDay;
  final String monthStr; // 'YYYY-MM'
  final bool onlyEligible;

  const AkiCalendar({
    super.key,
    required this.akiPerDay,
    required this.monthStr,
    this.onlyEligible = false,
  });

  static String _pad2(int n) => n.toString().padLeft(2, '0');

  @override
  Widget build(BuildContext context) {
    final parts = monthStr.split('-');
    if (parts.length != 2) return _noData();
    final y = int.tryParse(parts[0]);
    final m = int.tryParse(parts[1]);
    if (y == null || m == null) return _noData();

    final daysInMonth = DateTime(y, m + 1, 0).day;
    final firstDay = DateTime(y, m, 1).weekday % 7; // Sun=0
    final akiMap = <String, AkiDay>{for (final r in akiPerDay) r.date: r};

    final now = DateTime.now();
    final todayStr = '$y-${_pad2(m)}-${_pad2(now.day)}';

    final children = <Widget>[
      for (var i = 0; i < firstDay; i++) const SizedBox.shrink(),
      for (var d = 1; d <= daysInMonth; d++)
        _cell(d, y, m, akiMap, onlyEligible, todayStr),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            for (final w in const ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'])
              Expanded(
                child: Center(
                  child: Text(
                    w,
                    style: const TextStyle(
                      fontSize: 9,
                      fontWeight: FontWeight.w700,
                      color: AppColors.inkSoft,
                    ),
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 4),
        GridView.count(
          crossAxisCount: 7,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 4,
          crossAxisSpacing: 4,
          childAspectRatio: 0.8,
          children: children,
        ),
        const SizedBox(height: 6),
        const Wrap(
          spacing: 12,
          children: [
            _Legend(
                color: Color(0xFFDCFCE7),
                border: Color(0xFF86EFAC),
                label: 'Eligible (AKI earned)'),
            _Legend(
                color: Color(0xFFF8FAFC),
                border: Color(0xFFE2E8F0),
                label: 'No AKI'),
          ],
        ),
      ],
    );
  }

  Widget _noData() => const Text('No month data',
      style: TextStyle(fontSize: 11, color: AppColors.inkSoft));

  Widget _cell(int d, int y, int m, Map<String, AkiDay> akiMap,
      bool onlyEligible, String todayStr) {
    final dateStr = '$y-${_pad2(m)}-${_pad2(d)}';
    final rec = akiMap[dateStr];
    final aki = rec?.aki ?? 0;
    final eligible = aki > 0;
    if (onlyEligible && !eligible) return const SizedBox.shrink();
    final isToday = dateStr == todayStr;
    final collection = rec?.collection ?? 0;

    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(6),
        border: Border.all(
          color: eligible ? const Color(0xFF86EFAC) : const Color(0xFFE2E8F0),
          width: 1.5,
        ),
        gradient: eligible
            ? const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [Color(0xFFDCFCE7), Color(0xFFF0FDF4)],
              )
            : null,
        color: eligible ? null : const Color(0xFFF8FAFC),
      ),
      child: Stack(
        children: [
          if (isToday)
            Positioned.fill(
              child: Container(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(color: AppColors.sage, width: 2),
                ),
              ),
            ),
          Center(
            child: FittedBox(
              fit: BoxFit.scaleDown,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    '$d',
                    style: TextStyle(
                      fontSize: 9.5,
                      fontWeight: FontWeight.w800,
                      color: eligible
                          ? const Color(0xFF166534)
                          : const Color(0xFF94A3B8),
                      height: 1.1,
                    ),
                  ),
                  if (rec != null)
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 1),
                      child: Text(
                        formatCurrency(collection),
                        style: TextStyle(
                          fontSize: 9,
                          fontWeight: FontWeight.w800,
                          color: eligible
                              ? const Color(0xFF14532D)
                              : const Color(0xFF334155),
                          height: 1.1,
                        ),
                      ),
                    ),
                  if (aki > 0)
                    Container(
                      margin: const EdgeInsets.only(top: 1),
                      padding:
                          const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                      decoration: BoxDecoration(
                        color: const Color(0xFFBBF7D0),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        'AKI ₹$aki',
                        style: const TextStyle(
                          fontSize: 7,
                          fontWeight: FontWeight.w800,
                          color: Color(0xFF166534),
                          height: 1.1,
                        ),
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
}

class _Legend extends StatelessWidget {
  final Color color;
  final Color border;
  final String label;
  const _Legend(
      {required this.color, required this.border, required this.label});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 10,
          height: 10,
          decoration: BoxDecoration(
            color: color,
            borderRadius: BorderRadius.circular(3),
            border: Border.all(color: border),
          ),
        ),
        const SizedBox(width: 4),
        Text(label,
            style: const TextStyle(fontSize: 9, color: AppColors.inkSoft)),
      ],
    );
  }
}
