import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'api_service.dart';
import '../widgets/app_toast.dart';

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
  await localNotifications
      .resolvePlatformSpecificImplementation<
        AndroidFlutterLocalNotificationsPlugin
      >()
      ?.createNotificationChannel(
        const AndroidNotificationChannel(
          'ufs_attend_channel',
          'UCS Attend Notifications',
          description: 'Push notifications from UCS Attend',
          importance: Importance.high,
        ),
      );

  final title =
      message.notification?.title ?? message.data['title'] ?? 'UCS Attend';
  final body = message.notification?.body ?? message.data['body'] ?? '';
  final payload =
      '${message.data['type'] ?? ''}|${message.data['referenceId'] ?? ''}';

  // A message that carries a `notification` block is rendered by the OS in the
  // background. Only data-only messages need a local notification here, or the
  // worker would see the same alert twice.
  if (message.notification == null) {
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
}

class NotificationService extends ChangeNotifier {
  static final NotificationService _instance = NotificationService._();
  factory NotificationService() => _instance;
  NotificationService._();

  final FlutterLocalNotificationsPlugin _localNotifications =
      FlutterLocalNotificationsPlugin();
  bool _initialized = false;
  bool _pushReady = false;
  GlobalKey<NavigatorState>? _navigatorKey;

  /// True once Firebase is configured and an FCM token exists. When false the
  /// home screen falls back to local notifications for newly polled rows.
  bool get pushReady => _pushReady;

  void setNavigatorKey(GlobalKey<NavigatorState> key) {
    _navigatorKey = key;
  }

  Future<void> init() async {
    if (_initialized) return;
    _initialized = true;

    var firebaseReady = false;
    try {
      await Firebase.initializeApp();
      firebaseReady = true;
    } catch (_) {}

    const androidSettings = AndroidInitializationSettings(
      '@mipmap/ic_launcher',
    );
    const iosSettings = DarwinInitializationSettings(
      requestAlertPermission: false,
      requestBadgePermission: false,
      requestSoundPermission: false,
    );
    await _localNotifications.initialize(
      const InitializationSettings(android: androidSettings, iOS: iosSettings),
      onDidReceiveNotificationResponse: _onLocalNotificationTap,
    );
    await _localNotifications
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >()
        ?.createNotificationChannel(
          const AndroidNotificationChannel(
            'ufs_attend_channel',
            'UCS Attend Notifications',
            description: 'Push notifications from UCS Attend',
            importance: Importance.high,
          ),
        );
    try {
      await _localNotifications
          .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin
          >()
          ?.requestNotificationsPermission();
      await _localNotifications
          .resolvePlatformSpecificImplementation<
            IOSFlutterLocalNotificationsPlugin
          >()
          ?.requestPermissions(alert: true, badge: true, sound: true);
    } catch (_) {}

    if (!firebaseReady) return;

    try {
      FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);

      final messaging = FirebaseMessaging.instance;

      await messaging.requestPermission(alert: true, badge: true, sound: true);

      final token = await messaging.getToken();
      if (token != null) {
        await _registerToken(token);
      }
      _pushReady = token != null;

      messaging.onTokenRefresh.listen(_registerToken);

      FirebaseMessaging.onMessage.listen(_onForegroundMessage);

      FirebaseMessaging.onMessageOpenedApp.listen(_onNotificationTap);
    } catch (_) {
      _pushReady = false;
    }
  }

  /// Local OS notification used when FCM is not configured in the build.
  Future<void> showLocalNotification(
    String title,
    String body, {
    String? payload,
  }) async {
    try {
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
        payload: payload,
      );
    } catch (_) {}
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
    final title =
        message.notification?.title ?? message.data['title'] ?? 'UCS Attend';
    final body = message.notification?.body ?? message.data['body'] ?? '';
    final payload =
        '${message.data['type'] ?? ''}|${message.data['referenceId'] ?? ''}';

    // Android/iOS do not display a push banner by themselves while the app is
    // in the foreground, so show it via the local plugin ...
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

    // ... and also surface it inside the app as an in-app banner.
    try {
      AppToast.info(title, description: body.isEmpty ? null : body);
    } catch (_) {}

    // The home bell/list listens to this and refetches from the server.
    notifyListeners();
  }

  void _onLocalNotificationTap(NotificationResponse response) {
    notifyListeners();
    _navigateHome();
  }

  void _onNotificationTap(RemoteMessage message) {
    notifyListeners();
    _navigateHome();
  }

  void _navigateHome() {
    _navigatorKey?.currentState?.popUntil((route) => route.isFirst);
  }
}
