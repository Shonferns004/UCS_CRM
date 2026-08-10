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
  const androidSettings = AndroidInitializationSettings('@mipmap/ic_launcher');
  const iosSettings = DarwinInitializationSettings(
    requestAlertPermission: false,
    requestBadgePermission: false,
    requestSoundPermission: false,
  );
  await localNotifications.initialize(
    const InitializationSettings(android: androidSettings, iOS: iosSettings),
  );

    final title = message.notification?.title ?? message.data['title'] ?? 'UCS Attend';
  final body = message.notification?.body ?? message.data['body'] ?? '';
  final payload = '${message.data['type'] ?? ''}|${message.data['referenceId'] ?? ''}';

  await localNotifications.show(
    DateTime.now().millisecondsSinceEpoch ~/ 1000,
    title,
    body.isEmpty ? title : body,
    const NotificationDetails(
      android: AndroidNotificationDetails(
        'ufs_attend_channel',
        'UCS Attend Notifications',
        channelDescription: 'Push notifications from UCS Attend',
        icon: 'notification_icon',
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

    const androidSettings = AndroidInitializationSettings('@mipmap/ic_launcher');
    const iosSettings = DarwinInitializationSettings(
      requestAlertPermission: false,
      requestBadgePermission: false,
      requestSoundPermission: false,
    );
    await _localNotifications.initialize(
      const InitializationSettings(android: androidSettings, iOS: iosSettings),
      onDidReceiveNotificationResponse: _onLocalNotificationTap,
    );

    FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);

    final messaging = FirebaseMessaging.instance;

    await messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );

    final token = await messaging.getToken();
    if (token != null) {
      await _registerToken(token);
    }

    messaging.onTokenRefresh.listen(_registerToken);

    FirebaseMessaging.onMessage.listen(_onForegroundMessage);

    FirebaseMessaging.onMessageOpenedApp.listen(_onNotificationTap);
  }

  Future<void> _registerToken(String token) async {
    try {
      final worker = await ApiService.getWorkerData();
      if (worker != null && worker['id'] != null) {
        await ApiService.registerFcmToken(worker['id'].toString(), token);
      }
    } catch (_) {}
  }

  Future<void> _onForegroundMessage(RemoteMessage message) async {
  final title = message.notification?.title ?? message.data['title'] ?? 'UCS Attend';
    final body = message.notification?.body ?? message.data['body'] ?? '';
    final payload = '${message.data['type'] ?? ''}|${message.data['referenceId'] ?? ''}';

    await _localNotifications.show(
      DateTime.now().millisecondsSinceEpoch ~/ 1000,
      title,
      body.isEmpty ? title : body,
      const NotificationDetails(
        android: AndroidNotificationDetails(
          'ufs_attend_channel',
          'UCS Attend Notifications',
          channelDescription: 'Push notifications from UCS Attend',
          icon: 'notification_icon',
          importance: Importance.high,
          priority: Priority.high,
        ),
        iOS: DarwinNotificationDetails(),
      ),
      payload: payload.isNotEmpty ? payload : null,
    );
  }

  void _onLocalNotificationTap(NotificationResponse response) {
    _navigateHome();
  }

  void _onNotificationTap(RemoteMessage message) {
    _navigateHome();
  }

  void _navigateHome() {
    _navigatorKey?.currentState?.popUntil((route) => route.isFirst);
  }
}
