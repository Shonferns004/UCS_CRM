import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../theme/app_palette.dart';
import '../widgets/app_toast.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:flutter_tabler_icons/flutter_tabler_icons.dart';
import '../services/backend_picker.dart';
import '../services/api_service.dart';
import '../widgets/ui_motion.dart';

class LoginPage extends StatefulWidget {
  final VoidCallback onLogin;
  const LoginPage({super.key, required this.onLogin});

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage>
    with SingleTickerProviderStateMixin {
  final _loginCtrl = TextEditingController();
  final _passCtrl = TextEditingController();
  bool _loading = false;
  late final AnimationController _animCtrl;
  late final Animation<double> _anim;

  @override
  void initState() {
    super.initState();
    _animCtrl = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 8),
    );
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
    setState(() {
      _loading = true;
    });
    try {
      final data = await ApiService.login(
        _loginCtrl.text.trim(),
        _passCtrl.text,
      );
      await ApiService.saveToken(data['token']);
      final refresh = data['refresh_token'];
      if (refresh is String && refresh.isNotEmpty) {
        await ApiService.saveRefreshToken(refresh);
      }
      final userData = data['user'];
      if (userData is Map<String, dynamic>) {
        userData['role'] = data['role'];
        await ApiService.saveWorkerData(userData);
      } else {
        await ApiService.saveWorkerData({});
      }
      await ApiService.saveLastLoginId(_loginCtrl.text.trim());
      await ApiService.isNgoAdmin();
      AppToast.success('Signed in successfully');
      if (mounted) widget.onLogin();
    } catch (e) {
      final message = e.toString().replaceFirst('Exception: ', '');
      AppToast.error(message);
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
                  Color.lerp(
                    AppPalette.iceBlue,
                    const Color(0xFFF7FBFF),
                    _anim.value,
                  )!,
                  Color.lerp(
                    AppPalette.iceDeep,
                    AppPalette.iceBlue,
                    _anim.value,
                  )!,
                ],
              ),
            ),
            child: Stack(
              children: [
                Positioned(
                  top: -40 + _anim.value * 20,
                  left: -30 + _anim.value * 15,
                  child: Container(
                    width: 200,
                    height: 200,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: AppPalette.aqua.withValues(alpha: 0.18),
                    ),
                  ),
                ),
                Positioned(
                  bottom: 60 - _anim.value * 25,
                  right: -50 + _anim.value * 20,
                  child: Container(
                    width: 260,
                    height: 260,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: AppPalette.ocean.withValues(alpha: 0.08),
                    ),
                  ),
                ),
                Positioned(
                  top: 200 + _anim.value * 30,
                  left: -60 + _anim.value * 10,
                  child: Container(
                    width: 160,
                    height: 160,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: AppPalette.aqua.withValues(alpha: 0.10),
                    ),
                  ),
                ),
                Positioned(
                  top: 80 - _anim.value * 15,
                  right: 20 - _anim.value * 10,
                  child: Container(
                    width: 100,
                    height: 100,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: Colors.white.withValues(alpha: 0.65),
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
              child: StaggeredReveal(
                index: 0,
                duration: const Duration(milliseconds: 560),
                offsetY: 22,
                scaleFrom: 0.98,
                curve: Curves.easeOutCubic,
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    GestureDetector(
                      onLongPress: () {
                        HapticFeedback.mediumImpact();
                        BackendPicker.showPicker(context);
                      },
                      child: Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: AppPalette.white,
                          borderRadius: BorderRadius.circular(26),
                          boxShadow: AppPalette.lift(0.9),
                        ),
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(18),
                          child: Image.asset(
                            'assets/logo/logo.png',
                            width: 72,
                            height: 72,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 24),
                    Text(
                      'UCS Attendance',
                      style: GoogleFonts.hankenGrotesk(
                        fontSize: 26,
                        fontWeight: FontWeight.w700,
                        color: AppPalette.ink,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Sign in to mark attendance',
                      style: GoogleFonts.manrope(
                        fontSize: 14,
                        color: AppPalette.muted,
                      ),
                    ),
                    const SizedBox(height: 32),
                    Container(
                      padding: const EdgeInsets.all(20),
                      decoration: BoxDecoration(
                        color: AppPalette.white,
                        borderRadius: BorderRadius.circular(26),
                        boxShadow: AppPalette.lift(1.1),
                      ),
                      child: Column(
                        children: [
                          TextField(
                            controller: _loginCtrl,
                            keyboardType: TextInputType.text,
                            textInputAction: TextInputAction.next,
                            style: TextStyle(
                              fontSize: 15,
                              color: AppPalette.ink,
                            ),
                            decoration: InputDecoration(
                              labelText: 'Login ID',
                              hintText: 'name.lastname@ufs',
                              hintStyle: GoogleFonts.manrope(
                                color: const Color(0xff8ba7bd),
                              ),
                              labelStyle: GoogleFonts.manrope(
                                color: AppPalette.muted,
                              ),
                              prefixIcon: const Icon(
                                TablerIcons.user,
                                color: AppPalette.muted,
                              ),
                              filled: true,
                              fillColor: AppPalette.iceSoft,
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(16),
                                borderSide: BorderSide.none,
                              ),
                              enabledBorder: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(16),
                                borderSide: BorderSide.none,
                              ),
                              focusedBorder: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(16),
                                borderSide: const BorderSide(
                                  color: AppPalette.aqua,
                                  width: 1.6,
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(height: 16),
                          TextField(
                            controller: _passCtrl,
                            obscureText: true,
                            textInputAction: TextInputAction.done,
                            onSubmitted: (_) {
                              if (!_loading) _login();
                            },
                            style: TextStyle(
                              fontSize: 15,
                              color: AppPalette.ink,
                            ),
                            decoration: InputDecoration(
                              labelText: 'Password',
                              labelStyle: GoogleFonts.manrope(
                                color: AppPalette.muted,
                              ),
                              prefixIcon: const Icon(
                                TablerIcons.lock,
                                color: AppPalette.muted,
                              ),
                              filled: true,
                              fillColor: AppPalette.iceSoft,
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(16),
                                borderSide: BorderSide.none,
                              ),
                              enabledBorder: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(16),
                                borderSide: BorderSide.none,
                              ),
                              focusedBorder: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(16),
                                borderSide: const BorderSide(
                                  color: AppPalette.aqua,
                                  width: 1.6,
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(height: 24),
                          SizedBox(
                            width: double.infinity,
                            height: 52,
                            child: ElevatedButton(
                              onPressed: _loading ? null : _login,
                              style: ElevatedButton.styleFrom(
                                backgroundColor: AppPalette.aqua,
                                foregroundColor: AppPalette.ink,
                                disabledBackgroundColor: AppPalette.aqua
                                    .withValues(alpha: 0.5),
                                elevation: 0,
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(16),
                                ),
                              ),
                              child: _loading
                                  ? const Row(
                                      mainAxisAlignment:
                                          MainAxisAlignment.center,
                                      children: [
                                        Text(
                                          'Signing in',
                                          style: TextStyle(
                                            fontSize: 16,
                                            fontWeight: FontWeight.w700,
                                            color: AppPalette.ink,
                                          ),
                                        ),
                                        SizedBox(width: 5),
                                        _AnimatedDots(
                                          color: AppPalette.ink,
                                          size: 4,
                                        ),
                                      ],
                                    )
                                  : Text(
                                      'Sign In',
                                      style: GoogleFonts.hankenGrotesk(
                                        fontSize: 16,
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
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
      ),
    );
  }
}

class _AnimatedDots extends StatefulWidget {
  final Color color;
  final double size;

  const _AnimatedDots({this.color = AppPalette.ink, this.size = 4});

  @override
  State<_AnimatedDots> createState() => _AnimatedDotsState();
}

class _AnimatedDotsState extends State<_AnimatedDots>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1000),
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  double _phase(int index) => (_controller.value - index * 0.16) % 1.0;

  double _wave(int index) {
    final phase = _phase(index);
    return phase < 0.5 ? phase * 2 : (1 - phase) * 2;
  }

  @override
  Widget build(BuildContext context) {
    final reduceMotion = MediaQuery.of(context).disableAnimations;
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, _) {
        return Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (var i = 0; i < 3; i++)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 1.5),
                child: Transform.translate(
                  offset: Offset(0, reduceMotion ? 0 : -_wave(i) * 3.5),
                  child: Opacity(
                    opacity: reduceMotion ? 1 : 0.35 + 0.65 * _wave(i),
                    child: Container(
                      width: widget.size,
                      height: widget.size,
                      decoration: BoxDecoration(
                        color: widget.color,
                        shape: BoxShape.circle,
                      ),
                    ),
                  ),
                ),
              ),
          ],
        );
      },
    );
  }
}
