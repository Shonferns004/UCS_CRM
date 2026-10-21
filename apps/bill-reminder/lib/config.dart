import 'services/backend_switcher.dart';

class Config {
  // Points at the local dev server by default; tap the "Backend" row in the
  // app to switch between local / emulator / cloudflared / production.
  static String get apiBaseUrl => BackendSwitcher.apiBaseUrl;
  static String get socketUrl => BackendSwitcher.socketUrl;
}
