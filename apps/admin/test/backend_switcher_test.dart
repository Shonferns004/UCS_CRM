import 'package:flutter_test/flutter_test.dart';
import 'package:ucs_admin/services/backend_switcher.dart';

void main() {
  group('BackendSwitcher.normalize', () {
    test('trims whitespace and trailing slashes', () {
      expect(
        BackendSwitcher.normalize('  https://example.com/api/  '),
        'https://example.com/api',
      );
    });

    test('keeps a URL without a trailing slash unchanged', () {
      expect(
        BackendSwitcher.normalize('http://192.168.1.100:5000'),
        'http://192.168.1.100:5000',
      );
    });
  });

  group('BackendSwitcher.isHttpUrl', () {
    test('accepts http and https URLs', () {
      expect(BackendSwitcher.isHttpUrl('https://example.com'), isTrue);
      expect(BackendSwitcher.isHttpUrl('http://192.168.1.100:5000'), isTrue);
    });

    test('rejects empty, scheme-less and non-http values', () {
      expect(BackendSwitcher.isHttpUrl(''), isFalse);
      expect(BackendSwitcher.isHttpUrl('example.com'), isFalse);
      expect(BackendSwitcher.isHttpUrl('ftp://example.com'), isFalse);
      expect(BackendSwitcher.isHttpUrl('https:'), isFalse);
    });
  });
}
