import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import 'api_service.dart';

const String kReminderChannelId = 'bill_reminder_channel';
const String kSnooze10 = 'snooze_10';
const String kSnooze60 = 'snooze_60';

const List<AndroidNotificationAction> kSnoozeActions = [
  AndroidNotificationAction(kSnooze10, 'Snooze 10 min', showsUserInterface: false),
  AndroidNotificationAction(kSnooze60, 'Snooze 1 hour', showsUserInterface: false),
];

@pragma('vm:entry-point')
Future<void> notificationTapBackground(NotificationResponse response) async {
  final payload = response.payload;
  final actionId = response.actionId;
  if (payload == null || actionId == null) return;
  final parts = payload.split('|');
  final reminderId = parts.length > 1 ? parts[1] : '';
  if (reminderId.isEmpty) return;
  final minutes = actionId == kSnooze60 ? 60 : 10;
  try {
    await ApiService.snoozeReminder(reminderId, minutes);
  } catch (_) {}
}

@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  try {
    await Firebase.initializeApp();
  } catch (_) {}

  final localNotifications = FlutterLocalNotificationsPlugin();
  await localNotifications.initialize(
    const InitializationSettings(
      android: AndroidInitializationSettings('@drawable/ic_stat_bill_reminder'),
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
        kReminderChannelId,
        'Bill Reminder Alerts',
        channelDescription: 'Reminder alerts for bills, renewals and due dates',
        icon: '@drawable/ic_stat_bill_reminder',
        importance: Importance.high,
        priority: Priority.high,
        playSound: true,
        enableVibration: true,
        category: AndroidNotificationCategory.reminder,
        actions: kSnoozeActions,
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
          android: AndroidInitializationSettings('@drawable/ic_stat_bill_reminder'),
          iOS: DarwinInitializationSettings(),
        ),
        onDidReceiveNotificationResponse: _onLocalNotificationTap,
        onDidReceiveBackgroundNotificationResponse: notificationTapBackground,
      );
    } catch (_) {}

    try {
      final androidPlugin = _localNotifications
          .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
      await androidPlugin?.createNotificationChannel(
        const AndroidNotificationChannel(
          kReminderChannelId,
          'Bill Reminder Alerts',
          description: 'Reminder alerts for bills, renewals and due dates',
          importance: Importance.high,
          playSound: true,
          enableVibration: true,
        ),
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
          kReminderChannelId,
          'Bill Reminder Alerts',
          channelDescription: 'Reminder alerts for bills, renewals and due dates',
          icon: '@drawable/ic_stat_bill_reminder',
          importance: Importance.high,
          priority: Priority.high,
          playSound: true,
          enableVibration: true,
          category: AndroidNotificationCategory.reminder,
          actions: kSnoozeActions,
        ),
        iOS: DarwinNotificationDetails(),
      ),
      payload: payload.isNotEmpty ? payload : null,
    );
  }

  void _onLocalNotificationTap(NotificationResponse response) {
    final payload = response.payload;
    if (payload == null) return;
    final actionId = response.actionId;
    if (actionId == kSnooze10 || actionId == kSnooze60) {
      final parts = payload.split('|');
      final reminderId = parts.length > 1 ? parts[1] : '';
      if (reminderId.isNotEmpty) {
        ApiService.snoozeReminder(reminderId, actionId == kSnooze60 ? 60 : 10).catchError((_) {});
      }
      return;
    }
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