import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

/// GPay-style palette resolved from the active [Theme].
/// Light follows system light mode, dark follows system dark mode.
class AppPalette extends ThemeExtension<AppPalette> {
  final Color bg;
  final Color card;
  final Color field;
  final Color ink;
  final Color inkSoft;
  final Color inkMute;
  final Color line;
  final Color blue;
  final Color onBlue;
  final Color green;
  final Color danger;
  final Color navy;

  const AppPalette({
    required this.bg,
    required this.card,
    required this.field,
    required this.ink,
    required this.inkSoft,
    required this.inkMute,
    required this.line,
    required this.blue,
    required this.onBlue,
    required this.green,
    required this.danger,
    required this.navy,
  });

  static const light = AppPalette(
    bg: Color(0xFFFAFBFD),
    card: Color(0xFFFFFFFF),
    field: Color(0xFFF0F4F8),
    ink: Color(0xFF1F1F1F),
    inkSoft: Color(0xFF5F6368),
    inkMute: Color(0xFF9AA0A6),
    line: Color(0xFFE8EAED),
    blue: Color(0xFF1A73E8),
    onBlue: Color(0xFFFFFFFF),
    green: Color(0xFF1B873F),
    danger: Color(0xFFD93025),
    navy: Color(0xFF0F172A),
  );

  static const dark = AppPalette(
    bg: Color(0xFF131415),
    card: Color(0xFF1E2022),
    field: Color(0xFF2A2C2E),
    ink: Color(0xFFF1F3F4),
    inkSoft: Color(0xFF9AA0A6),
    inkMute: Color(0xFF80868B),
    line: Color(0xFF2C2F33),
    blue: Color(0xFF8AB4F8),
    onBlue: Color(0xFF202124),
    green: Color(0xFF34A853),
    danger: Color(0xFFF28B82),
    navy: Color(0xFF0F172A),
  );

  static AppPalette of(BuildContext context) =>
      Theme.of(context).extension<AppPalette>() ?? AppPalette.light;

  @override
  AppPalette copyWith({
    Color? bg,
    Color? card,
    Color? field,
    Color? ink,
    Color? inkSoft,
    Color? inkMute,
    Color? line,
    Color? blue,
    Color? onBlue,
    Color? green,
    Color? danger,
    Color? navy,
  }) {
    return AppPalette(
      bg: bg ?? this.bg,
      card: card ?? this.card,
      field: field ?? this.field,
      ink: ink ?? this.ink,
      inkSoft: inkSoft ?? this.inkSoft,
      inkMute: inkMute ?? this.inkMute,
      line: line ?? this.line,
      blue: blue ?? this.blue,
      onBlue: onBlue ?? this.onBlue,
      green: green ?? this.green,
      danger: danger ?? this.danger,
      navy: navy ?? this.navy,
    );
  }

  @override
  AppPalette lerp(AppPalette? other, double t) {
    if (other is! AppPalette) return this;
    return AppPalette(
      bg: Color.lerp(bg, other.bg, t)!,
      card: Color.lerp(card, other.card, t)!,
      field: Color.lerp(field, other.field, t)!,
      ink: Color.lerp(ink, other.ink, t)!,
      inkSoft: Color.lerp(inkSoft, other.inkSoft, t)!,
      inkMute: Color.lerp(inkMute, other.inkMute, t)!,
      line: Color.lerp(line, other.line, t)!,
      blue: Color.lerp(blue, other.blue, t)!,
      onBlue: Color.lerp(onBlue, other.onBlue, t)!,
      green: Color.lerp(green, other.green, t)!,
      danger: Color.lerp(danger, other.danger, t)!,
      navy: Color.lerp(navy, other.navy, t)!,
    );
  }
}

class AppTheme {
  static ThemeData get light => _build(AppPalette.light, Brightness.light);
  static ThemeData get dark => _build(AppPalette.dark, Brightness.dark);

  static ThemeData _build(AppPalette p, Brightness b) {
    final scheme = ColorScheme.fromSeed(
      seedColor: const Color(0xFF1A73E8),
      brightness: b,
    ).copyWith(
      primary: p.blue,
      onPrimary: p.onBlue,
      primaryContainer: p.blue.withValues(alpha: 0.14),
      surface: p.card,
      onSurface: p.ink,
      outline: p.line,
      error: p.danger,
    );
    return ThemeData(
      useMaterial3: true,
      brightness: b,
      colorScheme: scheme,
      scaffoldBackgroundColor: p.bg,
      fontFamilyFallback: const ['Roboto'],
      extensions: <ThemeExtension<dynamic>>[p],
      dividerTheme: DividerThemeData(color: p.line, thickness: 1, space: 1),
      inputDecorationTheme: InputDecorationTheme(
        hintStyle: TextStyle(fontSize: 13.5, color: p.inkMute),
        labelStyle: TextStyle(fontSize: 14, color: p.inkSoft),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(color: p.line),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(color: p.blue, width: 1.4),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: b == Brightness.light
            ? const Color(0xFF1F1F1F)
            : const Color(0xFF3C4043),
        contentTextStyle: const TextStyle(color: Colors.white, fontSize: 13.5),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
  }
}

/// Shared GPay-blue header gradient used across page headers and login.
const LinearGradient kHeaderGradient = LinearGradient(
  begin: Alignment.topLeft,
  end: Alignment.bottomRight,
  colors: [Color(0xFF174EA6), Color(0xFF1A73E8)],
);

class CategoryMeta {
  final String label;
  final IconData icon;
  final Color color;
  const CategoryMeta(this.label, this.icon, this.color);

  Color get bg => color.withValues(alpha: 0.10);
  Color get iconBg => color.withValues(alpha: 0.16);
}

final Map<String, CategoryMeta> kCategories = {
  'PROPERTY_MAINTENANCE': const CategoryMeta('Property Maintenance', LucideIcons.home, Color(0xFF2563eb)),
  'BMC_TAX': const CategoryMeta('BMC Tax', LucideIcons.wallet, Color(0xFF16a34a)),
  'RENT_TDS': const CategoryMeta('Rent & TDS', LucideIcons.fileText, Color(0xFFd97706)),
  'INSURANCE': const CategoryMeta('Insurance', LucideIcons.heartPulse, Color(0xFFdc2626)),
  'MEDICAL_EXPENSES': const CategoryMeta('Medical Expenses', LucideIcons.hospital, Color(0xFFec4899)),
  'EDUCATION': const CategoryMeta('Education', LucideIcons.bookOpen, Color(0xFF0891b2)),
  'VI_BILL': const CategoryMeta('VI Bills', LucideIcons.wifi, Color(0xFF4f46e5)),
  'WEBSITE_DOMAIN': const CategoryMeta('Website Domain', LucideIcons.globe, Color(0xFFea580c)),
  'VEHICLE_INSURANCE': const CategoryMeta('Vehicle Insurance', LucideIcons.car, Color(0xFFca8a04)),
  'ELECTRICITY': const CategoryMeta('Electricity', LucideIcons.zap, Color(0xFF0d9488)),
  'OTHER_BILL': const CategoryMeta('Website Services', LucideIcons.folderOpen, Color(0xFF475569)),
};

class GroupMeta {
  final String label;
  final IconData icon;
  final Color color;
  final List<String> cats;
  const GroupMeta(this.label, this.icon, this.color, this.cats);
}

final List<GroupMeta> kGroups = [
  const GroupMeta('Home', LucideIcons.home, Color(0xFF2563eb), ['PROPERTY_MAINTENANCE', 'BMC_TAX', 'ELECTRICITY']),
  const GroupMeta('Office', LucideIcons.building2, Color(0xFF0891b2), ['RENT_TDS']),
  const GroupMeta('Vehicles', LucideIcons.car, Color(0xFFdc2626), ['VEHICLE_INSURANCE']),
  const GroupMeta('Insurance', LucideIcons.heartPulse, Color(0xFF7c3aed), ['INSURANCE', 'MEDICAL_EXPENSES']),
  const GroupMeta('Education', LucideIcons.bookOpen, Color(0xFF16a34a), ['EDUCATION']),
  const GroupMeta('Subscriptions', LucideIcons.globe, Color(0xFFd97706), ['WEBSITE_DOMAIN', 'VI_BILL', 'OTHER_BILL']),
];

class StatusMeta {
  final String label;
  final Color color;
  const StatusMeta(this.label, this.color);

  Color get soft => color.withValues(alpha: 0.16);
}

StatusMeta statusMeta(String status) {
  switch (status.toLowerCase()) {
    case 'overdue':
      return const StatusMeta('Overdue', Color(0xFFdc2626));
    case 'due today':
      return const StatusMeta('Due Today', Color(0xFFea580c));
    case 'due tomorrow':
      return const StatusMeta('Due Tomorrow', Color(0xFFd97706));
    case 'due soon':
      return const StatusMeta('Due Soon', Color(0xFFd97706));
    case 'completed':
    case 'paid':
      return const StatusMeta('Paid', Color(0xFF16a34a));
    case 'upcoming':
      return const StatusMeta('Upcoming', Color(0xFF2563eb));
    default:
      return const StatusMeta('Pending', Color(0xFF64748b));
  }
}

const Map<String, Color> kOwnerColors = {
  'Priyank Shah': Color(0xFF2563eb),
  'Shweta Shah': Color(0xFF7c3aed),
  'BSCT': Color(0xFF0891b2),
  'AFLF': Color(0xFF16a34a),
  'MANN': Color(0xFFd97706),
  'Suraj Patil': Color(0xFFdc2626),
  'Anjana Vyas': Color(0xFFec4899),
  'Naresh Bhanushali': Color(0xFF6366f1),
};

Color ownerColor(String? owner) => kOwnerColors[owner] ?? const Color(0xFF64748b);

const Map<String, Color> kPriorityColors = {
  'Low': Color(0xFF16a34a),
  'Medium': Color(0xFFeab308),
  'High': Color(0xFFea580c),
  'Critical': Color(0xFFdc2626),
};

Color priorityColor(String? p) => kPriorityColors[p] ?? const Color(0xFF64748b);

CategoryMeta categoryMeta(String? key) => kCategories[key] ?? const CategoryMeta('Other', LucideIcons.bell, Color(0xFF64748b));

String categoryLabel(String? key) => categoryMeta(key).label;

GroupMeta groupOf(String? cat) {
  for (final g in kGroups) {
    if (g.cats.contains(cat)) return g;
  }
  return const GroupMeta('Other', LucideIcons.bell, Color(0xFF64748b), []);
}

// ---- formatting helpers ----

final NumberFormat _inr0 = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);
final NumberFormat _inr2 = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 2);

String formatINR(double? amount) {
  if (amount == null || amount == 0) return '';
  return amount == amount.truncateToDouble() ? _inr0.format(amount) : _inr2.format(amount);
}

String formatINRZero(double? amount) {
  if (amount == null || amount == 0) return formatINR(0);
  return formatINR(amount);
}

String formatCompactINR(double amount) {
  if (amount >= 10000000) return '₹${(amount / 10000000).toStringAsFixed(1)}Cr';
  if (amount >= 100000) return '₹${(amount / 100000).toStringAsFixed(1)}L';
  if (amount >= 1000) return '₹${(amount / 1000).toStringAsFixed(1)}k';
  return '₹${amount.round()}';
}

String dateShort(String? v) {
  if (v == null || v.isEmpty) return '—';
  final s = v.substring(0, 10);
  try {
    final d = DateTime.parse(s);
    return DateFormat('d MMM').format(d);
  } catch (_) {
    return s;
  }
}

String dateMedium(String? v) {
  if (v == null || v.isEmpty) return '—';
  final s = v.substring(0, 10);
  try {
    final d = DateTime.parse(s);
    return DateFormat('d MMM yyyy').format(d);
  } catch (_) {
    return s;
  }
}

String dateFull(String? v) {
  if (v == null || v.isEmpty) return '—';
  final s = v.substring(0, 10);
  try {
    final d = DateTime.parse(s);
    return DateFormat('EEEE, d MMM yyyy').format(d);
  } catch (_) {
    return s;
  }
}

double parseAmountFromNotes(String? notes, double? amount) {
  if (amount != null && amount > 0) return amount;
  if (notes == null) return 0;
  final re = RegExp(r'Rs\.?\s*([\d,]+)', caseSensitive: false);
  final m = re.firstMatch(notes);
  if (m == null) return 0;
  return double.tryParse(m.group(1)!.replaceAll(',', '')) ?? 0;
}
