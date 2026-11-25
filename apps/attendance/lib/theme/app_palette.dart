import 'package:flutter/material.dart';

/// UCS Attend palette.
///
/// 60% Ice Blue, 30% Ocean, 10% Aqua Green.
class AppPalette {
  AppPalette._();

  /// 60% — main background.
  static const Color iceBlue = Color(0xFFE6F0FA);

  /// 30% — primary ink, headers and primary actions.
  static const Color ocean = Color(0xFF174A7C);

  /// 10% — accent, active states and success.
  static const Color aqua = Color(0xFF2FD3A0);

  // ----- derived shades -------------------------------------------------
  static const Color ink = Color(0xFF0F2E4A);
  static const Color oceanDeep = Color(0xFF0E3457);
  static const Color oceanSoft = Color(0xFF2C5A85);
  static const Color muted = Color(0xFF5E7E99);
  static const Color iceDeep = Color(0xFFD5E7F5);
  static const Color iceSoft = Color(0xFFF2F8FD);
  static const Color aquaDeep = Color(0xFF12A47B);
  static const Color aquaSoft = Color(0xFFD4F7EC);
  static const Color white = Color(0xFFFFFFFF);
  static const Color error = Color(0xFFBA1A1A);

  /// Soft floating shadow used by cards, the tab bar and sheets.
  static List<BoxShadow> lift([double strength = 1]) => [
    BoxShadow(
      color: ocean.withValues(alpha: 0.10 * strength),
      blurRadius: 28 * strength,
      offset: Offset(0, 12 * strength),
    ),
    BoxShadow(
      color: ocean.withValues(alpha: 0.05 * strength),
      blurRadius: 8 * strength,
      offset: Offset(0, 2 * strength),
    ),
  ];
}
