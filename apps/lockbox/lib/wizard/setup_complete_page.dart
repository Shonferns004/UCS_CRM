import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../core/theme/app_colors.dart';
import '../core/widgets/pin_pad.dart';

/// Design Screen 05 — Setup Complete. Adds the required PIN step inline
/// (decision: PIN lives here rather than a separate wizard screen).
class SetupCompletePage extends StatefulWidget {
  final Future<String?> Function(String pin) onFinalize;
  final VoidCallback onFinished;

  const SetupCompletePage({
    super.key,
    required this.onFinalize,
    required this.onFinished,
  });

  @override
  State<SetupCompletePage> createState() => _SetupCompletePageState();
}

class _SetupCompletePageState extends State<SetupCompletePage> {
  final _pin = <String>[];
  final _confirm = <String>[];
  bool _firstDone = false;
  bool _busy = false;
  bool _finished = false;
  String? _error;
  String? _hideWarning;

  bool get _pinMatches => _pin.join() == _confirm.join();
  bool get _pinValid => _pin.length >= 4 && _confirm.length >= 4 && _pinMatches;
  bool get _step2 => _firstDone;

  void _add(String d) {
    if (_busy) return;
    final target = _firstDone ? _confirm : _pin;
    if (target.length >= 6) return;
    setState(() {
      target.add(d);
      _error = null;
      if (!_firstDone && target.length == 6) _firstDone = true;
      if (_firstDone && _confirm.length >= 4 && _pin.join() != _confirm.join()) {
        _error = 'Passcodes don\'t match';
      }
    });
    if (_firstDone && target.length == 6 && _pin.join() == _confirm.join()) {
      // auto-submit when both full and matching
    }
  }

  void _backspace() {
    if (_busy) return;
    setState(() {
      final target = _firstDone ? _confirm : _pin;
      if (target.isNotEmpty) target.removeLast();
      if (_firstDone && _confirm.isEmpty) _firstDone = false;
      _error = null;
    });
  }

  Future<void> _submit() async {
    if (!_pinValid || _busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    final hideError = await widget.onFinalize(_pin.join());
    if (!mounted) return;
    setState(() {
      _busy = false;
      _hideWarning = hideError;
    });
    if (hideError == null) {
      widget.onFinished();
    }
  }

  void _finishAnyway() {
    if (_finished) return;
    _finished = true;
    widget.onFinished();
  }

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final primaryText = dark ? AppColors.darkTextPrimary : AppColors.textPrimary;
    final secondaryText = dark ? AppColors.darkTextSecondary : AppColors.textSecondary;

    // Phase A: set PIN, Phase B: confirm (handled by same keypad).
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SizedBox(height: 8),
          Center(
            child: Container(
              width: 76,
              height: 76,
              decoration: const BoxDecoration(
                color: AppColors.successSoft,
                shape: BoxShape.circle,
              ),
              child: const Icon(LucideIcons.check, size: 38, color: AppColors.success),
            ),
          ),
          const SizedBox(height: 16),
          Text(
            'Setup Complete!',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800, color: primaryText),
          ),
          const SizedBox(height: 6),
          Text(
            'LockBox is now protecting your device.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 14, color: secondaryText),
          ),
          const SizedBox(height: 22),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: dark ? AppColors.darkSurface : Colors.white,
              borderRadius: AppRadii.card,
              border: Border.all(color: dark ? AppColors.darkBorder : AppColors.border),
            ),
            child: const Column(
              children: [
                _CheckRow(text: 'Accessibility enabled'),
                SizedBox(height: 10),
                _CheckRow(text: 'Allowed apps saved'),
                SizedBox(height: 10),
                _CheckRow(text: 'App icon hidden'),
              ],
            ),
          ),
          const SizedBox(height: 24),

          // ---- PIN section (added per decision: PIN in Setup Complete) ----
          if (!_step2) ...[
            Text(
              'Set a passcode',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: primaryText),
            ),
            const SizedBox(height: 4),
            Text(
              'Choose a 4–6 digit passcode to reopen LockBox and edit settings.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 13.5, color: secondaryText),
            ),
            const SizedBox(height: 18),
            Center(
              child: PinDots(length: _pin.length, error: _error != null),
            ),
            if (_error != null) ...[
              const SizedBox(height: 8),
              Center(
                child: Text(_error!, style: const TextStyle(color: AppColors.error, fontSize: 13)),
              ),
            ],
            const SizedBox(height: 8),
          ] else ...[
            Text(
              'Confirm passcode',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: primaryText),
            ),
            const SizedBox(height: 4),
            Text(
              'Enter the same passcode once more.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 13.5, color: secondaryText),
            ),
            const SizedBox(height: 18),
            Center(
              child: PinDots(length: _confirm.length, error: _error != null),
            ),
            if (_error != null) ...[
              const SizedBox(height: 8),
              Center(
                child: Text(_error!, style: const TextStyle(color: AppColors.error, fontSize: 13)),
              ),
            ],
            const SizedBox(height: 8),
          ],

          if (_hideWarning != null) ...[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.warningSoft,
                borderRadius: AppRadii.button,
              ),
              child: Column(
                children: [
                  Row(
                    children: const [
                      Icon(LucideIcons.triangleAlert, color: AppColors.warning, size: 20),
                      SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          'Icon could not be hidden.',
                          style: TextStyle(color: AppColors.warning, fontWeight: FontWeight.w700),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'Use the dialer secret code or the recovery notification to reopen LockBox.',
                    style: TextStyle(fontSize: 13, color: secondaryText),
                  ),
                ],
              ),
            ),
          ],

          const SizedBox(height: 6),
          Center(
            child: PinKeypad(onDigit: _add, onBackspace: _backspace, enabled: !_busy),
          ),
          const SizedBox(height: 18),

          // ---- Secret-code tip ----
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppColors.primarySoft,
              borderRadius: AppRadii.card,
            ),
            child: Column(
              children: const [
                Row(
                  children: [
                    Icon(LucideIcons.phone, color: AppColors.primary, size: 20),
                    SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'Need to open LockBox?',
                        style: TextStyle(
                          color: AppColors.primaryDark,
                          fontWeight: FontWeight.w700,
                          fontSize: 14,
                        ),
                      ),
                    ),
                  ],
                ),
                SizedBox(height: 8),
                Text(
                  'Dial your secret code, or use the recovery notification from Settings.',
                  style: TextStyle(fontSize: 13, height: 1.45, color: AppColors.primaryDark),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: _busy
                  ? null
                  : (_hideWarning != null ? _finishAnyway : _submit),
              icon: _busy
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                    )
                  : Icon(_hideWarning != null ? LucideIcons.arrowRight : LucideIcons.shieldCheck),
              label: Text(
                _hideWarning != null
                    ? 'Continue Anyway'
                    : (_busy ? 'Finishing…' : 'Go to Status'),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _CheckRow extends StatelessWidget {
  final String text;
  const _CheckRow({required this.text});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        const Icon(LucideIcons.checkCircle2, color: AppColors.success, size: 20),
        const SizedBox(width: 10),
        Expanded(child: Text(text, style: const TextStyle(fontWeight: FontWeight.w600))),
      ],
    );
  }
}