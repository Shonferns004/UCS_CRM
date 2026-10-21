import 'package:shared_preferences/shared_preferences.dart';

/// Runtime backend switcher for the app.
///
/// The app ships pointing at the LOCAL dev server
/// (http://192.168.1.152:5000) so a developer can run the whole stack on
/// their own machine. The choice is persisted, so you can flip back to
/// production without rebuilding.
class BackendSwitcher {
  /// Preset backends the app can talk to.
  static const List<Map<String, String>> options = [
    {
      'id': 'local',
      'label': 'Local (this machine)',
      'url': 'http://192.168.1.152:5000',
    },
    {
      'id': 'local-emulator',
      'label': 'Local (10.0.2.2 - Android emulator)',
      'url': 'http://10.0.2.2:5000',
    },
    {
      'id': 'cloudflared',
      'label': 'Local via cloudflared tunnel',
      'url': 'https://registrar-alex-findarticles-poison.trycloudflare.com',
    },
    {
      'id': 'production',
      'label': 'Production',
      'url': 'https://api.beingsevak.org',
    },
  ];

  static const String defaultId = 'local';
  static const String prefsKey = 'app_backend_url';

  static String _url = _urlFor(defaultId);

  static String _urlFor(String id) {
    for (final o in options) {
      if (o['id'] == id) return o['url']!;
    }
    return options.first['url']!;
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
      if (saved != null && saved.isNotEmpty) _url = saved;
    } catch (_) {}
  }

  /// Persist a choice (option id or a raw URL).
  static Future<void> set(String idOrUrl) async {
    _url = idOrUrl.startsWith('http') ? idOrUrl : _urlFor(idOrUrl);
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(prefsKey, _url);
    } catch (_) {}
  }
}
