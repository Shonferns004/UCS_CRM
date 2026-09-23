import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import '../lucide_icons.dart';

/// Minimal two-way swipe control.
///
/// Only the small center handle is draggable. Dragging left past a threshold
/// (or flinging left fast) triggers [onReject]; the same on the right
/// triggers [onGive]. A partial swipe snaps the handle back to center and
/// never triggers an action. While [enabled] is false the control dims and
/// ignores gestures.
///
/// Design tokens (single source of truth):
///   track: 58px tall, white, radius 29, 1px #E4E7EC border,
///          shadow 0 3px 14px rgba(17,24,39,0.04)
///   handle: 54px circle, white, 1px #E5E9EF border,
///          shadow 0 3px 12px rgba(17,24,39,0.08), three grip lines #B7BFCC
///   labels: `‹ Reject` #E96868 / `Give ›` #159A68 (15px w600, 18px icons)
class SwipeActionControl extends StatefulWidget {
  final VoidCallback onReject;
  final VoidCallback onGive;
  final bool enabled;

  const SwipeActionControl({
    super.key,
    required this.onReject,
    required this.onGive,
    this.enabled = true,
  });

  @override
  State<SwipeActionControl> createState() => _SwipeActionControlState();
}

enum _SwipePhase {
  idle,
  dragging,
  completingLeft,
  completingRight,
  resetting,
  disabled,
}

class _SwipeActionControlState extends State<SwipeActionControl>
    with SingleTickerProviderStateMixin {
  static const double _trackHeight = 72;
  static const double _handleSize = 66;
  static const Color _rejectColor = Color(0xFFE96868);
  static const Color _giveColor = Color(0xFF159A68);
  static const Color _trackBorder = Color(0xFFE4E7EC);
  static const Color _handleBorder = Color(0xFFE5E9EF);
  static const Color _gripColor = Color(0xFFB7BFCC);
  static const List<BoxShadow> _trackShadow = [
    BoxShadow(color: Color(0x0A111827), blurRadius: 14, offset: Offset(0, 3)),
  ];
  static const List<BoxShadow> _handleShadow = [
    BoxShadow(color: Color(0x14111827), blurRadius: 12, offset: Offset(0, 3)),
  ];

  static final CustomSemanticsAction _rejectAction =
      CustomSemanticsAction(label: 'Reject');
  static final CustomSemanticsAction _giveAction =
      CustomSemanticsAction(label: 'Give');

  static const double _flingVelocity = 900;

  late final AnimationController _controller =
      AnimationController(vsync: this);

  Animation<double>? _anim;
  double _to = 0;
  bool _completingReject = false;
  bool _fired = false;
  bool _dragging = false;

  _SwipePhase _phase = _SwipePhase.idle;
  double _trackWidth = 0;
  double _left = 0;
  double _centerX = 0;
  bool _initialized = false;

  bool get _enabled => widget.enabled && _phase != _SwipePhase.disabled;

  @override
  void dispose() {
    _anim?.removeListener(_onTick);
    _controller.dispose();
    super.dispose();
  }

  @override
  void didUpdateWidget(covariant SwipeActionControl oldWidget) {
    super.didUpdateWidget(oldWidget);
    // After an action completes or fails the parent re-enables the control;
    // restore the handle to center so it is not left stuck at an edge.
    if (!oldWidget.enabled && widget.enabled) {
      _anim?.removeListener(_onTick);
      setState(() {
        _phase = _SwipePhase.idle;
        _fired = false;
        _left = _centerX;
      });
    }
  }

  // ---- gesture handling ---------------------------------------------------

  void _onDragStart(DragStartDetails details) {
    if (!_enabled || _phase != _SwipePhase.idle) return;
    setState(() {
      _phase = _SwipePhase.dragging;
      _dragging = true;
    });
  }

  void _onDragUpdate(DragUpdateDetails details) {
    if (_phase != _SwipePhase.dragging || _trackWidth <= 0) return;
    final maxX = _trackWidth - _handleSize;
    setState(() {
      _left = (_left + details.delta.dx).clamp(0.0, maxX);
    });
  }

  void _onDragEnd(DragEndDetails details) {
    if (_phase != _SwipePhase.dragging) return;
    setState(() => _dragging = false);

    final maxX = _trackWidth - _handleSize;
    final centerX = maxX / 2;
    final threshold = maxX * 0.60;
    final velocity =
        details.primaryVelocity ?? details.velocity.pixelsPerSecond.dx;

    final reachingReject =
        _left <= centerX - threshold / 2 || velocity < -_flingVelocity;
    final reachingGive =
        _left >= centerX + threshold / 2 || velocity > _flingVelocity;

    if (reachingReject && !reachingGive) {
      _startCompletion(/*isGive:*/ false, target: 4);
    } else if (reachingGive && !reachingReject) {
      _startCompletion(/*isGive:*/ true, target: maxX - 4);
    } else {
      _startSettle(centerX);
    }
  }

  void _onDragCancel() {
    if (_phase != _SwipePhase.dragging) return;
    setState(() => _dragging = false);
    _startSettle(_centerX);
  }

  // ---- animation ----------------------------------------------------------

  void _startCompletion(bool isGive, {required double target}) {
    _completingReject = !isGive;
    setState(() {
      _phase =
          isGive ? _SwipePhase.completingRight : _SwipePhase.completingLeft;
    });
    _animateTo(target, settle: false);
  }

  void _startSettle(double target) {
    setState(() => _phase = _SwipePhase.resetting);
    _animateTo(target, settle: true);
  }

  void _animateTo(double target, {required bool settle}) {
    _anim?.removeListener(_onTick);
    _controller.duration = settle
        ? const Duration(milliseconds: 220)
        : const Duration(milliseconds: 180);
    _to = target;
    _anim = Tween<double>(begin: _left, end: target).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeOutCubic),
    )..addListener(_onTick);
    _controller.forward(from: 0);
  }

  void _onTick() {
    if (!mounted || _anim == null) return;
    setState(() => _left = _anim!.value);
    if (!_controller.isCompleted) return;
    _anim!.removeListener(_onTick);
    _anim = null;
    setState(() => _left = _to);
    if (_phase == _SwipePhase.resetting) {
      setState(() => _phase = _SwipePhase.idle);
    } else if (_phase == _SwipePhase.completingLeft ||
        _phase == _SwipePhase.completingRight) {
      _fireAction();
    }
  }

  void _fireAction() {
    if (_fired) return;
    _fired = true;
    setState(() => _phase = _SwipePhase.disabled);
    if (_completingReject) {
      widget.onReject();
    } else {
      widget.onGive();
    }
  }

  // ---- semantics ----------------------------------------------------------

  bool _semanticReject() {
    if (!_enabled || _phase != _SwipePhase.idle) return false;
    _fireAction();
    return true;
  }

  bool _semanticGive() {
    if (!_enabled || _phase != _SwipePhase.idle) return false;
    _fireAction();
    return true;
  }

  // ---- build --------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Swipe left to reject, swipe right to give',
      customSemanticsActions: {
        _rejectAction: _semanticReject,
        _giveAction: _semanticGive,
      },
      child: Opacity(
        opacity: _enabled ? 1.0 : 0.55,
        child: IgnorePointer(
          ignoring: !_enabled,
          child: LayoutBuilder(
            builder: (context, constraints) {
              final trackWidth = constraints.maxWidth;
              _trackWidth = trackWidth;
              final maxX = trackWidth <= _handleSize
                  ? 0.0
                  : trackWidth - _handleSize;
              final centerX = maxX / 2;
              if (!_initialized) {
                _initialized = true;
                _centerX = centerX;
                _left = centerX;
              } else {
                _centerX = centerX;
              }

              final leftT = maxX <= 0
                  ? 0.0
                  : ((centerX - _left) / centerX).clamp(0.0, 1.0);
              final rightT = maxX <= 0
                  ? 0.0
                  : ((_left - centerX) / (maxX - centerX)).clamp(0.0, 1.0);

              return Container(
                height: _trackHeight,
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(_trackHeight / 2),
                  border: Border.all(color: _trackBorder),
                  boxShadow: _trackShadow,
                ),
                child: Stack(
                  children: [
                    // Reject label (left).
                    Positioned.fill(
                      child: Align(
                        alignment: Alignment.centerLeft,
                        child: Padding(
                          padding: const EdgeInsets.only(left: 18),
                          child: _label(
                            icon: LucideIcons.chevronLeft,
                            text: 'Reject',
                            color: _rejectColor,
                            opacity: _opacityFor(leftT),
                            iconBefore: true,
                          ),
                        ),
                      ),
                    ),
                    // Give label (right).
                    Positioned.fill(
                      child: Align(
                        alignment: Alignment.centerRight,
                        child: Padding(
                          padding: const EdgeInsets.only(right: 18),
                          child: _label(
                            icon: LucideIcons.chevronRight,
                            text: 'Give',
                            color: _giveColor,
                            opacity: _opacityFor(rightT),
                            iconBefore: false,
                          ),
                        ),
                      ),
                    ),
                    // Draggable center handle.
                    Positioned(
                      left: _left,
                      top: (_trackHeight - _handleSize) / 2,
                      child: _buildHandle(),
                    ),
                  ],
                ),
              );
            },
          ),
        ),
      ),
    );
  }

  double _opacityFor(double fraction) {
    return 0.65 + 0.35 * fraction;
  }

  Widget _label({
    required IconData icon,
    required String text,
    required Color color,
    required double opacity,
    required bool iconBefore,
  }) {
    final textWidget = Text(
      text,
      style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: color),
    );
    return Opacity(
      opacity: opacity,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (iconBefore) ...[
            Icon(icon, size: 18, color: color),
            const SizedBox(width: 2),
          ],
          textWidget,
          if (!iconBefore) ...[
            const SizedBox(width: 2),
            Icon(icon, size: 18, color: color),
          ],
        ],
      ),
    );
  }

  Widget _buildHandle() {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onHorizontalDragStart: _onDragStart,
      onHorizontalDragUpdate: _onDragUpdate,
      onHorizontalDragEnd: _onDragEnd,
      onHorizontalDragCancel: _onDragCancel,
      child: AnimatedScale(
        scale: _dragging ? 1.04 : 1.0,
        duration: const Duration(milliseconds: 120),
        curve: Curves.easeOut,
        child: Container(
          width: _handleSize,
          height: _handleSize,
          decoration: BoxDecoration(
            color: Colors.white,
            shape: BoxShape.circle,
            border: Border.all(color: _handleBorder),
            boxShadow: _handleShadow,
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: List.generate(
              3,
              (_) => Container(
                width: 2,
                height: 16,
                margin: const EdgeInsets.symmetric(horizontal: 3),
                decoration: BoxDecoration(
                  color: _gripColor,
                  borderRadius: BorderRadius.circular(1),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}