import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../services/api_service.dart';

class LoginPage extends StatefulWidget {
  final VoidCallback onLogin;
  const LoginPage({super.key, required this.onLogin});

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> with SingleTickerProviderStateMixin {
  final _loginCtrl = TextEditingController();
  final _passCtrl = TextEditingController();
  bool _loading = false;
  String? _error;
  late final AnimationController _animCtrl;
  late final Animation<double> _anim;

  @override
  void initState() {
    super.initState();
    _animCtrl = AnimationController(vsync: this, duration: const Duration(seconds: 8));
    _anim = Tween<double>(begin: 0, end: 1).animate(_animCtrl);
    _animCtrl.repeat(reverse: true);
    _loadSavedLogin();
  }

  Future<void> _loadSavedLogin() async {
    final saved = await ApiService.getLastLoginId();
    if (saved != null && saved.isNotEmpty && mounted) {
      _loginCtrl.text = saved;
    }
  }

  @override
  void dispose() {
    _animCtrl.dispose();
    _loginCtrl.dispose();
    _passCtrl.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    setState(() { _loading = true; _error = null; });
    try {
      final data = await ApiService.login(_loginCtrl.text.trim(), _passCtrl.text);
      await ApiService.saveToken(data['token']);
      await ApiService.saveWorkerData(data['user']);
      await ApiService.saveLastLoginId(_loginCtrl.text.trim());
      if (mounted) widget.onLogin();
    } catch (e) {
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: AnimatedBuilder(
        animation: _anim,
        builder: (context, child) {
          return Container(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  Color.lerp(const Color(0xFF0f172a), const Color(0xFF1e3a8a), _anim.value)!,
                  Color.lerp(const Color(0xFF1e293b), const Color(0xFF2563eb), _anim.value)!,
                ],
              ),
            ),
            child: Stack(
              children: [
                Positioned(
                  top: -40 + _anim.value * 20,
                  left: -30 + _anim.value * 15,
                  child: Container(
                    width: 200, height: 200,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: const Color(0xFF3b82f6).withValues(alpha: 0.12),
                    ),
                  ),
                ),
                Positioned(
                  bottom: 60 - _anim.value * 25,
                  right: -50 + _anim.value * 20,
                  child: Container(
                    width: 260, height: 260,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: const Color(0xFF60a5fa).withValues(alpha: 0.08),
                    ),
                  ),
                ),
                Positioned(
                  top: 200 + _anim.value * 30,
                  left: -60 + _anim.value * 10,
                  child: Container(
                    width: 160, height: 160,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: const Color(0xFF2563eb).withValues(alpha: 0.10),
                    ),
                  ),
                ),
                Positioned(
                  top: 80 - _anim.value * 15,
                  right: 20 - _anim.value * 10,
                  child: Container(
                    width: 100, height: 100,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: const Color(0xFF93c5fd).withValues(alpha: 0.10),
                    ),
                  ),
                ),
                child!,
              ],
            ),
          );
        },
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(12),
                    child: Image.asset(
                      'assets/logo/logo.png',
                      width: 72, height: 72,
                    ),
                  ),
                  const SizedBox(height: 24),
                  Text('UCS Attendance', style: GoogleFonts.hankenGrotesk(
                    fontSize: 24, fontWeight: FontWeight.w700, color: Colors.white,
                  )),
                  const SizedBox(height: 4),
                  Text('Sign in to mark attendance',
                    style: GoogleFonts.manrope(
                      fontSize: 14, color: Colors.white.withValues(alpha: 0.6),
                    ),
                  ),
                  const SizedBox(height: 32),
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: const Color(0xFFffffff),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: const Color(0xFF2563eb)),
                    ),
                    child: Column(
                      children: [
                        TextField(
                          controller: _loginCtrl,
                          decoration: InputDecoration(
                            labelText: 'Login ID',
                            hintText: 'name.lastname@ufs',
                            keyboardType: TextInputType.text,
                            hintStyle: GoogleFonts.manrope(color: const Color(0xFF9ca3af)),
                            labelStyle: GoogleFonts.manrope(color: const Color(0xFF43474d)),
                            prefixIcon: Icon(LucideIcons.user, color: const Color(0xFF74777e)),
                            filled: true,
                            fillColor: const Color(0xFFf0f4f8),
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(4),
                              borderSide: BorderSide.none,
                            ),
                          ),
                        ),
                        const SizedBox(height: 16),
                        TextField(
                          controller: _passCtrl,
                          obscureText: true,
                          decoration: InputDecoration(
                            labelText: 'Password',
                            labelStyle: GoogleFonts.manrope(color: const Color(0xFF43474d)),
                            prefixIcon: Icon(LucideIcons.lock, color: const Color(0xFF74777e)),
                            filled: true,
                            fillColor: const Color(0xFFf0f4f8),
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(4),
                              borderSide: BorderSide.none,
                            ),
                          ),
                        ),
                        if (_error != null) ...[
                          const SizedBox(height: 12),
                          Text(_error!, style: TextStyle(fontSize: 13, color: const Color(0xFFba1a1a))),
                        ],
                        const SizedBox(height: 24),
                        SizedBox(
                          width: double.infinity,
                          height: 48,
                          child: ElevatedButton(
                            onPressed: _loading ? null : _login,
                            style: ElevatedButton.styleFrom(
                              backgroundColor: const Color(0xFF2563eb),
                              foregroundColor: Colors.white,
                              elevation: 0,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(4),
                              ),
                            ),
                            child: _loading
                                ? const Row(
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    children: [
                                      SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)),
                                      SizedBox(width: 10),
                                      Text('Signing in...', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: Colors.white)),
                                    ],
                                  )
                                : Text('Sign In', style: GoogleFonts.hankenGrotesk(
                                    fontSize: 16, fontWeight: FontWeight.w700,
                                  )),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
