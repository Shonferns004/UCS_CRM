import 'package:flutter_test/flutter_test.dart';

import 'package:scrapper/main.dart';

void main() {
  testWidgets('app shell builds with the three tabs', (WidgetTester tester) async {
    await tester.pumpWidget(const ScrapperApp());
    expect(find.text('Scraper'), findsWidgets);
    expect(find.text('Setup'), findsWidgets);
    expect(find.text('Inspect'), findsWidgets);
  });
}