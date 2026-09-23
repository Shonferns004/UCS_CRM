import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:lockbox/main.dart';

const _channel = MethodChannel('com.ucs.lockbox/channel');

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  void mockChannel() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(_channel, (call) async {
      switch (call.method) {
        case 'isSetupComplete':
          return false;
        case 'hasPin':
          return false;
        case 'getInstalledApps':
          return {
            'apps': [
              {'package': 'com.ucs.lockbox', 'label': 'LockBox', 'system': false, 'icon': ''},
              {'package': 'com.android.settings', 'label': 'Settings', 'system': true, 'icon': ''},
              {'package': 'com.example.game', 'label': 'Game', 'system': false, 'icon': ''},
              {'package': 'com.example.chat', 'label': 'Chat', 'system': false, 'icon': ''},
            ],
          };
        case 'getEssentialPackages':
          return {
            'packages': [
              'com.ucs.lockbox',
              'com.android.settings',
              'com.android.launcher',
              'com.android.phone',
            ],
          };
        case 'getAllowlist':
          return {
            'packages': [
              'com.ucs.lockbox',
              'com.android.settings',
              'com.android.launcher',
              'com.android.phone',
            ],
          };
        case 'saveAllowlist':
          return true;
        case 'isAccessibilityEnabled':
          return true;
        case 'getProtectionStatus':
          return {
            'protectionEnabled': true,
            'accessibilityEnabled': true,
            'setupComplete': false,
            'launcherVisible': true,
            'allowlistCount': 4,
            'blockedToday': 0,
            'secretCode': '5284',
            'recoveryNotification': false,
            'hasPin': false,
            'appVersion': '1.0.0',
          };
        default:
          return null;
      }
    });
  }

  testWidgets('wizard Step 2 (apps list) does not trip semantics', (tester) async {
    mockChannel();

    await tester.pumpWidget(const LockBoxApp());
    await tester.pump(); // bootstrap
    await tester.pump();

    expect(find.text('Let\'s Get Started'), findsOneWidget);
    await tester.tap(find.text('Let\'s Get Started'));
    await tester.pumpAndSettle();

    // Step 1 — confirm accessibility is on (mocked true), auto-advances.
    expect(find.text('Enable Accessibility Service'), findsOneWidget);
    await tester.tap(find.text("I've enabled it"));
    await tester.pump(const Duration(milliseconds: 600));
    await tester.pumpAndSettle();

    // Now safely on Step 2 — allow the app list to load.
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pumpAndSettle();
expect(find.text('Select Allowed Apps'), findsOneWidget);

    // Locked essentials render first; the toggle rows are below the fold.
    final appsScroll = find
        .descendant(
          of: find.byKey(const ValueKey('appsList')),
          matching: find.byType(Scrollable),
        )
        .first;

    // Drive the tooltip path (long-press) on a locked row while it is still on
    // screen, then let its overlay settle. (The mock essential set is LockBox
    // + Settings, so 'Settings' is locked.)
    await tester.longPress(find.text('Settings'), warnIfMissed: false);
    await tester.pumpAndSettle();

    // Now reach the toggle rows (Game/Chat - the only non-essential apps in
    // this mock) by scrolling the list, still driving the tooltip path.
    await tester.scrollUntilVisible(find.text('Chat'), 80, scrollable: appsScroll);
    expect(find.byType(Switch), findsWidgets);
    expect(find.text('Game'), findsOneWidget);
    expect(find.text('Chat'), findsOneWidget);

    // Toggle a few switches (semantics-heavy nodes) while the list is live.
    await tester.tap(find.text('Game'));
    await tester.pump();
    await tester.tap(find.text('Chat'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pump();
  });
}