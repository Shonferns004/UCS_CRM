import 'package:shared_preferences/shared_preferences.dart';

const String kScraperKey = 'f045bdfa3a2583ba2386190e49fbb908b77c398887f04d95';

/// Preset backends the scraper can talk to.
/// Only two: the permanent ngrok dev domain (works from any network) and
/// the local machine address (same WiFi only).
const List<Map<String, String>> kBackendOptions = [
  {
    'id': 'tunnel',
    'label': 'Tunnel (ngrok - works on any network)',
    'url': 'https://audio-diagnoses-ream.ngrok-free.dev',
  },
  {
    'id': 'local',
    'label': 'Local (this machine - same WiFi only)',
    'url': 'http://192.168.1.152:5000',
  },
];

const String kDefaultBackendId = 'tunnel';

const String _prefsKey = 'scraper_backend_url';

/// The backend the app currently talks to.
/// Resolved from saved preferences at startup, falling back to the default.
class ApiConfig {
  static String _backendUrl = _urlFor(kDefaultBackendId);

  static String _urlFor(String id) {
    for (final o in kBackendOptions) {
      if (o['id'] == id) return o['url']!;
    }
    return kBackendOptions.first['url']!;
  }

  static String get backendUrl => _backendUrl;

  static String get backendId {
    for (final o in kBackendOptions) {
      if (o['url'] == _backendUrl) return o['id']!;
    }
    return 'custom';
  }

  /// Load the saved backend selection. Call once before the app makes requests.
  static Future<void> load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final saved = prefs.getString(_prefsKey);
      if (saved != null && saved.isNotEmpty) {
        _backendUrl = saved;
      }
    } catch (_) {
      // keep the default
    }
  }

  /// Persist a backend choice (by option id or a raw custom URL).
  static Future<void> setBackend(String idOrUrl) async {
    final url = idOrUrl.startsWith('http')
        ? idOrUrl
        : _urlFor(idOrUrl);
    _backendUrl = url;
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_prefsKey, url);
    } catch (_) {}
  }

  static Future<void> reset() => setBackend(kDefaultBackendId);
}

/// Kept for backwards compatibility with the old constant-based usage.
/// Now resolves the currently selected backend at call time.
String get kBackendUrl => ApiConfig.backendUrl;
