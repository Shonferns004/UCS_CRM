import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ucs_admin/main.dart';

void main() {
  testWidgets('App renders without crashing', (WidgetTester tester) async {
    await tester.pumpWidget(UcsAdminApp(navigatorKey: GlobalKey<NavigatorState>()));
    // Let async auth check complete (2s timeout + error handling)
    await tester.pump(const Duration(seconds: 3));
    await tester.pump(const Duration(seconds: 1));
  });
}
