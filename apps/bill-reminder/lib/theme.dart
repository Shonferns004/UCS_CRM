import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

class AppColors {
  static const bg = Color(0xFFf4f6fb);
  static const card = Colors.white;
  static const ink = Color(0xFF0f172a);
  static const inkSoft = Color(0xFF475569);
  static const inkMute = Color(0xFF94a3b8);
  static const line = Color(0xFFe6eaf2);
  static const navy = Color(0xFF0f172a);
  static const blue = Color(0xFF2563eb);
}

class CategoryMeta {
  final String label;
  final IconData icon;
  final Color color;
  final Color bg;
  final Color iconBg;
  const CategoryMeta(this.label, this.icon, this.color, this.bg, this.iconBg);
}

final Map<String, CategoryMeta> kCategories = {
  'PROPERTY_MAINTENANCE': const CategoryMeta('Property Maintenance', LucideIcons.home, Color(0xFF2563eb), Color(0xFFeff6ff), Color(0xFFdbeafe)),
  'BMC_TAX': const CategoryMeta('BMC Tax', LucideIcons.wallet, Color(0xFF16a34a), Color(0xFFf0fdf4), Color(0xFFdcfce7)),
  'RENT_TDS': const CategoryMeta('Rent & TDS', LucideIcons.fileText, Color(0xFFd97706), Color(0xFFfffbeb), Color(0xFFfef3c7)),
  'INSURANCE': const CategoryMeta('Insurance', LucideIcons.heartPulse, Color(0xFFdc2626), Color(0xFFfef2f2), Color(0xFFfee2e2)),
  'MEDICAL_EXPENSES': const CategoryMeta('Medical Expenses', LucideIcons.hospital, Color(0xFFec4899), Color(0xFFfdf2f8), Color(0xFFfce7f3)),
  'EDUCATION': const CategoryMeta('Education', LucideIcons.bookOpen, Color(0xFF0891b2), Color(0xFFecfeff), Color(0xFFcffafe)),
  'VI_BILL': const CategoryMeta('VI Bills', LucideIcons.wifi, Color(0xFF4f46e5), Color(0xFFeef2ff), Color(0xFFe0e7ff)),
  'WEBSITE_DOMAIN': const CategoryMeta('Website Domain', LucideIcons.globe, Color(0xFFea580c), Color(0xFFfff7ed), Color(0xFFffedd5)),
  'VEHICLE_INSURANCE': const CategoryMeta('Vehicle Insurance', LucideIcons.car, Color(0xFFca8a04), Color(0xFFfefce8), Color(0xFFfef9c3)),
  'ELECTRICITY': const CategoryMeta('Electricity', LucideIcons.zap, Color(0xFF0d9488), Color(0xFFf0fdfa), Color(0xFFccfbf1)),
  'OTHER_BILL': const CategoryMeta('Website Services', LucideIcons.folderOpen, Color(0xFF475569), Color(0xFFf8fafc), Color(0xFFe2e8f0)),
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
  final Color soft;
  const StatusMeta(this.label, this.color, this.soft);
}

StatusMeta statusMeta(String status) {
  switch (status.toLowerCase()) {
    case 'overdue':
      return const StatusMeta('Overdue', Color(0xFFdc2626), Color(0xFFfee2e2));
    case 'due today':
      return const StatusMeta('Due Today', Color(0xFFea580c), Color(0xFFffedd5));
    case 'due tomorrow':
      return const StatusMeta('Due Tomorrow', Color(0xFFd97706), Color(0xFFfef3c7));
    case 'due soon':
      return const StatusMeta('Due Soon', Color(0xFFd97706), Color(0xFFfef3c7));
    case 'completed':
    case 'paid':
      return const StatusMeta('Paid', Color(0xFF16a34a), Color(0xFFdcfce7));
    case 'upcoming':
      return const StatusMeta('Upcoming', Color(0xFF2563eb), Color(0xFFdbeafe));
    default:
      return const StatusMeta('Pending', Color(0xFF64748b), Color(0xFFf1f5f9));
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

CategoryMeta categoryMeta(String? key) => kCategories[key] ?? const CategoryMeta('Other', LucideIcons.bell, Color(0xFF64748b), Color(0xFFf8fafc), Color(0xFFe2e8f0));

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