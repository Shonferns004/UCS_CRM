import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../theme.dart';

/// Drag the knob from right to left to trigger [onConfirm].
/// The track fills with the accent color as the knob slides.
class SlideToConfirm extends StatefulWidget {
  final VoidCallback onConfirm;
  final String label;
  final double height;
  const SlideToConfirm({
    super.key,
    required this.onConfirm,
    this.label = 'Slide to confirm payment',
    this.height = 52,
  });

  @override
  State<SlideToConfirm> createState() => _SlideToConfirmState();
}

class _SlideToConfirmState extends State<SlideToConfirm> {
  double _x = 0;
  bool _active = false;
  double _max = 0;
  bool _triggered = false;

  double get _knobW => widget.height - 12;

  void _reset() {
    _triggered = false;
    setState(() {
      _x = 0;
      _active = false;
    });
  }

  void _move(double leftward) {
    if (_triggered || _max <= 0) return;
    final next = (_x + leftward).clamp(0.0, _max);
    if (next >= _max * 0.86) {
      _triggered = true;
      setState(() {
        _x = 0;
        _active = false;
      });
      widget.onConfirm();
      return;
    }
    setState(() => _x = next);
  }

  @override
  Widget build(BuildContext context) {
    final p = AppPalette.of(context);
    final accent = p.green;
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onHorizontalDragStart: (_) => setState(() => _active = true),
      onHorizontalDragUpdate: (d) => _move(d.delta.dx < 0 ? -d.delta.dx : 0),
      onHorizontalDragEnd: (_) => _reset(),
      onHorizontalDragCancel: _reset,
      child: LayoutBuilder(
        builder: (context, constraints) {
          _max = constraints.maxWidth - _knobW - 8;
          final fillWidth = (_knobW + _x).clamp(_knobW.toDouble(), constraints.maxWidth - 4);
          return Container(
            height: widget.height,
            decoration: BoxDecoration(
              color: accent.withValues(alpha: 0.10),
              borderRadius: BorderRadius.circular(99),
              border: Border.all(color: accent.withValues(alpha: 0.35)),
            ),
            clipBehavior: Clip.antiAlias,
            child: Stack(
              children: [
                Positioned(
                  right: 4,
                  top: 4,
                  bottom: 4,
                  child: SizedBox(
                    width: fillWidth,
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        color: accent.withValues(alpha: _active ? 0.30 : 0.16),
                        borderRadius: BorderRadius.circular(99),
                      ),
                    ),
                  ),
                ),
                Positioned.fill(
                  child: Center(
                    child: Text(widget.label,
                      style: TextStyle(
                        fontSize: 12.5, fontWeight: FontWeight.w700, color: accent,
                        letterSpacing: 0.4,
                      )),
                  ),
                ),
                Positioned(
                  right: 4,
                  top: 4,
                  bottom: 4,
                  child: Transform.translate(
                    offset: Offset(-_x, 0),
                    child: AnimatedContainer(
                      duration: Duration(milliseconds: _active ? 0 : 180),
                      width: _knobW,
                      decoration: BoxDecoration(
                        color: _active ? accent : p.card,
                        borderRadius: BorderRadius.circular(99),
                        boxShadow: _active
                            ? null
                            : [BoxShadow(color: p.ink.withValues(alpha: 0.08), blurRadius: 6, offset: const Offset(0, 2))],
                      ),
                      child: Icon(LucideIcons.chevronLeft,
                        size: 16, color: _active ? p.onBlue : accent),
                    ),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}