import 'services/backend_switcher.dart';

class Config {
  // Bootstrap URL — used ONLY to fetch the remote config at startup.
  // Points at the local dev server by default; tap the "Backend" row in the
  // app to switch between local / emulator / cloudflared / production.
  static String get bootstrapBaseUrl => BackendSwitcher.apiBaseUrl;

  // Config-driven values. Default to the bootstrap URL until config loads.
  static String apiBaseUrl = BackendSwitcher.apiBaseUrl;
  static String socketUrl = BackendSwitcher.socketUrl;

  /// Applies the backend the user picked immediately, so changing it at
  /// runtime takes effect without restarting the app.
  static void applySelectedBackend() {
    apiBaseUrl = BackendSwitcher.apiBaseUrl;
    socketUrl = BackendSwitcher.socketUrl;
  }

  // Geoapify reverse-geocoding key (same service hr-attend uses).
  static const String geoapifyKey = 'cb50c21d6668448a8918d07d0b19ed62';
}
