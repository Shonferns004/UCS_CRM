import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import 'package:http/io_client.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../config.dart';

class ApiException implements Exception {
  final String message;
  final int? status;
  final String? code;
  final Map<String, dynamic>? data;
  ApiException(
    this.message, {
    this.status,
    this.code,
    this.data,
  });

  @override
  String toString() => message;
}

class UnauthorisedException extends ApiException {
  UnauthorisedException([String message = 'Session expired. Please login again.'])
      : super(message, status: 401);
}

typedef OnUnauthorised = void Function();

class ApiService {
  static String get baseUrl => Config.apiBaseUrl;
  static String get _host => Uri.parse(baseUrl).host;

  static const Duration _defaultTimeout = Duration(seconds: 120);

  static OnUnauthorised? onUnauthorised;

  static String? _cachedIp;
  static DateTime? _cacheExpiry;
  static String? _cachedToken;
  static String? _cachedRefreshToken;
  static DateTime? _accessTokenExpiry;
  static bool? _preferStandardClient;
  static http.Client? _sharedStandardClient;
  static IOClient? _sharedDohClient;
  static String? _clientBaseUrl;
  static SharedPreferences? _prefs;
  static bool _refreshing = false;

  static Future<SharedPreferences> get _prefsInstance async =>
      _prefs ??= await SharedPreferences.getInstance();

  static DateTime? _jwtExpiry(String token) {
    try {
      final parts = token.split('.');
      if (parts.length < 2) return null;
      final payload = jsonDecode(
          utf8.decode(base64Url.decode(base64Url.normalize(parts[1]))));
      final exp = payload is Map ? payload['exp'] : null;
      if (exp is num) {
        return DateTime.fromMillisecondsSinceEpoch(exp.toInt() * 1000);
      }
    } catch (_) {}
    return null;
  }

  static Future<bool> _refreshAccessToken() async {
    if (_refreshing) return false;
    final refresh = await getRefreshToken();
    if (refresh == null || refresh.isEmpty) return false;
    _refreshing = true;
    try {
      final res = await _post(
        Uri.parse('$baseUrl/auth/refresh'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'refresh_token': refresh}),
        skipRefresh: true,
      );
      if (res.statusCode != 200) return false;
      final body = jsonDecode(res.body);
      if (body is! Map) return false;
      final token = body['token'];
      if (token is! String || token.isEmpty) return false;
      await saveToken(token);
      final newRefresh = body['refresh_token'];
      if (newRefresh is String && newRefresh.isNotEmpty) {
        await saveRefreshToken(newRefresh);
      }
      return true;
    } catch (_) {
      return false;
    } finally {
      _refreshing = false;
    }
  }

  static Future<void> _ensureFreshToken() async {
    final expiry = _accessTokenExpiry;
    if (expiry == null) return;
    if (expiry.isAfter(DateTime.now().add(const Duration(minutes: 5)))) return;
    await _refreshAccessToken();
  }

  static Future<String?> getRefreshToken() async {
    if (_cachedRefreshToken != null) return _cachedRefreshToken;
    final prefs = await _prefsInstance;
    _cachedRefreshToken = prefs.getString('ucs_refresh_token');
    return _cachedRefreshToken;
  }

  static Future<void> saveRefreshToken(String token) async {
    _cachedRefreshToken = token;
    final prefs = await _prefsInstance;
    await prefs.setString('ucs_refresh_token', token);
  }

  static Future<String?> getToken() async {
    if (_cachedToken == null) {
      final prefs = await _prefsInstance;
      _cachedToken = prefs.getString('ucs_token');
      _accessTokenExpiry =
          _cachedToken != null ? _jwtExpiry(_cachedToken!) : null;
    }
    return _cachedToken;
  }

  static Future<void> saveToken(String token) async {
    _cachedToken = token;
    _accessTokenExpiry = _jwtExpiry(token);
    final prefs = await _prefsInstance;
    await prefs.setString('ucs_token', token);
  }

  static Future<void> clearSession() async {
    _cachedToken = null;
    _cachedRefreshToken = null;
    _accessTokenExpiry = null;
    final prefs = await _prefsInstance;
    await prefs.remove('ucs_token');
    await prefs.remove('ucs_refresh_token');
    await prefs.remove('ucs_user');
  }

  static Future<Map<String, dynamic>?> getUser() async {
    final prefs = await _prefsInstance;
    final raw = prefs.getString('ucs_user');
    if (raw == null) return null;
    try {
      return jsonDecode(raw) as Map<String, dynamic>;
    } catch (_) {
      return null;
    }
  }

  static Future<void> setUser(Map<String, dynamic> user) async {
    final prefs = await _prefsInstance;
    await prefs.setString('ucs_user', jsonEncode(user));
  }

  static Future<String> _resolveHost() async {
    if (_cachedIp != null &&
        _cacheExpiry != null &&
        DateTime.now().isBefore(_cacheExpiry!)) {
      return _cachedIp!;
    }
    final host = _host;
    try {
      final dohClient = http.Client();
      try {
        final dohUrl =
            Uri.parse('https://cloudflare-dns.com/dns-query?name=$host&type=A');
        final resp = await dohClient
            .get(dohUrl, headers: {'accept': 'application/dns-json'})
            .timeout(const Duration(seconds: 5));
        if (resp.statusCode == 200) {
          final data = jsonDecode(resp.body) as Map<String, dynamic>;
          final answers = data['Answer'] as List?;
          if (answers != null && answers.isNotEmpty) {
            for (final a in answers) {
              final m = a as Map;
              if (m['type'] == 1) {
                _cachedIp = m['data'].toString();
                _cacheExpiry = DateTime.now().add(const Duration(hours: 1));
                return _cachedIp!;
              }
            }
          }
        }
      } finally {
        dohClient.close();
      }
    } catch (_) {}
    final results =
        await InternetAddress.lookup(host).timeout(const Duration(seconds: 5));
    if (results.isNotEmpty) {
      _cachedIp = results[0].address;
      _cacheExpiry = DateTime.now().add(const Duration(hours: 1));
      return _cachedIp!;
    }
    throw Exception('Could not resolve host: $host');
  }

  static Future<IOClient> _createDohClient() async {
    final ip = await _resolveHost();
    final origHost = _host;
    final connectTimeout = const Duration(seconds: 10);
    final defaultTimeout = const Duration(seconds: 30);
    final httpClient = HttpClient();
    httpClient.connectionFactory = (uri, proxyHost, proxyPort) {
      final port = uri.port;
      Future<Socket> connect() async {
        final socket = await Socket.connect(ip, port).timeout(connectTimeout);
        if (uri.scheme == 'https') {
          return await SecureSocket.secure(socket, host: origHost)
              .timeout(defaultTimeout);
        }
        return socket;
      }
      return Future.value(ConnectionTask.fromSocket(connect(), () {}));
    };
    httpClient.badCertificateCallback =
        (cert, host, port) => host == origHost || host == ip;
    return IOClient(httpClient);
  }

  static void _resetClientsIfUrlChanged() {
    if (_clientBaseUrl != null && _clientBaseUrl != baseUrl) {
      _sharedStandardClient?.close();
      _sharedDohClient?.close();
      _sharedStandardClient = null;
      _sharedDohClient = null;
      _preferStandardClient = null;
      _cachedIp = null;
      _cacheExpiry = null;
    }
    _clientBaseUrl = baseUrl;
  }

  static Future<http.Client> _createClient() async {
    _resetClientsIfUrlChanged();
    if (_preferStandardClient == null) {
      try {
        final probe = http.Client();
        final resp = await probe
            .get(Uri.parse('https://$_host/'), headers: {'accept': 'text/html'})
            .timeout(const Duration(seconds: 8));
        probe.close();
        _preferStandardClient =
            resp.statusCode >= 200 && resp.statusCode < 600;
      } catch (_) {
        _preferStandardClient = false;
      }
    }
    if (_preferStandardClient == true) {
      return _sharedStandardClient ??= http.Client();
    }
    return _sharedDohClient ??= await _createDohClient();
  }

  static Future<Map<String, String>> _headers() async {
    await _ensureFreshToken();
    final token = await getToken();
    return {
      'Content-Type': 'application/json',
      if (token != null && token.isNotEmpty) 'Authorization': 'Bearer $token',
    };
  }

  static Future<http.Response> _send(
    Future<http.Response> Function(http.Client client) run, {
    bool skipRefresh = false,
  }) async {
    final client = await _createClient();
    final res = await run(client).timeout(_defaultTimeout);
    if (!skipRefresh && res.statusCode == 401) {
      final refreshed = await _refreshAccessToken();
      if (refreshed) {
        return run(client).timeout(_defaultTimeout);
      }
    }
    return res;
  }

  static Future<http.Response> _get(Uri uri, {Map<String, String>? headers}) {
    return _send((client) => client.get(uri, headers: headers));
  }

  static Future<http.Response> _post(
    Uri uri, {
    Map<String, String>? headers,
    Object? body,
    bool skipRefresh = false,
  }) {
    return _send(
      (client) => client.post(uri, headers: headers, body: body),
      skipRefresh: skipRefresh,
    );
  }

  static Future<http.Response> _put(
    Uri uri, {
    Map<String, String>? headers,
    Object? body,
  }) {
    return _send((client) => client.put(uri, headers: headers, body: body));
  }

  static Future<dynamic> get(String path, {Duration? timeout, bool auth = true}) async {
    final uri = Uri.parse('$baseUrl$path');
    final headers = auth ? await _headers() : {'Content-Type': 'application/json'};
    return _handleResponse(await _get(uri, headers: headers));
  }

  static Future<dynamic> post(String path,
      {Object? body, Duration? timeout, bool auth = true}) async {
    final uri = Uri.parse('$baseUrl$path');
    final headers = auth ? await _headers() : {'Content-Type': 'application/json'};
    return _handleResponse(await _post(uri, headers: headers, body: body));
  }

  static Future<dynamic> put(String path,
      {Object? body, Duration? timeout, bool auth = true}) async {
    final uri = Uri.parse('$baseUrl$path');
    final headers = auth ? await _headers() : {'Content-Type': 'application/json'};
    return _handleResponse(await _put(uri, headers: headers, body: body));
  }

  static Future<Map<String, dynamic>> login(
      String identifier, String password) async {
    final res = await _post(
      Uri.parse('$baseUrl/auth/worker/login'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode(
          {'identifier': identifier, 'password': password, 'client': 'attendance'}),
      skipRefresh: true,
    );
    final body = jsonDecode(res.body);
    if (res.statusCode != 200) {
      throw ApiException(
        body is Map && body['message'] != null
            ? body['message'].toString()
            : 'Login failed (${res.statusCode})',
        status: res.statusCode,
      );
    }
    if (body is! Map<String, dynamic>) {
      throw ApiException('Invalid response from server');
    }
    final token = body['token']?.toString() ?? '';
    if (token.isEmpty) {
      throw ApiException('Login failed: no token received');
    }
    await saveToken(token);
    final refresh = body['refresh_token'];
    if (refresh is String && refresh.isNotEmpty) {
      await saveRefreshToken(refresh);
    }
    final role = body['role']?.toString() ?? body['user']?['role']?.toString() ?? '';
    final userData = (body['user'] as Map<String, dynamic>?) ??
        <String, dynamic>{...body};
    userData['role'] = role;
    await setUser(userData);
    return body;
  }

  static dynamic _handleResponse(http.Response res) {
    final body = res.body.isEmpty ? null : jsonDecode(res.body);
    if (res.statusCode == 401) {
      final msg = body is Map && body['message'] != null
          ? body['message'].toString()
          : 'Session expired. Please login again.';
      clearSession().then((_) => onUnauthorised?.call());
      throw UnauthorisedException(msg);
    }
    if (res.statusCode >= 400) {
      final msg = body is Map && body['message'] != null
          ? body['message'].toString()
          : 'Request failed: ${res.statusCode}';
      throw ApiException(
        msg,
        status: res.statusCode,
        code: body is Map ? body['code']?.toString() : null,
        data: body is Map ? Map<String, dynamic>.from(body) : null,
      );
    }
    return body;
  }
}
