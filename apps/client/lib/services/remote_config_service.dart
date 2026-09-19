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
    try {
      await _fetch().timeout(_fetchTimeout);
    } catch (_) {
      // Server unreachable — cached config (or bootstrap defaults) is used.
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
    final res = await http.get(uri).timeout(_fetchTimeout);
    if (res.statusCode != 200) return;
    final body = jsonDecode(res.body);
    if (body is Map<String, dynamic>) {
      _apply(body);
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_prefsKey, jsonEncode(body));
    }
  }

  void _apply(Map<String, dynamic> config) {
    _config = config;
    Config.apiBaseUrl = apiBaseUrl;
    Config.socketUrl = socketUrl;
  }
}
