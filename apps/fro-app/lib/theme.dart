import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';

class AppColors {
  static const Color sage = Color(0xFF5B6B4E);
  static const Color sageLight = Color(0xFF7A8F6A);
  static const Color ink = Color(0xFF1a1a2e);
  static const Color inkSoft = Color(0xFF6b7280);
  static const Color line = Color(0xFFe5e7eb);
  static const Color danger = Color(0xFFd9534f);
  static const Color warning = Color(0xFFe67e22);
  static const Color success = Color(0xFF16a34a);
  static const Color bg = Color(0xFFf5f6fa);
  static const Color cardBg = Color(0xFFFFFFFF);

  static const Color pillYellowBg = Color(0xFFFEF3C7);
  static const Color pillYellowText = Color(0xFF92400E);
  static const Color pillBlueBg = Color(0xFFDBEAFE);
  static const Color pillBlueText = Color(0xFF1E40AF);
  static const Color pillPurpleBg = Color(0xFFEDE9FE);
  static const Color pillPurpleText = Color(0xFF5B21B6);
  static const Color pillGrayBg = Color(0xFFF3F4F6);
  static const Color pillGrayText = Color(0xFF374151);
  static const Color pillRedBg = Color(0xFFFEE2E2);
  static const Color pillRedText = Color(0xFF991B1B);
  static const Color pillGreenBg = Color(0xFFDCFCE7);
  static const Color pillGreenText = Color(0xFF166534);

  static const Color activeBg = Color(0xFFe7f3ec);
  static const Color activeBorder = Color(0xFFbce5cd);
  static const Color activeText = Color(0xFF15803d);
  static const Color idleBg = Color(0xFFFEE2E2);
  static const Color idleBorder = Color(0xFFFCA5A5);
  static const Color idleText = Color(0xFFB91C1C);
  static const Color offlineBg = Color(0xFFf3f4f6);
  static const Color offlineBorder = Color(0xFFe5e7eb);
  static const Color offlineText = Color(0xFF6b7280);
}

ThemeData buildAppTheme() {
  final base = ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(
      seedColor: AppColors.sage,
      primary: AppColors.sage,
      error: AppColors.danger,
      surface: AppColors.cardBg,
    ),
    scaffoldBackgroundColor: AppColors.bg,
  );
  return base.copyWith(
    textTheme: GoogleFonts.interTextTheme(base.textTheme).apply(
      bodyColor: AppColors.ink,
      displayColor: AppColors.ink,
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: AppColors.cardBg,
      foregroundColor: AppColors.ink,
      elevation: 0,
      centerTitle: false,
      titleTextStyle: TextStyle(
        color: AppColors.ink,
        fontSize: 17,
        fontWeight: FontWeight.w700,
      ),
    ),
    cardTheme: CardThemeData(
      color: AppColors.cardBg,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: const BorderSide(color: AppColors.line),
      ),
      margin: EdgeInsets.zero,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: AppColors.cardBg,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: AppColors.line),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: AppColors.line),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: AppColors.sage, width: 1.6),
      ),
      hintStyle: const TextStyle(color: AppColors.inkSoft, fontSize: 14),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: AppColors.sage,
        foregroundColor: Colors.white,
        minimumSize: const Size.fromHeight(46),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: AppColors.ink,
        side: const BorderSide(color: AppColors.line),
        minimumSize: const Size.fromHeight(46),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    ),
    bottomNavigationBarTheme: const BottomNavigationBarThemeData(
      backgroundColor: AppColors.cardBg,
      selectedItemColor: AppColors.sage,
      unselectedItemColor: AppColors.inkSoft,
      type: BottomNavigationBarType.fixed,
      elevation: 8,
    ),
    dividerTheme: const DividerThemeData(color: AppColors.line, space: 1),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
    ),
  );
}

String formatCurrency(num? n) {
  if (n == null) return '—';
  return '₹${NumberFormat('#,##,###', 'en_IN').format(n)}';
}

String formatDuration(int? seconds) {
  if (seconds == null) return '00:00';
  final s = seconds < 0 ? 0 : seconds;
  final h = s ~/ 3600;
  final m = (s % 3600) ~/ 60;
  final sec = s % 60;
  final pad = (int v) => v.toString().padLeft(2, '0');
  if (h > 0) return '${pad(h)}:${pad(m)}:${pad(sec)}';
  return '${pad(m)}:${pad(sec)}';
}
