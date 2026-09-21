import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import 'api_service.dart';

@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  try {
    await Firebase.initializeApp();
  } catch (_) {}

  final localNotifications = FlutterLocalNotificationsPlugin();
  await localNotifications.initialize(
    const InitializationSettings(
      android: AndroidInitializationSettings('@mipmap/ic_launcher'),
      iOS: DarwinInitializationSettings(),
    ),
  );

  final title = message.notification?.title ?? message.data['title'] ?? 'Bill Reminder';
  final body = message.notification?.body ?? message.data['body'] ?? '';
  final payload = '${message.data['type'] ?? ''}|${message.data['reminderId'] ?? ''}';

  await localNotifications.show(
    DateTime.now().millisecondsSinceEpoch ~/ 1000,
    title,
    body.isEmpty ? title : body,
    const NotificationDetails(
      android: AndroidNotificationDetails(
        'bill_reminder_channel',
        'Bill Reminder Alerts',
        channelDescription: 'Reminder alerts for bills, renewals and due dates',
        icon: '@mipmap/ic_launcher',
        importance: Importance.high,
        priority: Priority.high,
      ),
      iOS: DarwinNotificationDetails(),
    ),
    payload: payload.isNotEmpty ? payload : null,
  );
}

class NotificationService {
  static final NotificationService _instance = NotificationService._();
  factory NotificationService() => _instance;
  NotificationService._();

  final FlutterLocalNotificationsPlugin _localNotifications =
      FlutterLocalNotificationsPlugin();
  bool _initialized = false;
  GlobalKey<NavigatorState>? _navigatorKey;

  void setNavigatorKey(GlobalKey<NavigatorState> key) {
    _navigatorKey = key;
  }

  Future<void> init() async {
    if (_initialized) return;
    _initialized = true;

    try {
      await Firebase.initializeApp();
    } catch (_) {}

    try {
      await _localNotifications.initialize(
        const InitializationSettings(
          android: AndroidInitializationSettings('@mipmap/ic_launcher'),
          iOS: DarwinInitializationSettings(),
        ),
        onDidReceiveNotificationResponse: _onLocalNotificationTap,
      );
    } catch (_) {}

    try {
      FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);

      final messaging = FirebaseMessaging.instance;
      await messaging.requestPermission(alert: true, badge: true, sound: true);

      final token = await messaging.getToken();
      if (token != null) {
        await _registerToken(token);
      }

      messaging.onTokenRefresh.listen(_registerToken);
      FirebaseMessaging.onMessage.listen(_onForegroundMessage);
      FirebaseMessaging.onMessageOpenedApp.listen(_onNotificationTap);
    } catch (_) {}
  }

  Future<void> _registerToken(String token) async {
    try {
      final hasToken = await ApiService.getToken();
      if (hasToken != null) {
        await ApiService.registerDeviceToken(token);
      }
    } catch (_) {}
  }

  Future<void> _onForegroundMessage(RemoteMessage message) async {
    final title = message.notification?.title ?? message.data['title'] ?? 'Bill Reminder';
    final body = message.notification?.body ?? message.data['body'] ?? '';
    final payload = '${message.data['type'] ?? ''}|${message.data['reminderId'] ?? ''}';

    await _localNotifications.show(
      DateTime.now().millisecondsSinceEpoch ~/ 1000,
      title,
      body.isEmpty ? title : body,
      const NotificationDetails(
        android: AndroidNotificationDetails(
          'bill_reminder_channel',
          'Bill Reminder Alerts',
          channelDescription: 'Reminder alerts for bills, renewals and due dates',
          icon: '@mipmap/ic_launcher',
          importance: Importance.high,
          priority: Priority.high,
        ),
        iOS: DarwinNotificationDetails(),
      ),
      payload: payload.isNotEmpty ? payload : null,
    );
  }

  void _onLocalNotificationTap(NotificationResponse response) {
    final payload = response.payload;
    if (payload == null) return;
    _openReminder(payload);
  }

  void _onNotificationTap(RemoteMessage message) {
    final payload = '${message.data['type'] ?? ''}|${message.data['reminderId'] ?? ''}';
    _openReminder(payload);
  }

  void _openReminder(String payload) {
    final parts = payload.split('|');
    final reminderId = parts.length > 1 ? parts[1] : '';
    _navigatorKey?.currentState?.pushNamed(
      '/detail',
      arguments: {'id': reminderId, 'from': 'push'},
    );
  }
}