import 'dart:async';

import 'package:flutter/material.dart';

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
  bool _checking = false;
  bool _error = false;

  Future<void> _add(String d) async {
    if (_checking || _digits.length >= 6) return;
    setState(() {
      _digits.add(d);
      _error = false;
    });
    if (_digits.length >= 4) {
      _try();
    }
  }

  Future<void> _try() async {
    setState(() => _checking = true);
    final pin = _digits.join();
    final ok = await LockBoxChannel.verifyPin(pin);
    if (!mounted) return;
    if (ok) {
      widget.onUnlocked();
    } else {
      setState(() {
        _digits.clear();
        _error = true;
        _checking = false;
      });
    }
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
                'Unlock LockBox to continue',
                style: TextStyle(
                  fontSize: 14,
                  color: dark ? AppColors.darkTextSecondary : AppColors.textSecondary,
                ),
              ),
              const SizedBox(height: 34),
              PinDots(length: _digits.length, error: _error),
              SizedBox(
                height: 42,
                child: Center(
                  child: Text(
                    _error ? 'Incorrect passcode' : '',
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: AppColors.error,
                    ),
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
    );
  }
}