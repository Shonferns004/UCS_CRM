import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'models/reminder.dart';
import 'pages/detail_page.dart';
import 'pages/login_page.dart';
import 'pages/main_shell.dart';
import 'services/api_service.dart';
import 'services/notification_service.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: Brightness.light,
    statusBarBrightness: Brightness.dark,
    systemNavigationBarColor: Colors.white,
    systemNavigationBarIconBrightness: Brightness.dark,
  ));
  try {
    await Firebase.initializeApp();
  } catch (_) {}
  runApp(const BillReminderApp());
}

class BillReminderApp extends StatefulWidget {
  const BillReminderApp({super.key});

  @override
  State<BillReminderApp> createState() => _BillReminderAppState();
}

class _BillReminderAppState extends State<BillReminderApp> {
  final GlobalKey<NavigatorState> _navigatorKey = GlobalKey<NavigatorState>();
  bool? _loggedIn;

  @override
  void initState() {
    super.initState();
    NotificationService().setNavigatorKey(_navigatorKey);
    _init();
  }

  Future<void> _init() async {
    try {
      await NotificationService().init();
    } catch (_) {}
    String? token;
    try {
      token = await ApiService.getToken();
    } catch (_) {}
    if (mounted) setState(() => _loggedIn = token != null);
    await _handleInitialPush();
  }

  Future<void> _handleInitialPush() async {
    try {
      final loggedIn = await ApiService.getToken();
      if (loggedIn == null) return;
      final message = await FirebaseMessaging.instance.getInitialMessage();
      if (message == null) return;
      final id = message.data['reminderId'];
      if (id == null || id.toString().isEmpty) return;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _navigatorKey.currentState?.pushNamed('/detail', arguments: {'id': id.toString()});
      });
    } catch (_) {}
  }

  Widget _notFound() => const Scaffold(
        body: Center(child: Text('Reminder not found')),
      );

  Future<void> _logout() async {
    try {
      await ApiService.clearAuth();
    } catch (_) {}
    _navigatorKey.currentState?.popUntil((r) => r.isFirst);
    if (mounted) setState(() => _loggedIn = false);
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Bill Reminder',
      debugShowCheckedModeBanner: false,
      navigatorKey: _navigatorKey,
      theme: ThemeData(
        useMaterial3: true,
        scaffoldBackgroundColor: const Color(0xFFf5f7fa),
        fontFamilyFallback: const ['Roboto'],
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF2563eb),
        ),
      ),
      routes: {
        '/detail': (context) {
          final args = ModalRoute.of(context)?.settings.arguments;
          final id = (args is Map && args['id'] != null) ? args['id'].toString() : null;
          if (id == null || id.isEmpty) return _notFound();
          return FutureBuilder<Map<String, dynamic>?>(
            future: ApiService.fetchReminderById(id),
            builder: (context, snap) {
              if (snap.connectionState != ConnectionState.done) {
                return const Scaffold(
                  body: Center(child: CircularProgressIndicator()),
                );
              }
              final data = snap.data;
              if (data == null) return _notFound();
              return DetailPage(
                reminder: Reminder.fromJson(Map<String, dynamic>.from(data)),
              );
            },
          );
        },
      },
      home: _loggedIn == null
          ? const Scaffold(
              body: Center(child: CircularProgressIndicator()),
            )
          : _loggedIn!
              ? MainShell(onLogout: _logout)
              : LoginPage(onLogin: () {
                  setState(() => _loggedIn = true);
                }),
    );
  }
}