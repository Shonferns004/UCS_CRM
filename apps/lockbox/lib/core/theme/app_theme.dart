import 'package:flutter/material.dart';
import 'app_colors.dart';

/// Material 3 theme in both light and dark, driven by the design doc tokens.
/// Typography is Roboto (Material 3 default), per the spec.
class AppTheme {
  static ThemeData get light => _build(Brightness.light);
  static ThemeData get dark => _build(Brightness.dark);

  static ThemeData _build(Brightness b) {
    final dark = b == Brightness.dark;
    final scheme = ColorScheme.fromSeed(
      seedColor: AppColors.primary,
      brightness: b,
      surface: dark ? AppColors.darkSurface : AppColors.surface,
    ).copyWith(
      primary: dark ? const Color(0xFF8AB4FF) : AppColors.primary,
      onPrimary: dark ? AppColors.darkTextPrimary : Colors.white,
      surface: dark ? AppColors.darkSurface : AppColors.surface,
      onSurface: dark ? AppColors.darkTextPrimary : AppColors.textPrimary,
      error: AppColors.error,
      outline: dark ? AppColors.darkBorder : AppColors.border,
    );

    const outline = OutlineInputBorder(
      borderRadius: BorderRadius.all(Radius.circular(12)),
      borderSide: BorderSide(color: AppColors.border),
    );
    const focused = OutlineInputBorder(
      borderRadius: BorderRadius.all(Radius.circular(12)),
      borderSide: BorderSide(color: AppColors.primary, width: 1.4),
    );
    const errorBorder = OutlineInputBorder(
      borderRadius: BorderRadius.all(Radius.circular(12)),
      borderSide: BorderSide(color: AppColors.error),
    );

    return ThemeData(
      useMaterial3: true,
      brightness: b,
      colorScheme: scheme,
      scaffoldBackgroundColor: dark ? AppColors.darkBg : AppColors.background,
      appBarTheme: AppBarTheme(
        backgroundColor: dark ? AppColors.darkBg : AppColors.background,
        foregroundColor: dark ? AppColors.darkTextPrimary : AppColors.textPrimary,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        surfaceTintColor: Colors.transparent,
        titleTextStyle: TextStyle(
          fontSize: 20,
          fontWeight: FontWeight.w700,
          color: dark ? AppColors.darkTextPrimary : AppColors.textPrimary,
        ),
      ),
      cardTheme: CardThemeData(
        color: dark ? AppColors.darkSurface : Colors.white,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: AppRadii.card,
          side: BorderSide(color: dark ? AppColors.darkBorder : AppColors.border),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: dark ? AppColors.darkSurfaceSoft : AppColors.surfaceSoft,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        hintStyle: TextStyle(fontSize: 14, color: dark ? AppColors.darkTextTertiary : AppColors.textTertiary),
        labelStyle: TextStyle(fontSize: 14, color: dark ? AppColors.darkTextSecondary : AppColors.textSecondary),
        prefixIconColor: dark ? AppColors.darkTextTertiary : AppColors.textTertiary,
        enabledBorder: outline,
        focusedBorder: focused,
        border: outline,
        errorBorder: errorBorder,
        focusedErrorBorder: focused,
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: dark ? const Color(0xFF8AB4FF) : AppColors.primary,
          foregroundColor: dark ? AppColors.darkTextPrimary : Colors.white,
          minimumSize: const Size.fromHeight(52),
          shape: RoundedRectangleBorder(borderRadius: AppRadii.button),
          elevation: 0,
          textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: dark ? AppColors.darkTextPrimary : AppColors.textPrimary,
          minimumSize: const Size.fromHeight(48),
          shape: RoundedRectangleBorder(borderRadius: AppRadii.button),
          side: BorderSide(color: dark ? AppColors.darkBorder : AppColors.border),
          textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: scheme.primary,
          shape: RoundedRectangleBorder(borderRadius: AppRadii.small),
          textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
        ),
      ),
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) return Colors.white;
          return dark ? AppColors.darkTextTertiary : AppColors.textTertiary;
        }),
        trackColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) return AppColors.primary;
          return dark ? AppColors.darkBorder : AppColors.border;
        }),
        trackOutlineColor: const WidgetStatePropertyAll(Colors.transparent),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: dark ? const Color(0xFF2A3550) : const Color(0xFF111827),
        contentTextStyle: const TextStyle(color: Colors.white, fontSize: 13.5),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: dark ? AppColors.darkSurface : Colors.white,
        shape: RoundedRectangleBorder(borderRadius: AppRadii.card),
        titleTextStyle: TextStyle(
          fontSize: 18,
          fontWeight: FontWeight.w700,
          color: dark ? AppColors.darkTextPrimary : AppColors.textPrimary,
        ),
        contentTextStyle: TextStyle(
          fontSize: 14,
          height: 1.5,
          color: dark ? AppColors.darkTextSecondary : AppColors.textSecondary,
        ),
      ),
      dividerTheme: DividerThemeData(
        color: dark ? AppColors.darkBorder : AppColors.border,
        thickness: 1,
        space: 1,
      ),
      progressIndicatorTheme:
          ProgressIndicatorThemeData(color: dark ? const Color(0xFF8AB4FF) : AppColors.primary),
      splashFactory: InkRipple.splashFactory,
    );
  }
}