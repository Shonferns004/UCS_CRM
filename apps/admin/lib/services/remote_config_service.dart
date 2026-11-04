import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../config.dart';
import 'backend_switcher.dart';

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

  String get apiBaseUrl {
    final value = _config['api_base_url'];
    if (value is String && value.trim().isNotEmpty) {
      return BackendSwitcher.normalize(value);
    }
    return Config.bootstrapBaseUrl;
  }

  String get socketUrl {
    final value = _config['socket_url'];
    if (value is String && value.trim().isNotEmpty) {
      return BackendSwitcher.normalize(value);
    }
    final base = Config.bootstrapBaseUrl;
    return base.endsWith('/api')
        ? base.substring(0, base.length - 4)
        : base;
  }

  String get minimumVersion {
    final value = _config['minimum_version'];
    return value is String ? value : '0.0.0';
  }

  String get updateUrl {
    final value = _config['update_url'];
    return value is String ? value : '';
  }

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
    refresh();
  }

  /// Re-fetches the config from the currently selected backend. Used after the
  /// user switches backends so feature flags/text come from the new server.
  Future<void> refresh() async {
    try {
      await _fetch().timeout(_fetchTimeout);
    } catch (_) {
      // Keep the cached/last-known config.
    }
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
    final res = await http.get(uri, headers: const {
      'Accept': 'application/json',
      'ngrok-skip-browser-warning': 'true',
    }).timeout(_fetchTimeout);
    if (res.statusCode != 200) return;

    // A web page is not a config document (wrong backend, ngrok interstitial,
    // captive portal). Keep the cached config instead of throwing.
    final raw = res.body.trim();
    final contentType = (res.headers['content-type'] ?? '').toLowerCase();
    if (raw.isEmpty ||
        contentType.contains('text/html') ||
        raw.startsWith('<')) {
      return;
    }

    final body = jsonDecode(raw);
    if (body is Map<String, dynamic>) {
      _apply(body);
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_prefsKey, jsonEncode(body));
    }
  }

  void _apply(Map<String, dynamic> config) {
    _config = config;
    // An explicit Backend choice wins over the server document. Otherwise the
    // config would immediately drag the app back to whichever host it was
    // published from (e.g. picking Local but then being sent to the tunnel).
    if (!BackendSwitcher.hasSavedSelection) {
      Config.apiBaseUrl = apiBaseUrl;
      Config.socketUrl = socketUrl;
    }
  }
}
