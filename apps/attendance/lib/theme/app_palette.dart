import 'package:flutter/material.dart';

/// UCS Attend palette.
///
/// 60% Soft White — #F4F6FA app background.
/// 30% Steel Gray — #5A6473 ink and dark surfaces.
/// 10% Royal Blue — #4A78E0 actions and active states.
///
/// The Stone/Graphite/Cobalt names are kept as aliases so existing widgets
/// inherit the system without a risky rename-only sweep.
class AppPalette {
  AppPalette._();

  // ----- 60% soft white --------------------------------------------------
  static const Color stone = Color(0xFFF4F6FA);
  static const Color stoneSoft = Color(0xFFEDF0F6);
  static const Color stoneDeep = Color(0xFFDDE3EC);

  // ----- 30% steel gray --------------------------------------------------
  static const Color graphite = Color(0xFF5A6473);
  static const Color graphiteSoft = Color(0xFF6C7686);
  static const Color graphiteDeep = Color(0xFF3F4754);

  // ----- 10% royal blue --------------------------------------------------
  static const Color cobalt = Color(0xFF4A78E0);
  static const Color cobaltDeep = Color(0xFF3762C9);
  static const Color cobaltSoft = Color(0xFFE4EBFB);

  /// Readable accent for dark Steel Gray surfaces.
  static const Color accentOnDark = Color(0xFFA9C0F5);

  // ----- aliases used across the app ------------------------------------
  /// Main background.
  static const Color iceBlue = stone;
  static const Color iceSoft = stoneSoft;
  static const Color iceDeep = stoneDeep;

  /// Primary ink / dark surfaces.
  static const Color ocean = graphite;
  static const Color oceanDeep = graphiteDeep;
  static const Color oceanSoft = graphiteSoft;
  static const Color ink = graphite;
  static const Color muted = Color(0xFF7C8698);

  /// Accent / primary action.
  static const Color aqua = cobalt;
  static const Color aquaDeep = cobaltDeep;
  static const Color aquaSoft = cobaltSoft;

  static const Color white = Color(0xFFFFFFFF);

  // ----- semantic feedback (kept distinct from the brand accent) ---------
  static const Color success = Color(0xFF2E7D5B);
  static const Color successSoft = Color(0xFFE3F2EA);
  static const Color error = Color(0xFFC0392B);
  static const Color warning = Color(0xFFB45309);
  static const Color warningSoft = Color(0xFFFFF3E0);

  /// Soft floating shadow used by cards, the tab bar and sheets.
  static List<BoxShadow> lift([double strength = 1]) => [
    BoxShadow(
      color: graphiteDeep.withValues(alpha: 0.10 * strength),
      blurRadius: 28 * strength,
      offset: Offset(0, 12 * strength),
    ),
    BoxShadow(
      color: graphiteDeep.withValues(alpha: 0.05 * strength),
      blurRadius: 8 * strength,
      offset: Offset(0, 2 * strength),
    ),
  ];
}
