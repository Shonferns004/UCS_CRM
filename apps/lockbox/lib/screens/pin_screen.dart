import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../channel.dart';
import '../core/theme/app_colors.dart';
import '../core/widgets/pin_pad.dart';

/// Added lock screen (not in the original 12 designs): protects allowlist
/// editing from anyone who discovers the secret code. Shown on app open when a
/// PIN is set.
class PinScreen extends StatefulWidget {
  final VoidCallback onUnlocked;
  final IconData hintIcon;

  const PinScreen({super.key, required this.onUnlocked, required this.hintIcon});

  @override
  State<PinScreen> createState() => _PinScreenState();
}

class _PinScreenState extends State<PinScreen> {
  final _digits = <String>[];

  /// Digits in the stored PIN. Drives both the dot count and when the entry is
  /// considered complete — a PIN may be 4, 5 or 6 digits, so submitting at a
  /// hardcoded 4 rejected every longer code no matter how it was typed.
  int _pinLength = 4;
  bool _lengthKnown = false;

  bool _checking = false;
  bool _error = false;
  bool _success = false;

  @override
  void initState() {
    super.initState();
    _loadLength();
  }

  Future<void> _loadLength() async {
    int length;
    try {
      length = await LockBoxChannel.pinLength();
    } catch (_) {
      length = 4;
    }
    if (!mounted) return;
    setState(() {
      _pinLength = length.clamp(4, 6);
      _lengthKnown = true;
    });
  }

  void _add(String d) {
    if (_checking || _digits.length >= _pinLength) return;
    setState(() {
      _digits.add(d);
      _error = false;
    });
    if (_digits.length == _pinLength) {
      _try();
    }
  }

  Future<void> _try() async {
    setState(() => _checking = true);
    final pin = _digits.join();
    bool ok;
    try {
      ok = await LockBoxChannel.verifyPin(pin);
    } catch (_) {
      ok = false;
    }
    if (!mounted) return;
    if (ok) {
      HapticFeedback.mediumImpact();
      setState(() => _success = true);
      // Let the success state register visually before the screen swaps out.
      await Future<void>.delayed(const Duration(milliseconds: 180));
      if (!mounted) return;
      widget.onUnlocked();
      return;
    }
    HapticFeedback.heavyImpact();
    setState(() {
      _digits.clear();
      _error = true;
      _checking = false;
    });
  }

  void _backspace() {
    if (_checking) return;
    setState(() {
      if (_digits.isNotEmpty) _digits.removeLast();
      _error = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return PopScope(
      canPop: false,
      child: Scaffold(
        body: SafeArea(
          child: AnimatedOpacity(
            // Fades in on first paint so the screen does not snap into place
            // on top of the splash.
            opacity: _lengthKnown ? 1 : 0,
            duration: const Duration(milliseconds: 220),
            curve: Curves.easeOut,
            child: Column(
              children: [
                const Spacer(),
                Container(
                  width: 72,
                  height: 72,
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [AppColors.primary, AppColors.primaryDark],
                    ),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Icon(widget.hintIcon, color: Colors.white, size: 30),
                ),
                const SizedBox(height: 22),
                Text(
                  'Enter passcode',
                  style: TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.w700,
                    color: dark ? AppColors.darkTextPrimary : AppColors.textPrimary,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  _pinLength == 4
                      ? 'Unlock LockBox to continue'
                      : 'Unlock LockBox to continue · $_pinLength digits',
                  style: TextStyle(
                    fontSize: 14,
                    color: dark ? AppColors.darkTextSecondary : AppColors.textSecondary,
                  ),
                ),
                const SizedBox(height: 34),
                PinDots(
                  length: _digits.length,
                  total: _pinLength,
                  error: _error,
                  success: _success,
                ),
                SizedBox(
                  height: 42,
                  child: Center(
                    child: AnimatedSwitcher(
                      duration: const Duration(milliseconds: 180),
                      child: _error
                          ? const Text(
                              'Incorrect passcode',
                              key: ValueKey('err'),
                              style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                                color: AppColors.error,
                              ),
                            )
                          : const SizedBox.shrink(key: ValueKey('ok')),
                    ),
                  ),
                ),
                const Spacer(),
                PinKeypad(
                  onDigit: _add,
                  onBackspace: _backspace,
                  enabled: !_checking,
                ),
                const SizedBox(height: 24),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
