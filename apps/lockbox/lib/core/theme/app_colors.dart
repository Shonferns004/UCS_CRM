import 'package:flutter/material.dart';

/// Design tokens from LockBox_All_Screens_Designed.md — single source of truth.
class AppColors {
  // Brand
  static const Color primary = Color(0xFF1769FF);
  static const Color primarySoft = Color(0xFFEAF1FF);
  static const Color primaryDark = Color(0xFF0B2E7A);

  // Status
  static const Color success = Color(0xFF16A34A);
  static const Color successSoft = Color(0xFFEAF8F0);
  static const Color warning = Color(0xFFF59E0B);
  static const Color warningSoft = Color(0xFFFEF4E5);
  static const Color error = Color(0xFFDC2626);
  static const Color errorSoft = Color(0xFFFEF2F2);

  // Neutrals
  static const Color background = Color(0xFFF7F9FC);
  static const Color surface = Color(0xFFFFFFFF);
  static const Color surfaceSoft = Color(0xFFF1F4F9);
  static const Color border = Color(0xFFE5E7EB);
  static const Color textPrimary = Color(0xFF111827);
  static const Color textSecondary = Color(0xFF6B7280);
  static const Color textTertiary = Color(0xFF9CA3AF);

  // Dark-mode surfaces
  static const Color darkBg = Color(0xFF0F1524);
  static const Color darkSurface = Color(0xFF161D2E);
  static const Color darkSurfaceSoft = Color(0xFF1E2738);
  static const Color darkBorder = Color(0xFF2A3550);
  static const Color darkTextPrimary = Color(0xFFF3F4F6);
  static const Color darkTextSecondary = Color(0xFFA5B0C3);
  static const Color darkTextTertiary = Color(0xFF6E7A92);

  // Block screen (native) navy
  static const Color blockNavy = Color(0xFF0B1B3F);
  static const Color blockMid = Color(0xFF122A5C);
  static const Color blockTop = Color(0xFF1E3E8F);
}

/// Radii + spacing per design spec.
abstract final class AppRadii {
  static final BorderRadius card = BorderRadius.circular(16);
  static final BorderRadius button = BorderRadius.circular(12);
  static final BorderRadius small = BorderRadius.circular(8);
  static final BorderRadius field = BorderRadius.circular(12);
}

abstract final class AppSpacing {
  static const double page = 20;
  static const double section = 24;

  static EdgeInsets pagePad() => const EdgeInsets.all(page);
}