import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';
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
    setState(() { _loading = true; _error = null; });
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
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Text('BEING SEVAK', style: TextStyle(fontSize: 12, letterSpacing: 2, color: AppTheme.textSecondary)),
                const SizedBox(height: 8),
                const Text('Beneficiaries', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w700, color: AppTheme.primary)),
                const SizedBox(height: 32),
                if (_error != null)
                  Container(
                    padding: const EdgeInsets.all(12),
                    margin: const EdgeInsets.only(bottom: 16),
                    decoration: BoxDecoration(color: AppTheme.error.withAlpha(20), borderRadius: BorderRadius.circular(8)),
                    child: Text(_error!, style: const TextStyle(color: AppTheme.error, fontSize: 13)),
                  ),
                TextField(
                  controller: _identifierController,
                  decoration: const InputDecoration(labelText: 'Mobile / Email / Login ID'),
                  keyboardType: TextInputType.emailAddress,
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _passwordController,
                  decoration: const InputDecoration(labelText: 'Password'),
                  obscureText: true,
                  onSubmitted: (_) => _login(),
                ),
                const SizedBox(height: 24),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: _loading ? null : _login,
                    child: _loading
                        ? const SizedBox(height: 16, width: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : const Text('Login'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
