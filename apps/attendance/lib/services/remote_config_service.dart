import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../config.dart';

/// Fetches app config from the backend (no Firebase Remote Config).
/// The bootstrap URL is the only hardcoded endpoint; everything else
/// (apiBaseUrl, socketUrl, feature flags, UI text, announcements, update
/// policy) comes from this config document.
class RemoteConfigService {
  RemoteConfigService._();
  static final RemoteConfigService instance = RemoteConfigService._();

  static const String _prefsKey = 'remote_config_cache';
  static const Duration _fetchTimeout = Duration(seconds: 5);

  Map<String, dynamic> _config = {};
  bool _initialized = false;

  bool get isInitialized => _initialized;

  Map<String, dynamic> get raw => Map.unmodifiable(_config);

  String get apiBaseUrl =>
      _config['api_base_url'] as String? ?? Config.bootstrapBaseUrl;

  String get socketUrl =>
      _config['socket_url'] as String? ??
      (Config.bootstrapBaseUrl.endsWith('/api')
          ? Config.bootstrapBaseUrl.substring(0, Config.bootstrapBaseUrl.length - 4)
          : Config.bootstrapBaseUrl);

  String get minimumVersion => _config['minimum_version'] as String? ?? '0.0.0';

  String get updateUrl => _config['update_url'] as String? ?? '';

  Map<String, dynamic>? get announcement {
    final a = _config['announcement'];
    if (a is Map) return Map<String, dynamic>.from(a);
    return null;
  }

  bool featureFlag(String key, {bool fallback = true}) {
    final flags = _config['feature_flags'];
    if (flags is Map) {
      final v = flags[key];
      if (v is bool) return v;
    }
    return fallback;
  }

  String? uiText(String key) {
    final text = _config['ui_text'];
    if (text is Map) {
      final v = text[key];
      if (v is String) return v;
    }
    return null;
  }

  bool isBelowMinimum(String currentVersion) =>
      _compareVersions(currentVersion, minimumVersion) < 0;

  int _compareVersions(String a, String b) {
    final as = _split(a);
    final bs = _split(b);
    final len = as.length > bs.length ? as.length : bs.length;
    for (var i = 0; i < len; i++) {
      final av = i < as.length ? as[i] : 0;
      final bv = i < bs.length ? bs[i] : 0;
      if (av != bv) return av < bv ? -1 : 1;
    }
    return 0;
  }

  List<int> _split(String v) {
    final cleaned = v.trim().split('-').first;
    return cleaned
        .split('.')
        .map((s) => int.tryParse(s) ?? 0)
        .toList();
  }

  /// Loads cached config (applies it immediately), then refreshes from the
  /// server. Never throws — on failure the cached/last-known values are kept.
  Future<void> init() async {
    if (_initialized) return;
    _initialized = true;
    await _loadFromPrefs();
    // Refresh in the background — cached config (or bootstrap defaults) is
    // already applied, so the first frame is not blocked by the network.
    _fetch().timeout(_fetchTimeout).then((_) => null).catchError((_) => null);
  }

  Future<void> _loadFromPrefs() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final data = prefs.getString(_prefsKey);
      if (data != null) {
        _apply(jsonDecode(data) as Map<String, dynamic>);
      }
    } catch (_) {}
  }

  Future<void> _fetch() async {
    final uri = Uri.parse('${Config.bootstrapBaseUrl}/config');
    final res = await http.get(uri).timeout(_fetchTimeout);
    if (res.statusCode != 200) return;

    // The backend answers with JSON, but an unreachable backend does not fail
    // loudly: a stopped ngrok tunnel answers HTTP 200 with a *text*
    // interstitial (ERR_NGROK_6024), and a captive portal answers with HTML.
    // jsonDecode then throws FormatException, which the caller swallows — so
    // the app was left silently pinned to the dead URL with no signal at all.
    if (!_looksLikeJson(res)) return;

    Object? decoded;
    try {
      decoded = jsonDecode(res.body);
    } on FormatException {
      return;
    }
    if (decoded is Map<String, dynamic>) {
      _apply(decoded);
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_prefsKey, jsonEncode(decoded));
    }
  }

  /// A healthy backend serves `application/json` starting with `{`. Checking
  /// both the header and the first byte keeps an error page that happens to
  /// carry a 200 from ever overwriting a working cached config.
  static bool _looksLikeJson(http.Response res) {
    final contentType = res.headers['content-type'] ?? '';
    if (!contentType.contains('json')) return false;
    final body = res.body.trim();
    return body.startsWith('{') || body.startsWith('[');
  }

  void _apply(Map<String, dynamic> config) {
    _config = config;
    Config.apiBaseUrl = apiBaseUrl;
    Config.socketUrl = socketUrl;
  }
}
