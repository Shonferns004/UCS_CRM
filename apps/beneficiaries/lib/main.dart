import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'core/theme/app_theme.dart';
import 'core/widgets/app_skeleton.dart';
import 'services/api_service.dart';
import 'features/auth/login_page.dart';
import 'features/auth/operator_setup_page.dart';
import 'features/home/home_page.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: Brightness.dark,
    statusBarBrightness: Brightness.light,
    systemNavigationBarColor: Color(0xFFF8F9FB),
    systemNavigationBarIconBrightness: Brightness.dark,
  ));
  runApp(const BeneficiariesApp());
}

class BeneficiariesApp extends StatelessWidget {
  const BeneficiariesApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Beneficiaries',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.lightTheme,
      home: const AuthGate(),
    );
  }
}

class AuthGate extends StatefulWidget {
  const AuthGate({super.key});

  @override
  State<AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<AuthGate> {
  bool? _loggedIn;
  bool? _setupNeeded;

  @override
  void initState() {
    super.initState();
    _checkAuth();
  }

  Future<void> _checkAuth() async {
    final loggedIn = await ApiService.isLoggedIn();
    if (!loggedIn) {
      if (mounted) {
        setState(() {
          _loggedIn = false;
          _setupNeeded = null;
        });
      }
      return;
    }
    final setupNeeded = await _checkOperatorSetup();
    if (mounted) {
      setState(() {
        _loggedIn = true;
        _setupNeeded = setupNeeded;
      });
    }
  }

  Future<bool> _checkOperatorSetup() async {
    // Operator Details is always the first screen after login.
    return true;
  }

  void _onLogin() {
    setState(() {
      _loggedIn = true;
      _setupNeeded = null;
    });
    _resolveSetup();
  }

  Future<void> _resolveSetup() async {
    final setupNeeded = await _checkOperatorSetup();
    if (mounted) setState(() => _setupNeeded = setupNeeded);
  }

  void _onLogout() {
    setState(() {
      _loggedIn = false;
      _setupNeeded = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    final busy = _loggedIn == null || (_loggedIn == true && _setupNeeded == null);
    if (busy) {
      return const Scaffold(
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text('BEING SEVAK', style: TextStyle(fontSize: 13, letterSpacing: 3, fontWeight: FontWeight.w500, color: Color(0xFF7B8494))),
              SizedBox(height: 12),
              Text('Together for a better tomorrow.', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w500, color: Color(0xFF111827))),
              SizedBox(height: 28),
              SkeletonBox(
                width: 140,
                height: 8,
                borderRadius: 4,
                baseColor: Color(0xFFE6E9EE),
                shineColor: Color(0xFFF8F9FB),
              ),
            ],
          ),
        ),
      );
    }
    if (_loggedIn!) {
      if (_setupNeeded!) {
        return OperatorSetupPage(
          onComplete: () => setState(() => _setupNeeded = false),
        );
      }
      return HomePage(onLogout: _onLogout);
    }
    return LoginPage(onLogin: _onLogin);
  }
}
