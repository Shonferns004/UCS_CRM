import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../channel.dart';
import '../core/theme/app_colors.dart';
import '../core/widgets/pin_pad.dart';

/// Design Screen 10 — Change secret code. 4–8 digits, entered twice.
class ChangeSecretCodePage extends StatefulWidget {
  const ChangeSecretCodePage({super.key});

  @override
  State<ChangeSecretCodePage> createState() => _ChangeSecretCodePageState();
}

class _ChangeSecretCodePageState extends State<ChangeSecretCodePage> {
  final _code = <String>[];
  final _confirm = <String>[];
  bool _second = false;
  bool _busy = false;
  String? _error;

  static const _max = 8;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final current = await LockBoxChannel.getSecretCode();
    if (!mounted) return;
    // Prefill "confirm" dots with the current code so the user can see it
    // while typing the new one.
    _confirm.addAll(current.split(''));
  }

  void _add(String d) {
    if (_busy) return;
    final target = _second ? _confirm : _code;
    if (target.length >= _max) return;
    setState(() {
      target.add(d);
      _error = null;
    });
  }

  void _backspace() {
    if (_busy) return;
    setState(() {
      final target = _second ? _confirm : _code;
      if (target.isNotEmpty) target.removeLast();
      if (_second && _confirm.isEmpty) _second = false;
      _error = null;
    });
  }

  Future<void> _save() async {
    final code = _code.join();
    if (code.length < 4) {
      setState(() => _error = 'Code must be 4–8 digits.');
      return;
    }
    if (!_second) {
      setState(() => _second = true);
      return;
    }
    if (code != _confirm.join()) {
      setState(() => _error = 'Codes don\'t match.');
      return;
    }
    setState(() => _busy = true);
    final ok = await LockBoxChannel.setSecretCode(code);
    if (!mounted) return;
    setState(() => _busy = false);
    if (ok) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Secret code updated')),
      );
      Navigator.of(context).pop();
    } else {
      setState(() => _error = 'Could not save code. Try again.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final primaryText = dark ? AppColors.darkTextPrimary : AppColors.textPrimary;
    final secondaryText = dark ? AppColors.darkTextSecondary : AppColors.textSecondary;

    final showing = _second ? _confirm : _code;
    final entered = showing.length;

    return Scaffold(
      appBar: AppBar(title: const Text('Secret Code')),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 8),
              Text(
                _second ? 'Confirm new code' : 'Enter a new code',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: primaryText),
              ),
              const SizedBox(height: 6),
              Text(
                _second
                    ? 'Enter the new code once more.'
                    : 'Dialing it in the phone app reopens LockBox.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 13.5, color: secondaryText),
              ),
              const SizedBox(height: 22),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  if (!_second)
                    Icon(LucideIcons.lock, size: 22, color: AppColors.primary),
                  const SizedBox(width: 8),
                  _Pills(count: entered, max: _max, error: _error != null),
                ],
              ),
              if (_error != null) ...[
                const SizedBox(height: 10),
                Center(
                  child: Text(
                    _error!,
                    style: const TextStyle(color: AppColors.error, fontSize: 13, fontWeight: FontWeight.w600),
                  ),
                ),
              ],
              const SizedBox(height: 8),
              Center(
                child: PinKeypad(
                  onDigit: _add,
                  onBackspace: _backspace,
                  enabled: !_busy,
                ),
              ),
              const Spacer(),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: _busy ? null : (entered >= 4 ? _save : null),
                  icon: _busy
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                        )
                      : const Icon(LucideIcons.check, size: 20),
                  label: Text(_second ? 'Save Code' : 'Continue'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Pills extends StatelessWidget {
  final int count;
  final int max;
  final bool error;

  const _Pills({required this.count, required this.max, required this.error});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: List.generate(
        max,
        (i) => AnimatedContainer(
          duration: const Duration(milliseconds: 120),
          width: 12,
          height: 12,
          margin: const EdgeInsets.symmetric(horizontal: 4),
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: i < count
                ? (error ? AppColors.error : AppColors.primary)
                : Theme.of(context).brightness == Brightness.dark
                    ? AppColors.darkBorder
                    : AppColors.border,
          ),
        ),
      ),
    );
  }
}