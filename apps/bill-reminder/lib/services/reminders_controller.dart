import 'package:flutter/foundation.dart';
import 'package:firebase_messaging/firebase_messaging.dart';

import '../models/notification_item.dart';
import '../models/reminder.dart';
import 'api_service.dart';

class RemindersController extends ChangeNotifier {
  /// Last controller created by MainShell, so detail/new pages can refresh.
  static RemindersController? instance;

  List<Reminder> reminders = [];
  List<NotificationItem> notifications = [];
  bool loading = true;
  String? error;
  DateTime? syncedAt;
  String? lastLogin;

  Future<void> refresh() async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      final data = await ApiService.fetchReminders();
      final list = data
          .whereType<Map>()
          .map((e) => Reminder.fromJson(Map<String, dynamic>.from(e)))
          .where((r) => !r.isDeleted)
          .toList();
      reminders = list;

      try {
        final n = await ApiService.fetchNotifications();
        notifications = n
            .whereType<Map>()
            .map((e) => NotificationItem.fromJson(Map<String, dynamic>.from(e)))
            .toList();
      } catch (_) {}

      lastLogin = await ApiService.getLastLogin();
      syncedAt = DateTime.now();
    } catch (e) {
      error = e.toString().replaceFirst('Exception: ', '');
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  /// Re-register the FCM token after login so pushes reach this device.
  static Future<void> registerFcmToken() async {
    try {
      final token = await ApiService.getToken();
      if (token == null) return;
      final fcm = FirebaseMessaging.instance;
      final fcmToken = await fcm.getToken();
      if (fcmToken != null) {
        await ApiService.registerDeviceToken(fcmToken);
      }
    } catch (_) {}
  }

  Future<void> markNotificationRead(int id) async {
    try {
      await ApiService.markNotificationRead(id);
    } catch (_) {}
    final i = notifications.indexWhere((n) => n.id == id);
    if (i < 0) return;
    final n = notifications[i];
    notifications[i] = NotificationItem(
      id: n.id, reminderId: n.reminderId, message: n.message,
      alertType: n.alertType, read: true, createdAt: n.createdAt,
    );
    notifyListeners();
  }

  /// Mark a reminder paid (server-side) and reload all data.
  Future<void> completeReminder(String id, {Map<String, dynamic>? body}) async {
    await ApiService.completeReminder(id, body: body);
    await refresh();
  }

  Future<void> deleteNotification(int id) async {
    try {
      await ApiService.deleteNotification(id);
    } catch (_) {}
    notifications.removeWhere((n) => n.id == id);
    notifyListeners();
  }

  Future<void> markAllNotificationsRead() async {
    try {
      await ApiService.markAllNotificationsRead();
    } catch (_) {}
    notifications = [
      for (final n in notifications)
        NotificationItem(
          id: n.id, reminderId: n.reminderId, message: n.message,
          alertType: n.alertType, read: true, createdAt: n.createdAt,
        ),
    ];
    notifyListeners();
  }
}