import 'package:flutter/material.dart';

import 'constants.dart';

class AppColors {
  static const primary = Color(0xFF4F46E5);
  static const primaryLight = Color(0xFF6366F1);
  static const primaryDark = Color(0xFF4338CA);
  static const primary50 = Color(0xFFEEF2FF);
  static const primary100 = Color(0xFFE0E7FF);
  static const success = Color(0xFF22C55E);
  static const warning = Color(0xFFF59E0B);
  static const danger = Color(0xFFEF4444);
  static const info = Color(0xFF3B82F6);
  static const orange = Color(0xFFF97316);
  static const purple = Color(0xFF7B2FF7);
  static const teal = Color(0xFF14B8A6);
  static const pink = Color(0xFFEC4899);
  static const bg = Color(0xFFF8FAFC);
  static const white = Color(0xFFFFFFFF);
  static const sidebarHover = Color(0xFFF1F5F9);
  static const text = Color(0xFF1E293B);
  static const textLight = Color(0xFF64748B);
  static const border = Color(0xFFE2E8F0);
  static const borderDark = Color(0xFFCBD5E1);
  static const loginGradientStart = Color(0xFF1E1B4B);
  static const loginGradientMid = Color(0xFF312E81);
  static const loginGradientEnd = Color(0xFF6366F1);

  static const Map<String, String> hex = {
    'primary': '4F46E5',
    'primaryLight': '6366F1',
    'primaryDark': '4338CA',
    'success': '22C55E',
    'warning': 'F59E0B',
    'danger': 'EF4444',
    'info': '3B82F6',
    'bg': 'F8FAFC',
    'text': '1E293B',
    'textLight': '64748B',
    'border': 'E2E8F0',
  };
}

Color colorFromHex(String hex) {
  var h = hex.replaceFirst('#', '');
  if (h.length == 6) h = 'FF$h';
  return Color(int.tryParse(h, radix: 16) ?? 0xFF4F46E5);
}

Color statusColor(String status) {
  final c = StatusMap.color[status];
  return c == null ? AppColors.textLight : colorFromHex(c);
}

ThemeData buildAppTheme() {
  final scheme = ColorScheme.fromSeed(seedColor: AppColors.primary);
  final base = ThemeData(useMaterial3: true, colorScheme: scheme);
  return base.copyWith(
    scaffoldBackgroundColor: AppColors.bg,
    colorScheme: scheme.copyWith(primary: AppColors.primary),
    appBarTheme: const AppBarTheme(
      backgroundColor: AppColors.white,
      foregroundColor: AppColors.text,
      elevation: 0,
      scrolledUnderElevation: 0.5,
      titleTextStyle: TextStyle(
        color: AppColors.text,
        fontSize: 18,
        fontWeight: FontWeight.w600,
      ),
    ),
    dividerColor: AppColors.border,
    textTheme: base.textTheme.apply(
      bodyColor: AppColors.text,
      displayColor: AppColors.text,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: AppColors.white,
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: const BorderSide(color: AppColors.borderDark),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: const BorderSide(color: AppColors.borderDark),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: const BorderSide(color: AppColors.primary, width: 1.6),
      ),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: AppColors.primary,
        foregroundColor: AppColors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        textStyle: const TextStyle(fontWeight: FontWeight.w600),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: AppColors.text,
        side: const BorderSide(color: AppColors.borderDark),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      ),
    ),
    cardTheme: CardThemeData(
      color: AppColors.white,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: const BorderSide(color: AppColors.border),
      ),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
    ),
  );
}