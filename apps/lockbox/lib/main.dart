import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import 'channel.dart';
import 'core/theme/app_theme.dart';
import 'screens/pin_screen.dart';
import 'screens/shell.dart';
import 'screens/splash_screen.dart';
import 'wizard/setup_wizard.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const LockBoxApp());
}

class LockBoxApp extends StatefulWidget {
  const LockBoxApp({super.key});

  @override
  State<LockBoxApp> createState() => _LockBoxAppState();
}

class _LockBoxAppState extends State<LockBoxApp> {
  bool _ready = false;
  bool _setupComplete = false;
  bool _hasPin = false;
  bool _skipPinOnce = false;

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    try {
      final complete = await LockBoxChannel.isSetupComplete();
      final pin = await LockBoxChannel.hasPin();
      if (!mounted) return;
      setState(() {
        _setupComplete = complete;
        _hasPin = pin;
        _ready = true;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _ready = true);
    }
  }

  void _onSetupFinished() {
    setState(() {
      _setupComplete = true;
      _hasPin = true;
      _skipPinOnce = true; // they just set the PIN themselves
    });
  }

  void _onPinUnlocked() {
    setState(() => _skipPinOnce = true);
  }

  void _onReset() {
    setState(() {
      _setupComplete = false;
      _hasPin = false;
      _skipPinOnce = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'LockBox',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      darkTheme: AppTheme.dark,
      themeMode: ThemeMode.system,
      home: _home(),
    );
  }

  Widget _home() {
    if (!_ready) return const SplashScreen();

    if (!_setupComplete) {
      return SetupWizard(onFinished: _onSetupFinished);
    }

    if (_hasPin && !_skipPinOnce) {
      return PinScreen(onUnlocked: _onPinUnlocked, hintIcon: LucideIcons.lock);
    }

    return Shell(onReset: _onReset);
  }
}