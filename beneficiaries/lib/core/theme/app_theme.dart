import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class AppTheme {
  static const Color primary = Color(0xFF00152A);
  static const Color secondary = Color(0xFF2563EB);
  static const Color surface = Color(0xFFF6FAFE);
  static const Color background = Color(0xFFF3F4F6);
  static const Color error = Color(0xFFDC2626);
  static const Color success = Color(0xFF059669);
  static const Color warning = Color(0xFFD97706);
  static const Color outline = Color(0xFFE5E7EB);
  static const Color textPrimary = Color(0xFF111827);
  static const Color textSecondary = Color(0xFF6B7280);

  static ThemeData get lightTheme {
    final baseTextTheme = GoogleFonts.manropeTextTheme();
    final headlineTextTheme = GoogleFonts.hankenGroteskTextTheme();

    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      colorScheme: ColorScheme.light(
        primary: primary,
        secondary: secondary,
        surface: surface,
        error: error,
      ),
      scaffoldBackgroundColor: background,
      textTheme: baseTextTheme.copyWith(
        headlineLarge: headlineTextTheme.headlineLarge?.copyWith(color: textPrimary, fontWeight: FontWeight.w700),
        headlineMedium: headlineTextTheme.headlineMedium?.copyWith(color: textPrimary, fontWeight: FontWeight.w700),
        headlineSmall: headlineTextTheme.headlineSmall?.copyWith(color: textPrimary, fontWeight: FontWeight.w600),
        titleLarge: baseTextTheme.titleLarge?.copyWith(color: textPrimary, fontWeight: FontWeight.w600),
        titleMedium: baseTextTheme.titleMedium?.copyWith(color: textPrimary, fontWeight: FontWeight.w600),
        bodyLarge: baseTextTheme.bodyLarge?.copyWith(color: textPrimary),
        bodyMedium: baseTextTheme.bodyMedium?.copyWith(color: textPrimary),
        labelLarge: baseTextTheme.labelLarge?.copyWith(color: textSecondary),
        labelMedium: baseTextTheme.labelMedium?.copyWith(color: textSecondary),
      ),
      cardTheme: CardThemeData(
        color: Colors.white,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(8),
          side: const BorderSide(color: outline),
        ),
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: primary,
        foregroundColor: Colors.white,
        elevation: 0,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Colors.white,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(6),
          borderSide: const BorderSide(color: outline),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(6),
          borderSide: const BorderSide(color: outline),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(6),
          borderSide: const BorderSide(color: secondary, width: 2),
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        labelStyle: const TextStyle(fontSize: 13),
        hintStyle: const TextStyle(fontSize: 13, color: textSecondary),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: secondary,
          foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
          textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: textPrimary,
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
          side: const BorderSide(color: outline),
        ),
      ),
    );
  }
}
