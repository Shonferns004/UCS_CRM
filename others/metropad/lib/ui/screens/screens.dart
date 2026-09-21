import 'package:flutter/material.dart';

import 'dashboard_screen.dart';
import 'login_screen.dart';
import 'network_screen.dart';
import 'refills_screen.dart';
import 'stock_issues_screen.dart';

export 'dashboard_screen.dart';
export 'login_screen.dart';
export 'network_screen.dart';
export 'refills_screen.dart';
export 'stock_issues_screen.dart';

Widget screenFor(String route) {
  switch (route) {
    case 'login':
      return const LoginScreen();
    case 'network':
      return const NetworkScreen();
    case 'refills':
      return const RefillsScreen();
    case 'stock-issues':
      return const StockIssuesScreen();
    case 'dashboard':
    default:
      return const DashboardScreen();
  }
}