import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;
import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_tabler_icons/flutter_tabler_icons.dart';
import 'package:geolocator/geolocator.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../theme/app_palette.dart';
import '../widgets/app_toast.dart';
import '../widgets/skeleton_loader.dart';

class ScannerPage extends StatefulWidget {
  const ScannerPage({super.key});

  @override
  State<ScannerPage> createState() => _ScannerPageState();
}

class _ScannerPageState extends State<ScannerPage> {
  final MobileScannerController _controller = MobileScannerController(
    detectionSpeed: DetectionSpeed.noDuplicates,
  );
  bool _detected = false;
  bool _torchOn = false;

  Position? _cachedPosition;

  @override
  void initState() {
    super.initState();
    SystemChrome.setSystemUIOverlayStyle(
      const SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Brightness.light,
        statusBarBrightness: Brightness.dark,
      ),
    );
    _controller.addListener(_onControllerUpdate);
    _prefetchLocation();
  }

  Future<void> _prefetchLocation() async {
    try {
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        return;
      }
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
        ),
      ).timeout(const Duration(seconds: 8));
      _cachedPosition = pos;
    } catch (_) {}
  }

  void _onControllerUpdate() {
    if (_controller.value.isInitialized && _controller.value.isRunning) {
      _controller.setZoomScale(0.35);
      _controller.removeListener(_onControllerUpdate);
    }
  }

  Future<void> _toggleTorch() async {
    HapticFeedback.selectionClick();
    try {
      await _controller.toggleTorch();
      if (mounted) setState(() => _torchOn = !_torchOn);
    } catch (_) {}
  }

  @override
  void dispose() {
    SystemChrome.setSystemUIOverlayStyle(
      const SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Brightness.dark,
        statusBarBrightness: Brightness.light,
      ),
    );
    _controller.dispose();
    super.dispose();
  }

  Future<void> _onDetect(BarcodeCapture capture) async {
    if (_detected || capture.barcodes.isEmpty) return;
    _detected = true;

    final raw = capture.barcodes.first.rawValue ?? '';
    Map<String, dynamic> map;
    try {
      map = Map<String, dynamic>.from(jsonDecode(raw));
    } catch (_) {
      if (mounted) {
        AppToast.error('Invalid QR code format');
      }
      _detected = false;
      return;
    }

    final code = map['code']?.toString();
    if (code == null) {
      if (mounted) {
        AppToast.error('Invalid QR code data');
      }
      _detected = false;
      return;
    }

    HapticFeedback.vibrate();
    await _completeWithCode(code);
  }

  Future<void> _completeWithCode(String code) async {
    Position? pos = _cachedPosition;
    if (pos == null) {
      try {
        pos = await Geolocator.getCurrentPosition(
          locationSettings: const LocationSettings(
            accuracy: LocationAccuracy.high,
          ),
        ).timeout(const Duration(seconds: 8));
      } catch (_) {}
    }
    if (!mounted) return;
    if (pos == null) {
      _detected = false;
      _controller.start();
      AppToast.warning('Could not get location. Make sure GPS is enabled.');
      return;
    }
    Navigator.pop(context, {
      'code': code,
      'lat': pos.latitude,
      'lng': pos.longitude,
      'punch_method': 'scan',
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppPalette.ink,
      body: Stack(
        fit: StackFit.expand,
        children: [
          MobileScanner(
            controller: _controller,
            onDetect: _onDetect,
            placeholderBuilder: (context, child) => const Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  SkeletonLoader(
                    child: SkeletonBlock(
                      width: 48,
                      height: 48,
                      borderRadius: 24,
                      color: Colors.white24,
                    ),
                  ),
                  SizedBox(height: 16),
                  Text(
                    'Starting camera...',
                    style: TextStyle(color: Colors.white70),
                  ),
                ],
              ),
            ),
            errorBuilder: (context, error, child) => Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(
                      TablerIcons.camera_off,
                      color: Colors.white70,
                      size: 46,
                    ),
                    const SizedBox(height: 14),
                    const Text(
                      'Camera unavailable',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Allow camera access in settings to scan QR codes.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.55),
                        fontSize: 12.5,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          const _ScanOverlay(),
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: SafeArea(
              bottom: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                child: SizedBox(
                  height: 46,
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      Align(
                        alignment: Alignment.centerLeft,
                        child: _GlassIconButton(
                          icon: TablerIcons.arrow_left,
                          onTap: () => Navigator.pop(context),
                        ),
                      ),
                      const Text(
                        'Scan QR Code',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 0.2,
                        ),
                      ),
                      Align(
                        alignment: Alignment.centerRight,
                        child: _GlassIconButton(
                          icon: _torchOn
                              ? TablerIcons.bolt_off
                              : TablerIcons.bolt,
                          active: _torchOn,
                          onTap: _toggleTorch,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _GlassIconButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;
  final bool active;

  const _GlassIconButton({
    required this.icon,
    required this.onTap,
    this.active = false,
  });

  @override
  Widget build(BuildContext context) {
    return ClipOval(
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 18, sigmaY: 18),
        child: Material(
          color: active
              ? AppPalette.aqua.withValues(alpha: 0.9)
              : Colors.black.withValues(alpha: 0.3),
          child: InkWell(
            onTap: onTap,
            child: SizedBox(
              width: 44,
              height: 44,
              child: Icon(
                icon,
                size: 21,
                color: active ? AppPalette.ink : Colors.white,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _ScanOverlay extends StatelessWidget {
  const _ScanOverlay();

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final width = constraints.maxWidth;
        final height = constraints.maxHeight;
        if (width <= 0 || height <= 0) return const SizedBox.shrink();

        final side = math.min(width * 0.68, 282.0);
        final left = (width - side) / 2;
        final top = (height - side) / 2 - 18;
        final scanRect = Rect.fromLTWH(left, top, side, side);

        return CustomPaint(
          size: Size(width, height),
          painter: _OverlayPainter(scanRect: scanRect),
        );
      },
    );
  }
}

class _OverlayPainter extends CustomPainter {
  final Rect scanRect;

  _OverlayPainter({required this.scanRect});

  @override
  void paint(Canvas canvas, Size size) {
    const radius = Radius.circular(28);

    final dimPaint = Paint()..color = Colors.black.withValues(alpha: 0.58);
    final dimPath = Path()
      ..fillType = PathFillType.evenOdd
      ..addRect(Rect.fromLTWH(0, 0, size.width, size.height))
      ..addRRect(RRect.fromRectAndRadius(scanRect, radius));
    canvas.drawPath(dimPath, dimPaint);

    final framePaint = Paint()
      ..color = Colors.white.withValues(alpha: 0.24)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.5;
    canvas.drawRRect(RRect.fromRectAndRadius(scanRect, radius), framePaint);

    final cornerPaint = Paint()
      ..color = AppPalette.aqua
      ..style = PaintingStyle.stroke
      ..strokeWidth = 4
      ..strokeCap = StrokeCap.round;

    const cornerLen = 28.0;
    const cornerRadius = 22.0;
    final r = scanRect;
    final cornerPaths = <Path>[
      Path()
        ..moveTo(r.left, r.top + cornerLen)
        ..lineTo(r.left, r.top + cornerRadius)
        ..quadraticBezierTo(r.left, r.top, r.left + cornerRadius, r.top)
        ..lineTo(r.left + cornerLen, r.top),
      Path()
        ..moveTo(r.right - cornerLen, r.top)
        ..lineTo(r.right - cornerRadius, r.top)
        ..quadraticBezierTo(r.right, r.top, r.right, r.top + cornerRadius)
        ..lineTo(r.right, r.top + cornerLen),
      Path()
        ..moveTo(r.left, r.bottom - cornerLen)
        ..lineTo(r.left, r.bottom - cornerRadius)
        ..quadraticBezierTo(r.left, r.bottom, r.left + cornerRadius, r.bottom)
        ..lineTo(r.left + cornerLen, r.bottom),
      Path()
        ..moveTo(r.right - cornerLen, r.bottom)
        ..lineTo(r.right - cornerRadius, r.bottom)
        ..quadraticBezierTo(r.right, r.bottom, r.right, r.bottom - cornerRadius)
        ..lineTo(r.right, r.bottom - cornerLen),
    ];
    for (final path in cornerPaths) {
      canvas.drawPath(path, cornerPaint);
    }
  }

  @override
  bool shouldRepaint(covariant _OverlayPainter oldDelegate) =>
      scanRect != oldDelegate.scanRect;
}
