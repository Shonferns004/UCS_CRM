import 'package:shared_preferences/shared_preferences.dart';

/// Runtime backend switcher for the app.
///
/// The app ships pointing at the LOCAL dev server
/// (http://192.168.1.152:5000) so a developer can run the whole stack on
/// their own machine. The choice is persisted, so you can flip back to
/// production without rebuilding.
class BackendSwitcher {
  /// Preset backends the app can talk to.
  /// Only two: the permanent ngrok dev domain (works from any network) and
  /// the local machine address (same WiFi only).
  static const List<Map<String, String>> options = [
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

  static const String defaultId = 'tunnel';
  static const String prefsKey = 'app_backend_url';

  static String _url = _urlFor(defaultId);
  static bool _userSelected = false;

  /// True when the user explicitly picked a backend. In that case the remote
  /// config must not silently move the app to a different host.
  static bool get hasSavedSelection => _userSelected;

  static String _urlFor(String id) {
    for (final o in options) {
      if (o['id'] == id) return o['url']!;
    }
    return options.first['url']!;
  }

  /// Trims whitespace and trailing slashes so `$url/api` and `$url/$path`
  /// never produce a double slash (which Express answers with an HTML 404).
  static String normalize(String url) {
    var value = url.trim();
    while (value.endsWith('/')) {
      value = value.substring(0, value.length - 1);
    }
    return value;
  }

  static bool isHttpUrl(String value) {
    final uri = Uri.tryParse(value);
    return uri != null &&
        (uri.scheme == 'http' || uri.scheme == 'https') &&
        uri.host.isNotEmpty;
  }

  /// The backend base URL (no trailing /api).
  static String get baseUrl => _url;

  /// The backend base URL with the /api suffix.
  static String get apiBaseUrl => _url.endsWith('/api') ? _url : '$_url/api';

  /// The socket origin (no /api suffix).
  static String get socketUrl =>
      _url.endsWith('/api') ? _url.substring(0, _url.length - 4) : _url;

  static String get currentId {
    for (final o in options) {
      if (o['url'] == _url) return o['id']!;
    }
    return 'custom';
  }

  /// Load the saved selection. Call before the app makes any request.
  static Future<void> load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final saved = prefs.getString(prefsKey);
      if (saved == null || saved.isEmpty) return;
      final normalized = normalize(saved);
      if (isHttpUrl(normalized)) {
        _url = normalized;
        _userSelected = true;
      } else {
        // Garbage left over from an old build — fall back to the default.
        await prefs.remove(prefsKey);
      }
    } catch (_) {}
  }

  /// Persist a choice (option id or a raw URL).
  ///
  /// Returns false when the URL is not a usable http(s) address, so the picker
  /// can tell the user instead of switching to something that cannot work.
  static Future<bool> set(String idOrUrl) async {
    final raw = idOrUrl.startsWith('http') ? idOrUrl : _urlFor(idOrUrl);
    final normalized = normalize(raw);
    if (!isHttpUrl(normalized)) return false;
    _url = normalized;
    _userSelected = true;
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(prefsKey, _url);
    } catch (_) {}
    return true;
  }
}
