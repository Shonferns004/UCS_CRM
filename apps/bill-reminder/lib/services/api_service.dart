import 'dart:convert';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../config.dart';

class ApiService {
  static const String _tokenKey = 'bill_reminder_token';
  static const String _lastLoginKey = 'bill_reminder_last_login';
  static const String _fcmTokenKey = 'bill_reminder_fcm_token';

  static String get baseUrl => Config.apiBaseUrl;

  static Future<void> saveToken(String token) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_tokenKey, token);
  }

  static Future<String?> getToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_tokenKey);
  }

  static Future<void> saveLastLogin(String login) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_lastLoginKey, login);
  }

  static Future<String?> getLastLogin() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_lastLoginKey);
  }

  static Future<void> saveFcmToken(String token) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_fcmTokenKey, token);
  }

  static Future<String?> getFcmToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_fcmTokenKey);
  }

  static Future<void> clearAuth() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_tokenKey);
  }

  static Future<Map<String, String>> _headers() async {
    final token = await getToken();
    return {
      'Content-Type': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };
  }

  static Future<void> _check(http.Response res) {
    if (res.statusCode >= 200 && res.statusCode < 300) return Future.value();
    try {
      final body = jsonDecode(res.body);
      throw Exception(body['message'] ?? 'Request failed (${res.statusCode})');
    } on FormatException {
      throw Exception('Server error (${res.statusCode}). Please try again.');
    }
  }

  static Future<Map<String, dynamic>> login(String identifier, String password) async {
    final res = await http.post(
      Uri.parse('$baseUrl/auth/login'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'identifier': identifier, 'password': password}),
    );
    await _check(res);
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    final token = body['token'];
    if (token != null) await saveToken(token.toString());
    await saveLastLogin(identifier);
    return body;
  }

  static Future<List<dynamic>> fetchReminders() async {
    final res = await http.get(
      Uri.parse('$baseUrl/reminders'),
      headers: await _headers(),
    );
    await _check(res);
    final body = jsonDecode(res.body);
    return (body is List) ? body : (body['reminders'] ?? []);
  }

  static Future<Map<String, dynamic>?> fetchReminderById(String id) async {
    final res = await http.get(
      Uri.parse('$baseUrl/reminders/$id'),
      headers: await _headers(),
    );
    if (res.statusCode == 404) return null;
    await _check(res);
    final body = jsonDecode(res.body);
    return body is Map<String, dynamic> ? body : null;
  }

  static Future<List<dynamic>> fetchNotifications() async {
    final res = await http.get(
      Uri.parse('$baseUrl/reminders/notifications'),
      headers: await _headers(),
    );
    await _check(res);
    final body = jsonDecode(res.body);
    return body is List ? body : (body['notifications'] ?? []);
  }

  static Future<void> markNotificationRead(int id) async {
    final res = await http.post(
      Uri.parse('$baseUrl/reminders/notifications/$id'),
      headers: await _headers(),
    );
    await _check(res);
  }

  static Future<void> markAllNotificationsRead() async {
    final res = await http.post(
      Uri.parse('$baseUrl/reminders/notifications/mark-all-read'),
      headers: await _headers(),
    );
    await _check(res);
  }

  static Future<void> deleteNotification(int id) async {
    final res = await http.delete(
      Uri.parse('$baseUrl/reminders/notifications/$id'),
      headers: await _headers(),
    );
    await _check(res);
  }

  static Future<Map<String, dynamic>> fetchSettings() async {
    final res = await http.get(
      Uri.parse('$baseUrl/reminders/settings'),
      headers: await _headers(),
    );
    await _check(res);
    final body = jsonDecode(res.body);
    return body is Map<String, dynamic> ? body : <String, dynamic>{};
  }

  static Future<void> registerDeviceToken(String token) async {
    final res = await http.post(
      Uri.parse('$baseUrl/reminders/device-token'),
      headers: await _headers(),
      body: jsonEncode({'token': token, 'device_type': 'flutter'}),
    );
    await _check(res);
    await saveFcmToken(token);
  }

  /// Resolve the current FCM token from Firebase and cache it locally.
  static Future<String?> resolveFcmToken() async {
    try {
      final token = await FirebaseMessaging.instance.getToken();
      if (token != null && token.isNotEmpty) {
        await saveFcmToken(token);
      }
      return token;
    } catch (_) {
      return null;
    }
  }

  /// Ask the backend to send an immediate FCM test push to registered devices.
  static Future<Map<String, dynamic>> sendTestPush() async {
    final res = await http.post(
      Uri.parse('$baseUrl/reminders/test-push'),
      headers: await _headers(),
    );
    await _check(res);
    final body = jsonDecode(res.body);
    return body is Map<String, dynamic> ? body : <String, dynamic>{};
  }

  /// Snooze a reminder by [minutes]; the backend resumes alerts afterwards.
  static Future<void> snoozeReminder(String reminderId, int minutes) async {
    final res = await http.post(
      Uri.parse('$baseUrl/reminders/$reminderId/snooze'),
      headers: await _headers(),
      body: jsonEncode({'minutes': minutes}),
    );
    await _check(res);
  }

  /// Mark a reminder as paid/completed on the server.
  static Future<void> completeReminder(String reminderId, {Map<String, dynamic>? body}) async {
    final res = await http.post(
      Uri.parse('$baseUrl/reminders/$reminderId/complete'),
      headers: await _headers(),
      body: jsonEncode(body ?? const <String, dynamic>{}),
    );
    await _check(res);
  }
}