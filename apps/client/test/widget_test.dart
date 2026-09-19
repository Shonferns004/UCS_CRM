import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ufs_attendance/main.dart';

void main() {
  testWidgets('App renders without crashing', (WidgetTester tester) async {
    await tester.pumpWidget(UfsAttendApp(navigatorKey: GlobalKey<NavigatorState>()));
    // Let async auth check complete (2s timeout + error handling)
    await tester.pump(const Duration(seconds: 3));
    await tester.pump(const Duration(seconds: 1));
  });
}
