import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Semantic palette. Defaults to **Sky**, matching the web FRO panel's default
/// theme (`#3485D4` primary). `AppColors.sage` is kept as an alias so legacy
/// call sites keep compiling while rendering the new blue.
class AppColors {
  static const Color primary = Color(0xFF3485D4);
  static const Color sage = primary;
  static const Color sageLight = Color(0xFFD4E6FF);

  static const Color ink = Color(0xFF0B1E36);
  static const Color inkSoft = Color(0xFF4A6488);
  static const Color line = Color(0xFFC4D8F0);
  static const Color danger = Color(0xFFC0392B);
  static const Color warning = Color(0xFFD97706);
  static const Color success = Color(0xFF16A34A);
  static const Color bg = Color(0xFFF0F7FF);
  static const Color cardBg = Color(0xFFF8FBFF);

  // Semantic accents (hardcoded in the web FRO panel too, so not theme-driven).
  static const Color blue = Color(0xFF3B82F6);
  static const Color purple = Color(0xFF8B5CF6);
  static const Color orange = Color(0xFFF97316);
  static const Color gold = Color(0xFFB8860B);
  static const Color clay = Color(0xFFE07B3A);
  static const Color teal = Color(0xFF0891B2);

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

  static const Color activeBg = Color(0xFFE7F3EC);
  static const Color activeBorder = Color(0xFFBCE5CD);
  static const Color activeText = Color(0xFF15803D);
  static const Color idleBg = Color(0xFFFEE2E2);
  static const Color idleBorder = Color(0xFFFCA5A5);
  static const Color idleText = Color(0xFFB91C1C);
  static const Color offlineBg = Color(0xFFF3F4F6);
  static const Color offlineBorder = Color(0xFFE5E7EB);
  static const Color offlineText = Color(0xFF6B7280);
}

/// A single FRO theme, mirroring the web `panels/hr/theme.js` token set.
class FroThemeSpec {
  final String id;
  final String name;
  final Color sand; // page background
  final Color paper; // card background
  final Color ink;
  final Color inkSoft;
  final Color line;
  final Color sage; // primary
  final Color sageSoft;
  final Color clay;
  final Color gold;
  final Color danger;

  const FroThemeSpec({
    required this.id,
    required this.name,
    required this.sand,
    required this.paper,
    required this.ink,
    required this.inkSoft,
    required this.line,
    required this.sage,
    required this.sageSoft,
    required this.clay,
    required this.gold,
    required this.danger,
  });
}

/// The 10 themes the web FRO panel ships (from `panels/hr/theme.js`).
const List<FroThemeSpec> froThemes = [
  FroThemeSpec(
    id: 'sage', name: 'Sage (Default)',
    sand: Color(0xFFF3EFE7), paper: Color(0xFFFBFAF6), ink: Color(0xFF232019),
    inkSoft: Color(0xFF6F6857), line: Color(0xFFE4DECF), sage: Color(0xFF5B6B4E),
    sageSoft: Color(0xFFE8EDE1), clay: Color(0xFFB5603A), gold: Color(0xFFC08A2E),
    danger: Color(0xFF9E3B2E),
  ),
  FroThemeSpec(
    id: 'ocean', name: 'Ocean',
    sand: Color(0xFFEFF4F8), paper: Color(0xFFF8FAFC), ink: Color(0xFF0F172A),
    inkSoft: Color(0xFF475569), line: Color(0xFFCBD5E1), sage: Color(0xFF1E6F9F),
    sageSoft: Color(0xFFDBEAFE), clay: Color(0xFFD97706), gold: Color(0xFFA16207),
    danger: Color(0xFFDC2626),
  ),
  FroThemeSpec(
    id: 'sky', name: 'Sky',
    sand: Color(0xFFF0F7FF), paper: Color(0xFFF8FBFF), ink: Color(0xFF0B1E36),
    inkSoft: Color(0xFF4A6488), line: Color(0xFFC4D8F0), sage: Color(0xFF3485D4),
    sageSoft: Color(0xFFD4E6FF), clay: Color(0xFFE07B3A), gold: Color(0xFFB8860B),
    danger: Color(0xFFC0392B),
  ),
  FroThemeSpec(
    id: 'marine', name: 'Marine',
    sand: Color(0xFFEAF2F8), paper: Color(0xFFF4F9FC), ink: Color(0xFF0A1E2E),
    inkSoft: Color(0xFF3D5A72), line: Color(0xFFBFD5E8), sage: Color(0xFF1A6B8A),
    sageSoft: Color(0xFFD0E6F2), clay: Color(0xFFC96A2B), gold: Color(0xFF8B7A1A),
    danger: Color(0xFFB03A2E),
  ),
  FroThemeSpec(
    id: 'indigo', name: 'Indigo',
    sand: Color(0xFFEEF0F9), paper: Color(0xFFF7F8FC), ink: Color(0xFF141838),
    inkSoft: Color(0xFF444C78), line: Color(0xFFC2C8E8), sage: Color(0xFF4F5DB0),
    sageSoft: Color(0xFFD5DAF2), clay: Color(0xFFC95A2B), gold: Color(0xFF8B7A1A),
    danger: Color(0xFFB03A3A),
  ),
  FroThemeSpec(
    id: 'steel', name: 'Steel',
    sand: Color(0xFFEBF0F5), paper: Color(0xFFF5F7FA), ink: Color(0xFF141E28),
    inkSoft: Color(0xFF405060), line: Color(0xFFBCC8D6), sage: Color(0xFF3C6B9C),
    sageSoft: Color(0xFFCEDCF0), clay: Color(0xFFC06030), gold: Color(0xFF8B7320),
    danger: Color(0xFFA83838),
  ),
  FroThemeSpec(
    id: 'iceberg', name: 'Iceberg',
    sand: Color(0xFFF2F5FA), paper: Color(0xFFFAFCFE), ink: Color(0xFF1A2638),
    inkSoft: Color(0xFF4A5A70), line: Color(0xFFC8D4E6), sage: Color(0xFF5A8BBF),
    sageSoft: Color(0xFFD6E4F5), clay: Color(0xFFCC7030), gold: Color(0xFF9A8228),
    danger: Color(0xFFB04040),
  ),
  FroThemeSpec(
    id: 'twilight', name: 'Twilight',
    sand: Color(0xFFEDEFF8), paper: Color(0xFFF6F7FC), ink: Color(0xFF141838),
    inkSoft: Color(0xFF4A4E78), line: Color(0xFFC2C6E6), sage: Color(0xFF5A5EA8),
    sageSoft: Color(0xFFD8DAF2), clay: Color(0xFFC86838), gold: Color(0xFF8B7A1A),
    danger: Color(0xFFB03A3A),
  ),
  FroThemeSpec(
    id: 'cerulean', name: 'Cerulean',
    sand: Color(0xFFEBF5FA), paper: Color(0xFFF5FAFD), ink: Color(0xFF0A1E30),
    inkSoft: Color(0xFF385A78), line: Color(0xFFB8D2E8), sage: Color(0xFF1C7EB8),
    sageSoft: Color(0xFFCCE4F5), clay: Color(0xFFD97030), gold: Color(0xFF9A8228),
    danger: Color(0xFFB03A30),
  ),
  FroThemeSpec(
    id: 'sapphire', name: 'Sapphire',
    sand: Color(0xFFEAF0F8), paper: Color(0xFFF4F8FC), ink: Color(0xFF0A162E),
    inkSoft: Color(0xFF384C78), line: Color(0xFFBCC8EA), sage: Color(0xFF2554A0),
    sageSoft: Color(0xFFCCDCF5), clay: Color(0xFFC86838), gold: Color(0xFF8B7A1A),
    danger: Color(0xFFB03A3A),
  ),
];

/// Web FRO panel defaults to 'sky' (not the hr default 'sage').
const FroThemeSpec skyTheme = FroThemeSpec(
  id: 'sky', name: 'Sky',
  sand: Color(0xFFF0F7FF), paper: Color(0xFFF8FBFF), ink: Color(0xFF0B1E36),
  inkSoft: Color(0xFF4A6488), line: Color(0xFFC4D8F0), sage: Color(0xFF3485D4),
  sageSoft: Color(0xFFD4E6FF), clay: Color(0xFFE07B3A), gold: Color(0xFFB8860B),
  danger: Color(0xFFC0392B),
);

FroThemeSpec? froThemeById(String id) {
  for (final t in froThemes) {
    if (t.id == id) return t;
  }
  return null;
}

class ThemeService extends ChangeNotifier {
  static const _prefsKey = 'fro_theme_v1';

  FroThemeSpec _spec = skyTheme;
  FroThemeSpec get spec => _spec;
  String get id => _spec.id;

  ThemeService() {
    _load();
  }

  Future<void> _load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final saved = prefs.getString(_prefsKey);
      final found = saved != null ? froThemeById(saved) : null;
      if (found != null) {
        _spec = found;
        notifyListeners();
      }
    } catch (_) {}
  }

  Future<void> setTheme(String id) async {
    final found = froThemeById(id);
    if (found == null || found.id == _spec.id) return;
    _spec = found;
    notifyListeners();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_prefsKey, id);
    } catch (_) {}
  }
}

ThemeData buildAppTheme([FroThemeSpec? spec]) {
  final t = spec ?? skyTheme;
  final base = ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(
      seedColor: t.sage,
      primary: t.sage,
      error: t.danger,
      surface: t.paper,
    ),
    scaffoldBackgroundColor: t.sand,
  );
  return base.copyWith(
    textTheme: GoogleFonts.interTextTheme(base.textTheme).apply(
      bodyColor: t.ink,
      displayColor: t.ink,
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: t.paper,
      foregroundColor: t.ink,
      elevation: 0,
      centerTitle: false,
      titleTextStyle: TextStyle(
        color: t.ink,
        fontSize: 17,
        fontWeight: FontWeight.w700,
      ),
    ),
    cardTheme: CardThemeData(
      color: t.paper,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: t.line),
      ),
      margin: EdgeInsets.zero,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: t.paper,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: t.line),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: t.line),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: t.sage, width: 1.6),
      ),
      hintStyle: TextStyle(color: t.inkSoft, fontSize: 14),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: t.sage,
        foregroundColor: Colors.white,
        minimumSize: const Size.fromHeight(46),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: t.ink,
        side: BorderSide(color: t.line),
        minimumSize: const Size.fromHeight(46),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    ),
    bottomNavigationBarTheme: BottomNavigationBarThemeData(
      backgroundColor: t.paper,
      selectedItemColor: t.sage,
      unselectedItemColor: t.inkSoft,
      type: BottomNavigationBarType.fixed,
      elevation: 8,
    ),
    dividerTheme: DividerThemeData(color: t.line, space: 1),
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
