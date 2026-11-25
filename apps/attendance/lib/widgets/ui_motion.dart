import 'package:flutter/material.dart';
import 'package:flutter/physics.dart';

import '../theme/app_palette.dart';

/// A real spring curve (GSAP-style `elastic.out`) backed by Flutter's
/// [SpringSimulation]. Values can overshoot 1.0 which gives the playful
/// "settle" feel on sheets, dialogs and cards.
class SpringCurve extends Curve {
  final double mass;
  final double stiffness;
  final double damping;
  final double velocity;

  /// How long (in curve-time seconds) the simulation takes to settle.
  final double settleSeconds;

  const SpringCurve({
    this.mass = 1,
    this.stiffness = 180,
    this.damping = 18,
    this.velocity = 0,
    this.settleSeconds = 0.75,
  });

  @override
  double transformInternal(double t) {
    final simulation = SpringSimulation(
      SpringDescription(mass: mass, stiffness: stiffness, damping: damping),
      0,
      1,
      velocity,
    );
    return simulation.x(t * settleSeconds);
  }
}

/// Shared animation tokens.
class Motion {
  Motion._();

  /// Soft, lively spring used for entrance / reveal animations.
  static const Curve spring = SpringCurve(stiffness: 150, damping: 15);

  /// Snappier spring for the floating tab bar.
  static const Curve navSpring = SpringCurve(
    stiffness: 230,
    damping: 24,
    settleSeconds: 0.62,
  );

  /// Spring used by modals (bottom sheets and dialogs).
  static const Curve sheetSpring = SpringCurve(
    stiffness: 240,
    damping: 26,
    settleSeconds: 0.62,
  );

  static const Duration reveal = Duration(milliseconds: 640);
  static const Duration sheet = Duration(milliseconds: 620);
  static const Duration sheetExit = Duration(milliseconds: 240);
  static const Duration nav = Duration(milliseconds: 460);
}

/// Shows a floating, spring-animated bottom sheet.
///
/// Drop-in replacement for `showModalBottomSheet`; the sheet content still
/// owns its background so each sheet can keep its own rounded shape.
Future<T?> showSpringSheet<T>({
  required BuildContext context,
  required WidgetBuilder builder,
  bool isScrollControlled = true,
  bool useSafeArea = false,
  bool isDismissible = true,
}) {
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: isScrollControlled,
    useSafeArea: useSafeArea,
    isDismissible: isDismissible,
    backgroundColor: Colors.transparent,
    barrierColor: AppPalette.oceanDeep.withValues(alpha: 0.34),
    // Drag-to-dismiss is handled by _SheetDragToDismiss so it also works when
    // the finger starts inside a scrollable sheet body.
    enableDrag: false,
    sheetAnimationStyle: const AnimationStyle(
      curve: Curves.easeOutCubic,
      duration: Motion.sheet,
      reverseCurve: Curves.easeInCubic,
      reverseDuration: Motion.sheetExit,
    ),
    builder: (ctx) => _SheetDragToDismiss(child: builder(ctx)),
  );
}

/// Lets a sheet be pulled down and dismissed from anywhere — including from
/// inside its scrollable content when that content is scrolled to the top.
class _SheetDragToDismiss extends StatefulWidget {
  final Widget child;
  const _SheetDragToDismiss({required this.child});

  @override
  State<_SheetDragToDismiss> createState() => _SheetDragToDismissState();
}

class _SheetDragToDismissState extends State<_SheetDragToDismiss> {
  double _offset = 0;
  bool _dragging = false;
  bool _atTop = true;
  bool _canPull = false;
  double _startY = 0;

  bool _onScroll(ScrollNotification notification) {
    if (notification.metrics.axis != Axis.vertical) return false;
    _atTop = notification.metrics.pixels <= 1;
    return false;
  }

  void _onPointerDown(PointerDownEvent event) {
    _startY = event.position.dy;
    _canPull = _atTop;
  }

  void _onPointerMove(PointerMoveEvent event) {
    if (!_canPull) return;
    final dy = event.position.dy - _startY;
    if (dy > 10) {
      setState(() {
        _dragging = true;
        _offset = dy.clamp(0.0, 320.0);
      });
    } else if (_offset > 0) {
      setState(() {
        _offset = 0;
        _dragging = false;
      });
    }
  }

  void _settle() {
    setState(() {
      _offset = 0;
      _dragging = false;
    });
  }

  void _onPointerUp(PointerUpEvent event) {
    if (!_canPull) return;
    if (_offset > 100) {
      Navigator.of(context).pop();
      return;
    }
    _settle();
  }

  @override
  Widget build(BuildContext context) {
    return NotificationListener<ScrollNotification>(
      onNotification: _onScroll,
      child: Listener(
        onPointerDown: _onPointerDown,
        onPointerMove: _onPointerMove,
        onPointerUp: _onPointerUp,
        onPointerCancel: (_) => _settle(),
        child: AnimatedContainer(
          duration: _dragging
              ? Duration.zero
              : const Duration(milliseconds: 240),
          curve: Curves.easeOutCubic,
          transform: Matrix4.translationValues(0, _offset, 0),
          child: widget.child,
        ),
      ),
    );
  }
}

/// Shows a dialog that pops in with the same spring feel.
Future<T?> showSpringDialog<T>({
  required BuildContext context,
  required WidgetBuilder builder,
  bool barrierDismissible = true,
}) {
  return showGeneralDialog<T>(
    context: context,
    barrierDismissible: barrierDismissible,
    barrierLabel: MaterialLocalizations.of(context).modalBarrierDismissLabel,
    barrierColor: AppPalette.oceanDeep.withValues(alpha: 0.34),
    transitionDuration: const Duration(milliseconds: 480),
    pageBuilder: (ctx, _, __) => builder(ctx),
    transitionBuilder: (ctx, animation, _, child) {
      final spring = CurvedAnimation(
        parent: animation,
        curve: Motion.sheetSpring,
        reverseCurve: Curves.easeInCubic,
      );
      final fade = CurvedAnimation(
        parent: animation,
        curve: const Interval(0, 0.45, curve: Curves.easeOut),
      );
      return FadeTransition(
        opacity: fade,
        child: ScaleTransition(
          scale: Tween<double>(begin: 0.86, end: 1.0).animate(spring),
          child: child,
        ),
      );
    },
  );
}

/// Fades, lifts and scales its child into place. Give each item on a screen a
/// sequential [index] to get a staggered "one by one" load from the bottom up.
class StaggeredReveal extends StatefulWidget {
  final Widget child;
  final int index;

  /// Extra delay between consecutive items, as a fraction of [duration].
  final double stagger;
  final Duration duration;
  final double offsetY;
  final double scaleFrom;
  final Curve curve;

  const StaggeredReveal({
    super.key,
    required this.child,
    this.index = 0,
    this.stagger = 0.075,
    this.duration = Motion.reveal,
    this.offsetY = 34,
    this.scaleFrom = 0.965,
    this.curve = Motion.spring,
  });

  @override
  State<StaggeredReveal> createState() => _StaggeredRevealState();
}

class _StaggeredRevealState extends State<StaggeredReveal>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late Animation<double> _animation;
  late Animation<double> _fade;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(vsync: this, duration: widget.duration);
    _buildAnimations();
    final reduceMotion = WidgetsBinding
        .instance
        .platformDispatcher
        .accessibilityFeatures
        .disableAnimations;
    if (reduceMotion) {
      _controller.value = 1.0;
    } else {
      _controller.forward();
    }
  }

  void _buildAnimations() {
    final start = (widget.index * widget.stagger).clamp(0.0, 0.62);
    _animation = CurvedAnimation(
      parent: _controller,
      curve: Interval(start, 1.0, curve: widget.curve),
    );
    _fade = CurvedAnimation(
      parent: _controller,
      curve: Interval(
        start,
        (start + 0.55).clamp(0.0, 1.0),
        curve: Curves.easeOut,
      ),
    );
  }

  @override
  void didUpdateWidget(covariant StaggeredReveal oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.index != widget.index) {
      _buildAnimations();
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
      child: widget.child,
      builder: (context, child) {
        final t = _animation.value;
        final fade = _fade.value.clamp(0.0, 1.0);
        if (t >= 1.0 && fade >= 1.0) return child!;
        return Opacity(
          opacity: fade,
          child: Transform.translate(
            offset: Offset(0, (1 - t) * widget.offsetY),
            child: Transform.scale(
              scale: widget.scaleFrom + (1 - widget.scaleFrom) * t,
              child: child,
            ),
          ),
        );
      },
    );
  }
}
