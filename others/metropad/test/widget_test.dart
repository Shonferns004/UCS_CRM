import 'package:flutter_test/flutter_test.dart';

import 'package:metropad/main.dart';

void main() {
  testWidgets('renders MetroPad home screen', (WidgetTester tester) async {
    await tester.pumpWidget(const MetroPadApp());

    expect(find.text('MetroPad'), findsWidgets);
    expect(find.text('MetroPad Care'), findsOneWidget);
  });
}