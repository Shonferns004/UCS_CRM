import 'package:flutter/material.dart';

import '../theme/app_palette.dart';

class MiniCalendar extends StatelessWidget {
  final int year;
  final int month;
  final Map<String, String> statusByDate;
  final String? selectedDate;
  final ValueChanged<String>? onDateSelected;
  final Map<String, List<String>> calendarDates;
  final Set<String> deductedSundays;
  final Set<String> forfeitedHolidays;

  const MiniCalendar({
    super.key,
    required this.year,
    required this.month,
    this.statusByDate = const {},
    this.selectedDate,
    this.onDateSelected,
    this.calendarDates = const {},
    this.deductedSundays = const {},
    this.forfeitedHolidays = const {},
  });

  @override
  Widget build(BuildContext context) {
    const weekdays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    final firstDay = DateTime(year, month, 1).weekday % 7;
    final monthDays = DateTime(year, month + 1, 0).day;
    final now = DateTime.now();
    final isCurrentMonth = now.year == year && now.month == month;
    final weeks = (firstDay + monthDays + 6) ~/ 7;

    return Column(
      children: [
        Row(
          children: weekdays
              .map(
                (d) => Expanded(
                  child: Center(
                    child: Text(
                      d,
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.5,
                        color: AppPalette.muted.withValues(alpha: 0.8),
                      ),
                    ),
                  ),
                ),
              )
              .toList(),
        ),
        const SizedBox(height: 6),
        ...List.generate(weeks, (row) {
          return Row(
            children: List.generate(7, (col) {
              final dayNum = row * 7 + col - firstDay + 1;
              if (dayNum < 1 || dayNum > monthDays) {
                return const Expanded(
                  child: Padding(
                    padding: EdgeInsets.all(2),
                    child: AspectRatio(aspectRatio: 1, child: SizedBox()),
                  ),
                );
              }

              final key =
                  '${year}-${month.toString().padLeft(2, '0')}-${dayNum.toString().padLeft(2, '0')}';
              final status = statusByDate[key];
              final calTypes = calendarDates[key] ?? <String>[];
              // A declared holiday is a paid day. Attendance history has no row
              // for it, so without this override a weekday holiday falls into
              // the red “no status = absent” branch below.
              final effectiveStatus = forfeitedHolidays.contains(key)
                  ? 'absent'
                  : calTypes.contains('holiday') &&
                        (status == null ||
                            status == 'absent' ||
                            status == 'leave')
                  ? 'holiday'
                  : status;
              final wd = DateTime(year, month, dayNum).weekday;
              final isToday = isCurrentMonth && dayNum == now.day;
              final isFuture =
                  isCurrentMonth && dayNum > now.day ||
                  (year == now.year && month > now.month) ||
                  year > now.year;

              Color? bg;
              Color? fg;
              var filled = false;

              if (effectiveStatus != null) {
                switch (effectiveStatus) {
                  case 'present':
                    bg = AppPalette.successSoft;
                    fg = AppPalette.success;
                    filled = true;
                    break;
                  case 'absent':
                    bg = const Color(0xFFFDEAEA);
                    fg = const Color(0xFFB42318);
                    filled = true;
                    break;
                  case 'late':
                    bg = const Color(0xFFFFF3E0);
                    fg = const Color(0xFF8A4B08);
                    filled = true;
                    break;
                  case 'leave':
                    bg = AppPalette.aquaSoft;
                    fg = AppPalette.aquaDeep;
                    filled = true;
                    break;
                  case 'half-day':
                    bg = const Color(0xFFF3E8FF);
                    fg = const Color(0xFF7E22CE);
                    filled = true;
                    break;
                  case 'holiday':
                    bg = AppPalette.iceDeep;
                    fg = AppPalette.ocean;
                    filled = true;
                    break;
                }
              }

              // A Sunday cut by the salary rules is highlighted in red.
              if (deductedSundays.contains(key)) {
                bg = const Color(0xFFFDEAEA);
                fg = const Color(0xFFB42318);
                filled = true;
              }

              if (isToday && !filled) {
                bg = AppPalette.aquaSoft;
                fg = AppPalette.aquaDeep;
              }

              if (!filled && (wd == DateTime.sunday || isFuture)) {
                fg = AppPalette.muted.withValues(alpha: 0.4);
              } else if (!filled &&
                  !isToday &&
                  !isFuture &&
                  wd != DateTime.sunday) {
                bg = const Color(0xFFFDEAEA);
                fg = const Color(0xFFB42318);
              }

              final isSelected = selectedDate == key;

              return Expanded(
                child: Padding(
                  padding: const EdgeInsets.all(2),
                  child: AspectRatio(
                    aspectRatio: 1,
                    child: GestureDetector(
                      onTap: onDateSelected != null
                          ? () => onDateSelected!(key)
                          : null,
                      child: Container(
                        decoration: BoxDecoration(
                          color: isSelected ? AppPalette.ocean : bg,
                          borderRadius: BorderRadius.circular(13),
                        ),
                        child: Stack(
                          alignment: Alignment.center,
                          children: [
                            Text(
                              '$dayNum',
                              style: TextStyle(
                                fontSize: 12.5,
                                fontWeight: isSelected || filled || isToday
                                    ? FontWeight.w700
                                    : FontWeight.w500,
                                color: isSelected
                                    ? Colors.white
                                    : (fg ?? AppPalette.ink),
                              ),
                            ),
                            if (calTypes.isNotEmpty)
                              Positioned(
                                bottom: 4,
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    for (final type in calTypes.take(3))
                                      Container(
                                        width: 3.5,
                                        height: 3.5,
                                        margin: const EdgeInsets.symmetric(
                                          horizontal: 1,
                                        ),
                                        decoration: BoxDecoration(
                                          shape: BoxShape.circle,
                                          color: isSelected
                                              ? Colors.white.withValues(
                                                  alpha: 0.8,
                                                )
                                              : type == 'birthday'
                                              ? const Color(0xFFF59E0B)
                                              : type == 'holiday'
                                              ? AppPalette.ocean
                                              : AppPalette.aquaDeep,
                                        ),
                                      ),
                                  ],
                                ),
                              ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              );
            }),
          );
        }),
      ],
    );
  }
}
