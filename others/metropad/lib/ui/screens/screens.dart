import 'package:flutter/material.dart';

import 'dashboard_screen.dart';
import 'login_screen.dart';
import 'metro_lines_screen.dart';
import 'refills_screen.dart';
import 'stations_screen.dart';
import 'stock_issues_screen.dart';

export 'dashboard_screen.dart';
export 'login_screen.dart';
export 'metro_lines_screen.dart';
export 'refills_screen.dart';
export 'stations_screen.dart';
export 'stock_issues_screen.dart';

Widget screenFor(String route) {
  switch (route) {
    case 'login':
      return const LoginScreen();
    case 'metro-lines':
      return const MetroLinesScreen();
    case 'stations':
      return const StationsScreen();
    case 'refills':
      return const RefillsScreen();
    case 'stock-issues':
      return const StockIssuesScreen();
    case 'dashboard':
    default:
      return const DashboardScreen();
  }
}