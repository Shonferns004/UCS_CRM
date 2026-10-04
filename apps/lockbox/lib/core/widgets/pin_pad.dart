import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme/app_colors.dart';

/// Animated dots row reflecting the current digit count.
///
/// [total] is how many dots to draw, which callers set to the length of the
/// code being entered so the row never implies a length the code does not have.
class PinDots extends StatelessWidget {
  final int length;
  final int total;
  final bool error;
  final bool success;

  const PinDots({
    super.key,
    required this.length,
    this.total = 6,
    this.error = false,
    this.success = false,
  });

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final base = dark ? AppColors.darkTextTertiary : AppColors.border;
    final active = error
        ? AppColors.error
        : success
            ? AppColors.primary
            : Theme.of(context).colorScheme.primary;

    return _ErrorShake(
      // A rising edge is what triggers the shake; staying in the error state
      // must not keep re-shaking on every rebuild.
      trigger: error,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: List.generate(total, (i) {
          final filled = i < length;
          return Padding(
            padding: const EdgeInsets.symmetric(horizontal: 7),
            child: _Dot(
              filled: filled,
              color: active,
              emptyColor: base.withValues(alpha: 0.45),
              // The newest dot pops in slightly; earlier ones settle, which
              // reads as a single travelling pulse rather than a row blinking.
              isLatest: filled && i == length - 1,
            ),
          );
        }),
      ),
    );
  }
}

class _Dot extends StatelessWidget {
  final bool filled;
  final bool isLatest;
  final Color color;
  final Color emptyColor;

  const _Dot({
    required this.filled,
    required this.isLatest,
    required this.color,
    required this.emptyColor,
  });

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 1, end: filled ? 1 : 0.86),
      duration: Duration(milliseconds: isLatest ? 220 : 150),
      curve: Curves.easeOutBack,
      builder: (context, scale, _) => Transform.scale(
        scale: scale,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 160),
          curve: Curves.easeOutCubic,
          width: 16,
          height: 16,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: filled ? color : emptyColor,
          ),
        ),
      ),
    );
  }
}

/// Shakes its child horizontally whenever [trigger] flips to true.
class _ErrorShake extends StatefulWidget {
  final bool trigger;
  final Widget child;

  const _ErrorShake({required this.trigger, required this.child});

  @override
  State<_ErrorShake> createState() => _ErrorShakeState();
}

class _ErrorShakeState extends State<_ErrorShake>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 420),
  );

  @override
  void didUpdateWidget(_ErrorShake old) {
    super.didUpdateWidget(old);
    if (widget.trigger && !old.trigger) {
      _controller.forward(from: 0);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        // Damped sine: a fixed number of oscillations that decays to rest.
        final t = _controller.value;
        final dx = (t * 6 * (1 - t)) * 18 * _wave(t);
        return Transform.translate(offset: Offset(dx, 0), child: child);
      },
      child: widget.child,
    );
  }

  double _wave(double t) {
    const swings = 3.5;
    return (t * swings * 2 * 3.14159265).remainder(2 * 3.14159265) / 3.14159265 - 1;
  }
}

/// Numeric keypad matching modern banking apps.
class PinKeypad extends StatelessWidget {
  final ValueChanged<String> onDigit;
  final VoidCallback onBackspace;
  final bool enabled;

  const PinKeypad({
    super.key,
    required this.onDigit,
    required this.onBackspace,
    this.enabled = true,
  });

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final keyColor = dark ? AppColors.darkTextPrimary : AppColors.textPrimary;

    Widget key(String label, {bool icon = false, IconData? iconData}) {
      return _KeyButton(
        enabled: enabled,
        onTap: () => (icon ? onBackspace() : onDigit(label)),
        borderRadius: BorderRadius.circular(56),
        child: icon
            ? Icon(iconData, size: 26, color: keyColor)
            : Text(
                label,
                style: TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w600,
                  color: keyColor,
                ),
              ),
      );
    }

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (final row in const [
          ['1', '2', '3'],
          ['4', '5', '6'],
          ['7', '8', '9'],
        ])
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [for (final k in row) key(k)],
          ),
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(width: 72, height: 64),
            key('0'),
            key('', icon: true, iconData: Icons.backspace_outlined),
          ],
        ),
      ],
    );
  }
}

/// A single keypad key that dips under the finger and springs back, with a
/// short haptic tick so fast entry does not feel detached from the taps.
class _KeyButton extends StatefulWidget {
  final VoidCallback onTap;
  final bool enabled;
  final BorderRadius borderRadius;
  final Widget child;

  const _KeyButton({
    required this.onTap,
    required this.enabled,
    required this.borderRadius,
    required this.child,
  });

  @override
  State<_KeyButton> createState() => _KeyButtonState();
}

class _KeyButtonState extends State<_KeyButton> {
  bool _down = false;

  void _set(bool v) {
    if (_down == v) return;
    setState(() => _down = v);
  }

  @override
  Widget build(BuildContext context) {
    final primary = Theme.of(context).colorScheme.primary;
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTapDown: widget.enabled ? (_) => _set(true) : null,
      onTapUp: widget.enabled ? (_) => _set(false) : null,
      onTapCancel: widget.enabled ? () => _set(false) : null,
      onTap: widget.enabled
          ? () {
              HapticFeedback.selectionClick();
              widget.onTap();
            }
          : null,
      child: AnimatedScale(
        scale: _down ? 0.88 : 1,
        duration: Duration(milliseconds: _down ? 90 : 220),
        curve: _down ? Curves.easeOut : Curves.easeOutBack,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 160),
          curve: Curves.easeOut,
          width: 72,
          height: 64,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            borderRadius: widget.borderRadius,
            color: _down
                ? primary.withValues(alpha: 0.12)
                : Colors.transparent,
          ),
          child: AnimatedOpacity(
            duration: const Duration(milliseconds: 160),
            opacity: widget.enabled ? 1 : 0.35,
            child: widget.child,
          ),
        ),
      ),
    );
  }
}
