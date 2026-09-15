import 'package:flutter/material.dart';
import 'core/theme/app_theme.dart';
import 'services/api_service.dart';
import 'features/auth/login_page.dart';
import 'features/home/home_page.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
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

  @override
  void initState() {
    super.initState();
    _checkAuth();
  }

  Future<void> _checkAuth() async {
    final loggedIn = await ApiService.isLoggedIn();
    if (mounted) setState(() => _loggedIn = loggedIn);
  }

  @override
  Widget build(BuildContext context) {
    if (_loggedIn == null) {
      return const Scaffold(
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text('BEING SEVAK', style: TextStyle(fontSize: 12, letterSpacing: 2, color: AppTheme.textSecondary)),
              SizedBox(height: 8),
              Text('Beneficiaries', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w700, color: AppTheme.primary)),
              SizedBox(height: 24),
              CircularProgressIndicator(strokeWidth: 2),
            ],
          ),
        ),
      );
    }
    if (_loggedIn!) {
      return HomePage(onLogout: () {
        setState(() => _loggedIn = false);
      });
    }
    return LoginPage(onLogin: () {
      setState(() => _loggedIn = true);
    });
  }
}
