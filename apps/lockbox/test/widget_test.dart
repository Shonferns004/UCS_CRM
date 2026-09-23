import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:lockbox/channel.dart';
import 'package:lockbox/main.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const channel = MethodChannel('com.ucs.lockbox/channel');

  void mockChannel() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
      switch (call.method) {
        case 'isSetupComplete':
          return false;
        case 'hasPin':
          return false;
        default:
          return null;
      }
    });
  }

  testWidgets('LockBoxApp opens the setup wizard when setup is incomplete',
      (WidgetTester tester) async {
    mockChannel();

    await tester.pumpWidget(const LockBoxApp());
    await tester.pump();

    // Splash first, then the welcome screen of the wizard.
    expect(find.text('Welcome to LockBox'), findsOneWidget);
  });

  testWidgets('ProtectionStatus parses a native snapshot', (tester) async {
    final s = ProtectionStatus.fromMap({
      'protectionEnabled': true,
      'accessibilityEnabled': true,
      'setupComplete': true,
      'launcherVisible': false,
      'allowlistCount': 4,
      'blockedToday': 3,
      'secretCode': '5284',
      'recoveryNotification': true,
      'hasPin': true,
      'appVersion': '1.0.0',
    });

    expect(s.active, isTrue);
    expect(s.paused, isFalse);
    expect(s.allowlistCount, 4);
    expect(s.blockedToday, 3);
  });
}