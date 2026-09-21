import 'package:flutter/material.dart';

import 'audit_logs_screen.dart';
import 'dashboard_screen.dart';
import 'login_screen.dart';
import 'machines_screen.dart';
import 'maintenance_screen.dart';
import 'metro_lines_screen.dart';
import 'monthly_data_screen.dart';
import 'pad_stock_screen.dart';
import 'refills_screen.dart';
import 'reports_screen.dart';
import 'settings_screen.dart';
import 'stations_screen.dart';
import 'stock_issues_screen.dart';
import 'users_screen.dart';

export 'audit_logs_screen.dart';
export 'dashboard_screen.dart';
export 'login_screen.dart';
export 'machines_screen.dart';
export 'machine_detail_screen.dart';
export 'maintenance_screen.dart';
export 'metro_lines_screen.dart';
export 'monthly_data_screen.dart';
export 'pad_stock_screen.dart';
export 'refills_screen.dart';
export 'reports_screen.dart';
export 'settings_screen.dart';
export 'stations_screen.dart';
export 'stock_issues_screen.dart';
export 'users_screen.dart';

Widget screenFor(String route) {
  switch (route) {
    case 'dashboard':
      return const DashboardScreen();
    case 'login':
      return const LoginScreen();
    case 'metro-lines':
      return const MetroLinesScreen();
    case 'stations':
      return const StationsScreen();
    case 'machines':
      return const MachinesScreen();
    case 'refills':
      return const RefillsScreen();
    case 'pad-stock':
      return const PadStockScreen();
    case 'stock-issues':
      return const StockIssuesScreen();
    case 'maintenance':
      return const MaintenanceScreen();
    case 'monthly-data':
      return const MonthlyDataScreen();
    case 'reports':
      return const ReportsScreen();
    case 'users':
      return const UsersScreen();
    case 'audit-logs':
      return const AuditLogsScreen();
    case 'settings':
      return const SettingsScreen();
    default:
      return const DashboardScreen();
  }
}