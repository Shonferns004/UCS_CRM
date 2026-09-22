import 'package:flutter/material.dart';
import '../../core/theme/app_text_styles.dart';
import '../../core/widgets/app_skeleton.dart';
import '../../core/widgets/app_snackbar.dart';
import '../../services/api_service.dart';

class LoginPage extends StatefulWidget {
  final VoidCallback onLogin;
  const LoginPage({super.key, required this.onLogin});

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final _identifierController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadLastLogin();
  }

  Future<void> _loadLastLogin() async {
    final data = await ApiService.getVolunteerData();
    if (data != null && mounted) {
      _identifierController.text = data['login_id'] ?? data['email'] ?? '';
    }
  }

  Future<void> _login() async {
    if (_identifierController.text.isEmpty || _passwordController.text.isEmpty) {
      setState(() => _error = 'Please enter credentials');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final result = await ApiService.post('/auth/worker/login', body: {
        'identifier': _identifierController.text.trim(),
        'password': _passwordController.text,
      });
      await ApiService.saveToken(result['token']);
      await ApiService.saveVolunteerData({
        ...result['user'] ?? {},
        'login_id': _identifierController.text.trim(),
        'role': result['role'],
      });
      widget.onLogin();
    } catch (e) {
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text(
                  'BEING SEVAK',
                  textAlign: TextAlign.center,
                  style: AppTextStyles.pageLabel,
                ),
                const SizedBox(height: 12),
                const Text(
                  'Welcome back',
                  textAlign: TextAlign.center,
                  style: AppTextStyles.pageTitle,
                ),
                const SizedBox(height: 6),
                const Text(
                  'Sign in to help those who need it most.',
                  textAlign: TextAlign.center,
                  style: AppTextStyles.pageSubtitle,
                ),
                const SizedBox(height: 36),
                if (_error != null) ...[
                  errorHint(context, _error!),
                  const SizedBox(height: 16),
                ],
                TextField(
                  controller: _identifierController,
                  decoration: const InputDecoration(
                    labelText: 'Mobile / Email / Login ID',
                  ),
                  keyboardType: TextInputType.emailAddress,
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _passwordController,
                  decoration: const InputDecoration(labelText: 'Password'),
                  obscureText: true,
                  onSubmitted: (_) => _login(),
                ),
                const SizedBox(height: 28),
                ElevatedButton(
                  onPressed: _loading ? null : _login,
                  child: _loading
                      ? const SkeletonBox(
                          width: 20,
                          height: 20,
                          borderRadius: 6,
                          baseColor: Colors.white24,
                          shineColor: Colors.white,
                        )
                      : const Text('Login',
                          style: TextStyle(
                              fontSize: 16, fontWeight: FontWeight.w600)),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}