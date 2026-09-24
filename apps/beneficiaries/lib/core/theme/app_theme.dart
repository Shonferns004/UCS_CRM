import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'app_colors.dart';

class AppTheme {
  // Backwards-compatible aliases used across the codebase.
  static const Color primary = AppColors.textPrimary;
  static const Color secondary = AppColors.primaryBlue;
  static const Color success = AppColors.successGreen;
  static const Color error = AppColors.error;
  static const Color warning = AppColors.warning;
  static const Color surface = AppColors.surface;
  static const Color background = AppColors.background;
  static const Color outline = AppColors.border;
  static const Color textPrimary = AppColors.textPrimary;
  static const Color textSecondary = AppColors.textSecondary;

  // DESIGN.md tokens.
  static const Color blueSoft = AppColors.primaryBlueSoft;
  static const Color blueLight = AppColors.primaryBlueLight;
  static const Color greenSoft = AppColors.successGreenSoft;
  static const Color greenLight = AppColors.successGreenLight;
  static const Color surfaceSoft = AppColors.surfaceSoft;
  static const Color divider = AppColors.divider;
  static const Color textTertiary = AppColors.textTertiary;
  static const Color disabled = AppColors.disabled;
  static const Color errorSoft = AppColors.errorSoft;
  static const Color pageLabel = AppColors.pageLabel;

  // Radii (DESIGN.md section 5).
  static final BorderRadius radiusLarge = BorderRadius.circular(24);
  static final BorderRadius radiusCard = BorderRadius.circular(20);
  static final BorderRadius radiusButton = BorderRadius.circular(18);
  static final BorderRadius radiusSmall = BorderRadius.circular(14);

  // Subtle shadows (DESIGN.md section 6).
  static const List<BoxShadow> cardShadow = [
    BoxShadow(color: Color(0x0A111827), blurRadius: 20, offset: Offset(0, 4)),
  ];

  static ThemeData get lightTheme {
    final base = GoogleFonts.interTextTheme();

    final textTheme = base.copyWith(
      headlineMedium: base.headlineMedium
          ?.copyWith(color: textPrimary, fontWeight: FontWeight.w700),
      headlineSmall: base.headlineSmall
          ?.copyWith(color: textPrimary, fontWeight: FontWeight.w600),
      titleLarge: base.titleLarge
          ?.copyWith(color: textPrimary, fontWeight: FontWeight.w600),
      titleMedium: base.titleMedium
          ?.copyWith(color: textPrimary, fontWeight: FontWeight.w600),
      bodyLarge: base.bodyLarge?.copyWith(color: textPrimary),
      bodyMedium: base.bodyMedium?.copyWith(color: textPrimary),
      bodySmall: base.bodySmall?.copyWith(color: textSecondary),
      labelLarge: base.labelLarge?.copyWith(
        color: textPrimary,
        fontWeight: FontWeight.w600,
        fontSize: 16,
      ),
    );

    const outlineInputBorder = OutlineInputBorder(
      borderRadius: BorderRadius.all(Radius.circular(16)),
      borderSide: BorderSide(color: AppColors.inputBorder),
    );

    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      colorScheme: const ColorScheme.light(
        primary: AppColors.primaryBlue,
        secondary: AppColors.primaryBlue,
        surface: AppColors.surface,
        error: AppColors.error,
        onPrimary: Colors.white,
        onSurface: AppColors.textPrimary,
      ),
      scaffoldBackgroundColor: background,
      textTheme: textTheme,
      appBarTheme: const AppBarTheme(
        backgroundColor: background,
        foregroundColor: textPrimary,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        surfaceTintColor: Colors.transparent,
      ),
      cardTheme: CardThemeData(
        color: surface,
        elevation: 0,
        shape: RoundedRectangleBorder(borderRadius: radiusCard),
      ),
      inputDecorationTheme: const InputDecorationTheme(
        filled: true,
        fillColor: surface,
        contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        labelStyle: TextStyle(fontSize: 14, color: AppColors.inputLabel),
        hintStyle: TextStyle(fontSize: 14, color: AppColors.textTertiary),
        prefixIconColor: AppColors.textTertiary,
        suffixIconColor: AppColors.textTertiary,
        border: outlineInputBorder,
        enabledBorder: outlineInputBorder,
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.all(Radius.circular(16)),
          borderSide: BorderSide(color: AppColors.primaryBlue, width: 1.6),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.all(Radius.circular(16)),
          borderSide: BorderSide(color: AppColors.error),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.all(Radius.circular(16)),
          borderSide: BorderSide(color: AppColors.error, width: 1.6),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.primaryBlue,
          foregroundColor: Colors.white,
          minimumSize: const Size(0, 52),
          shape: RoundedRectangleBorder(borderRadius: radiusButton),
          textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
          elevation: 0,
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size(0, 52),
          shape: RoundedRectangleBorder(borderRadius: radiusButton),
          textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
          elevation: 0,
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: textPrimary,
          minimumSize: const Size(0, 48),
          shape: RoundedRectangleBorder(borderRadius: radiusButton),
          side: const BorderSide(color: AppColors.border),
          textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: AppColors.primaryBlue,
          shape: RoundedRectangleBorder(borderRadius: radiusSmall),
          textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
        ),
      ),
      snackBarTheme: const SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: AppColors.textPrimary,
        contentTextStyle: TextStyle(color: Colors.white, fontSize: 14),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.all(Radius.circular(14)),
        ),
      ),
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: AppColors.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
        ),
        showDragHandle: true,
        dragHandleColor: Color(0xFFD1D5DB),
      ),
      dialogTheme: const DialogThemeData(
        backgroundColor: AppColors.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.all(Radius.circular(20)),
        ),
        titleTextStyle:
            TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: textPrimary),
        contentTextStyle:
            TextStyle(fontSize: 14, height: 1.5, color: textSecondary),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: AppColors.surfaceSoft,
        selectedColor: AppColors.primaryBlueSoft,
        side: const BorderSide(color: AppColors.border),
        shape: RoundedRectangleBorder(borderRadius: radiusSmall),
        labelStyle: const TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w500,
          color: AppColors.textPrimary,
        ),
        checkmarkColor: AppColors.primaryBlue,
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      ),
      dividerTheme: const DividerThemeData(
        color: AppColors.divider,
        thickness: 1,
        space: 24,
      ),
      progressIndicatorTheme:
          const ProgressIndicatorThemeData(color: AppColors.primaryBlue),
    );
  }
}