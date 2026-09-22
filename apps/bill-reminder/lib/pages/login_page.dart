import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../services/api_service.dart';
import '../theme.dart';

class LoginPage extends StatefulWidget {
  final VoidCallback onLogin;
  const LoginPage({super.key, required this.onLogin});

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final _emailCtrl = TextEditingController();
  final _passCtrl = TextEditingController();
  bool _loading = false;
  bool _obscure = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadSaved();
  }

  Future<void> _loadSaved() async {
    final saved = await ApiService.getLastLogin();
    if (saved != null && saved.isNotEmpty && mounted) {
      _emailCtrl.text = saved;
    }
  }

  @override
  void dispose() {
    _emailCtrl.dispose();
    _passCtrl.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    final email = _emailCtrl.text.trim();
    final password = _passCtrl.text;
    if (email.isEmpty || password.isEmpty) {
      setState(() => _error = 'Please enter email and password');
      return;
    }
    setState(() { _loading = true; _error = null; });
    try {
      await ApiService.login(email, password);
      if (mounted) widget.onLogin();
    } catch (e) {
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = AppPalette.of(context);
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: kHeaderGradient,
        ),
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Container(
                    width: 72,
                    height: 72,
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(18),
                    ),
                    child: const Icon(LucideIcons.calendarClock, color: Colors.white, size: 34),
                  ),
                  const SizedBox(height: 20),
                  Text('Bill Reminder',
                    style: GoogleFonts.hankenGrotesk(
                      fontSize: 26, fontWeight: FontWeight.w700, color: Colors.white,
                    )),
                  const SizedBox(height: 6),
                  Text('Track your expenses, renewals and due dates',
                    textAlign: TextAlign.center,
                    style: GoogleFonts.manrope(
                      fontSize: 14, color: Colors.white.withValues(alpha: 0.6),
                    )),
                  const SizedBox(height: 36),
                  Container(
                    padding: const EdgeInsets.all(18),
                    decoration: BoxDecoration(
                      color: p.card,
                      borderRadius: BorderRadius.circular(16),
                      boxShadow: [BoxShadow(color: p.ink.withValues(alpha: 0.08), blurRadius: 24, offset: const Offset(0, 8))],
                    ),
                    child: Column(
                      children: [
                        TextField(
                          controller: _emailCtrl,
                          keyboardType: TextInputType.emailAddress,
                          autocorrect: false,
                          style: TextStyle(color: p.ink),
                          decoration: InputDecoration(
                            labelText: 'Email',
                            labelStyle: GoogleFonts.manrope(color: p.inkSoft),
                            prefixIcon: Icon(LucideIcons.mail, color: p.inkMute),
                            filled: true,
                            fillColor: p.field,
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(12),
                              borderSide: BorderSide.none,
                            ),
                          ),
                        ),
                        const SizedBox(height: 14),
                        TextField(
                          controller: _passCtrl,
                          obscureText: _obscure,
                          style: TextStyle(color: p.ink),
                          decoration: InputDecoration(
                            labelText: 'Password',
                            labelStyle: GoogleFonts.manrope(color: p.inkSoft),
                            prefixIcon: Icon(LucideIcons.lock, color: p.inkMute),
                            suffixIcon: IconButton(
                              icon: Icon(_obscure ? LucideIcons.eye : LucideIcons.eyeOff,
                                color: p.inkMute, size: 20),
                              onPressed: () => setState(() => _obscure = !_obscure),
                            ),
                            filled: true,
                            fillColor: p.field,
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(12),
                              borderSide: BorderSide.none,
                            ),
                          ),
                          onSubmitted: (_) => _login(),
                        ),
                        if (_error != null) ...[
                          const SizedBox(height: 12),
                          Align(
                            alignment: Alignment.centerLeft,
                            child: Text(_error!,
                              style: TextStyle(fontSize: 13, color: p.danger)),
                          ),
                        ],
                        const SizedBox(height: 22),
                        SizedBox(
                          width: double.infinity,
                          height: 50,
                          child: ElevatedButton(
                            onPressed: _loading ? null : _login,
                            style: ElevatedButton.styleFrom(
                              backgroundColor: p.blue,
                              foregroundColor: p.onBlue,
                              elevation: 0,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12),
                              ),
                            ),
                            child: _loading
                                ? SizedBox(
                                    width: 20, height: 20,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2, color: p.onBlue,
                                    ),
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