import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import 'channel.dart';
import 'core/theme/app_theme.dart';
import 'screens/owner_protection_page.dart';
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
  /// The splash used to appear only while the two channel calls were in
  /// flight. On a warm process those resolve within a frame, so the splash
  /// flashed and vanished. Holding it briefly gives the branding a moment to
  /// land and hides the channel round-trip behind it.
  static const _minSplash = Duration(milliseconds: 1100);

  bool _ready = false;
  bool _setupComplete = false;
  bool _hasPin = false;
  bool _skipPinOnce = false;

  /// Set when the secret dialer code opened the app. Deferred until a Navigator
  /// exists, because the splash/wizard branches have no Navigator to push onto.
  bool _secretLaunch = false;
  bool _secretRouted = false;

  /// This widget's own context sits above the [MaterialApp], so it has no
  /// Navigator ancestor to push onto. A key on MaterialApp is the only way to
  /// reach the real Navigator from here.
  final _navigatorKey = GlobalKey<NavigatorState>();

  @override
  void initState() {
    super.initState();
    _bootstrap();
    // Covers the warm case, where the app is already running and the native
    // side pushes the event. Native emits {eventName: value}.
    LockBoxChannel.events.listen((event) {
      if (event['secretCodeUsed'] == true) {
        setState(() {
          _secretLaunch = true;
          _secretRouted = false;
        });
        _routeSecretLaunch();
      }
    });
  }

  Future<void> _routeSecretLaunch() async {
    if (!_ready || !_setupComplete || _secretRouted || !_secretLaunch) return;
    final navigator = _navigatorKey.currentState;
    // Not mounted yet (or already handled this launch) — nothing to do.
    if (navigator == null || _secretRouted) return;
    _secretRouted = true;
    await navigator.push(
      MaterialPageRoute<void>(
        builder: (_) => const OwnerProtectionPage(requirePinFirst: true),
      ),
    );
  }

  Future<void> _bootstrap() async {
    final startedAt = DateTime.now();
    var complete = false;
    var pin = false;
    var secret = false;
    try {
      final results = await Future.wait([
        LockBoxChannel.isSetupComplete(),
        LockBoxChannel.hasPin(),
        LockBoxChannel.consumeSecretCodeLaunch(),
      ]);
      complete = results[0];
      pin = results[1];
      secret = results[2];
    } catch (_) {
      // Leave all false; the wizard is the safe landing spot.
    }

    final elapsed = DateTime.now().difference(startedAt);
    final remaining = _minSplash - elapsed;
    if (remaining > Duration.zero) {
      await Future<void>.delayed(remaining);
    }
    if (!mounted) return;
    setState(() {
      _setupComplete = complete;
      _hasPin = pin;
      _secretLaunch = secret;
      // The owner page opens behind its own PIN gate, so demanding the lock
      // screen PIN as well would just make the guardian type it twice.
      _skipPinOnce = secret;
      _ready = true;
    });
    WidgetsBinding.instance.addPostFrameCallback((_) => _routeSecretLaunch());
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
      navigatorKey: _navigatorKey,
      theme: AppTheme.light,
      darkTheme: AppTheme.dark,
      themeMode: ThemeMode.system,
      home: AnimatedSwitcher(
        duration: const Duration(milliseconds: 420),
        switchInCurve: Curves.easeOutCubic,
        switchOutCurve: Curves.easeInCubic,
        transitionBuilder: (child, animation) => FadeTransition(
          opacity: animation,
          child: child,
        ),
        child: KeyedSubtree(
          key: ValueKey(_ready ? 'app' : 'splash'),
          child: _home(),
        ),
      ),
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