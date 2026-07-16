import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:geolocator/geolocator.dart';
import '../services/api_service.dart';

class ScannerPage extends StatefulWidget {
  final int delaySeconds;
  const ScannerPage({super.key, this.delaySeconds = 7});

  @override
  State<ScannerPage> createState() => _ScannerPageState();
}

class _ScannerPageState extends State<ScannerPage>
    with SingleTickerProviderStateMixin {
  final MobileScannerController _controller = MobileScannerController(
    detectionSpeed: DetectionSpeed.noDuplicates,
  );
  bool _detected = false;
  late final AnimationController _scanAnim;
  late final Animation<double> _scanLine;

  Position? _cachedPosition;
  bool _isLocating = true;
  List<Map<String, dynamic>> _todayCodes = [];
  bool _codesLoading = true;

  bool _sheetVisible = false;

  @override
  void initState() {
    super.initState();
    _scanAnim = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 2),
    )..repeat(reverse: true);
    _scanLine = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(parent: _scanAnim, curve: Curves.easeInOut),
    );
    _controller.addListener(_onControllerUpdate);
    _prefetchLocation();
    _fetchTodayCodes();
  }

  Future<void> _prefetchLocation() async {
    try {
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
        ),
      ).timeout(const Duration(seconds: 8));
      _cachedPosition = pos;
    } catch (_) {}
    if (mounted) setState(() => _isLocating = false);
  }

  Future<void> _fetchTodayCodes() async {
    try {
      final codes = await ApiService.getTodayCodes();
      if (mounted) {
        setState(() => _todayCodes = codes);
        if (codes.isNotEmpty && mounted) {
          Future.delayed(Duration(seconds: widget.delaySeconds), () {
            if (mounted && !_detected) {
              setState(() {
                _sheetVisible = true;
              });
            }
          });
        }
      }
    } catch (_) {}
    if (mounted) setState(() => _codesLoading = false);
  }

  void _onControllerUpdate() {
    if (_controller.value.isInitialized && _controller.value.isRunning) {
      _controller.setZoomScale(0.35);
      _controller.removeListener(_onControllerUpdate);
    }
  }

  @override
  void dispose() {
    _scanAnim.dispose();
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
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Invalid QR code format')),
        );
      }
      _detected = false;
      return;
    }

    final code = map['code']?.toString();
    if (code == null) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Invalid QR code data')),
        );
      }
      _detected = false;
      return;
    }

    HapticFeedback.vibrate();
    await _completeWithCode(code);
  }

  Future<void> _submitDailyCode() async {
    if (_detected) return;
    if (_todayCodes.isEmpty) return;
    _detected = true;
    HapticFeedback.vibrate();
    await _completeWithDailyCode(_todayCodes.first['daily_code'] as String);
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
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Could not get location. Make sure GPS is enabled.'),
          duration: Duration(seconds: 3),
        ),
      );
      return;
    }
    Navigator.pop(context, {
      'code': code,
      'lat': pos.latitude,
      'lng': pos.longitude,
      'punch_method': 'scan',
    });
  }

  Future<void> _completeWithDailyCode(String dailyCode) async {
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
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Could not get location. Make sure GPS is enabled.'),
          duration: Duration(seconds: 3),
        ),
      );
      return;
    }
    Navigator.pop(context, {
      'dailyCode': dailyCode,
      'lat': pos.latitude,
      'lng': pos.longitude,
      'punch_method': 'manual_code',
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Stack(
          children: [
            MobileScanner(
              controller: _controller,
              onDetect: _onDetect,
              placeholderBuilder: (context, child) => const Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    CircularProgressIndicator(color: Colors.white),
                    SizedBox(height: 16),
                    Text('Starting camera...', style: TextStyle(color: Colors.white70)),
                  ],
                ),
              ),
              errorBuilder: (context, error, child) {
                WidgetsBinding.instance.addPostFrameCallback((_) {
                  if (mounted && _todayCodes.isNotEmpty && !_sheetVisible) {
                    setState(() {
                      _sheetVisible = true;
                    });
                  }
                });
                return const SizedBox();
              },
            ),
            Positioned.fill(child: _ScanOverlay(scanLine: _scanLine)),
            if (_sheetVisible)
              GestureDetector(
                onTap: () => setState(() => _sheetVisible = false),
                child: Container(color: Colors.black.withValues(alpha: 0.15)),
              ),
            if (_sheetVisible)
              Positioned(
                left: 0,
                right: 0,
                bottom: 0,
                child: SizedBox(
                  height: 280,
                  child: _CodeSheetContent(
                  todayCodes: _todayCodes,
                  codesLoading: _codesLoading,
                  isLocating: _isLocating,
                  onSubmit: _submitDailyCode,
                ),
                ),
              ),
            Positioned(
              top: 48,
              left: 16,
              child: GestureDetector(
                onTap: () => Navigator.pop(context),
                child: Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.4),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: const Icon(Icons.arrow_back, color: Colors.white, size: 22),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ScanOverlay extends StatelessWidget {
  final Animation<double> scanLine;
  const _ScanOverlay({required this.scanLine});

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final width = constraints.maxWidth;
        final height = constraints.maxHeight;
        if (width <= 0 || height <= 0) return const SizedBox();

        final scanSize = width * 0.7;
        final left = (width - scanSize) / 2;
        final top = (height - scanSize) / 2;
        final scanRect = Rect.fromLTWH(left, top, scanSize, scanSize);

        return AnimatedBuilder(
          animation: scanLine,
          builder: (_, child) => CustomPaint(
            painter: _OverlayPainter(
              scanRect: scanRect,
              scanLineValue: scanLine.value,
            ),
            child: child,
          ),
          child: Column(
            children: [
              const Spacer(),
              Padding(
                padding: EdgeInsets.only(bottom: height * 0.18),
                child: const Text(
                  'Align QR code within the frame',
                  style: TextStyle(
                    color: Colors.white70,
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                    letterSpacing: 0.3,
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _CodeSheetContent extends StatefulWidget {
  final List<Map<String, dynamic>> todayCodes;
  final bool codesLoading;
  final bool isLocating;
  final VoidCallback onSubmit;

  const _CodeSheetContent({
    required this.todayCodes,
    required this.codesLoading,
    required this.isLocating,
    required this.onSubmit,
  });

  @override
  State<_CodeSheetContent> createState() => _CodeSheetContentState();
}

class _CodeSheetContentState extends State<_CodeSheetContent>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulseCtrl;
  late final Animation<double> _pulseAnim;

  @override
  void initState() {
    super.initState();
    _pulseCtrl = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 2),
    )..repeat();
    _pulseAnim = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(parent: _pulseCtrl, curve: Curves.easeOut),
    );
  }

  double get _heartbeat {
    final t = _pulseAnim.value;
    if (t < 0.10) return t / 0.10;
    if (t < 0.18) return 1.0 - (t - 0.10) / 0.08;
    if (t < 0.26) return (t - 0.18) / 0.08;
    if (t < 0.34) return 1.0 - (t - 0.26) / 0.08;
    return 0.0;
  }

  @override
  void dispose() {
    _pulseCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final code = widget.todayCodes.isNotEmpty
        ? widget.todayCodes.first['daily_code'] as String
        : '----';
    final mq = MediaQuery.of(context);
    final boxW = (mq.size.width - 80).clamp(200.0, 320.0);
    final codeBoxH = boxW * 0.12 + 36.0;

    return Container(
      width: double.infinity,
      height: 180,
      decoration: const BoxDecoration(
        color: Color(0xFF1A1A2E),
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: Stack(
        children: [
          Positioned(
            top: 12,
            left: 0,
            right: 0,
            child: Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: Colors.white24,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
          ),
          Center(
            child: GestureDetector(
              onTap: () {
                if (widget.isLocating) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Getting your location, please wait...'),
                      duration: Duration(seconds: 2),
                    ),
                  );
                  return;
                }
                widget.onSubmit();
              },
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  AnimatedBuilder(
                    animation: _pulseAnim,
                    builder: (context, child) {
                      final hb = _heartbeat;
                      return Opacity(
                        opacity: 0.5 + hb * 0.3,
                        child: const Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.touch_app, color: Colors.white38, size: 14),
                            SizedBox(width: 6),
                            Text(
                              'Tap to punch in',
                              style: TextStyle(
                                color: Colors.white38,
                                fontSize: 13,
                                letterSpacing: 1,
                              ),
                            ),
                          ],
                        ),
                      );
                    },
                  ),
                  const SizedBox(height: 10),
                  AnimatedBuilder(
                    animation: _pulseAnim,
                    builder: (context, child) {
                      final hb = _heartbeat;
                      return SizedBox(
                        width: boxW,
                        height: codeBoxH,
                        child: Stack(
                          alignment: Alignment.center,
                          children: [
                            if (hb > 0)
                              for (final i in [0, 1])
                                Transform.scale(
                                  scale: 1.0 + hb * (0.04 + i * 0.02),
                                  child: Container(
                                    width: boxW,
                                    height: codeBoxH,
                                    decoration: BoxDecoration(
                                      borderRadius: BorderRadius.circular(16),
                                      border: Border.all(
                                        color: const Color(0xFF2563eb).withValues(alpha: (hb * (0.35 - i * 0.1)).clamp(0.0, 1.0)),
                                        width: 1.5,
                                      ),
                                    ),
                                  ),
                                ),
                            Container(
                              width: boxW,
                              height: codeBoxH,
                              decoration: BoxDecoration(
                                borderRadius: BorderRadius.circular(16),
                                border: Border.all(color: Colors.white12),
                                color: Colors.white.withValues(alpha: 0.03),
                              ),
                              child: Center(
                                child: Text(
                                  code,
                                  style: TextStyle(
                                    color: Colors.white,
                                    fontSize: mq.size.width > 400 ? 38 : 34,
                                    fontWeight: FontWeight.w300,
                                    letterSpacing: 10,
                                    height: 1,
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                      );
                    },
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _OverlayPainter extends CustomPainter {
  final Rect scanRect;
  final double scanLineValue;

  _OverlayPainter({required this.scanRect, this.scanLineValue = 0});

  @override
  void paint(Canvas canvas, Size size) {
    final overlayPaint = Paint()..color = Colors.black.withValues(alpha: 0.55);
    final path = Path()
      ..fillType = PathFillType.evenOdd
      ..addRect(Rect.fromLTWH(0, 0, size.width, size.height))
      ..addRRect(RRect.fromRectAndRadius(scanRect, const Radius.circular(12)));
    canvas.drawPath(path, overlayPaint);

    final lineY = scanRect.top + scanRect.height * scanLineValue;
    final linePaint = Paint()
      ..color = const Color(0xFF2563eb).withValues(alpha: 0.6)
      ..strokeWidth = 2.0;
    canvas.drawLine(
      Offset(scanRect.left + 4, lineY),
      Offset(scanRect.right - 4, lineY),
      linePaint,
    );

    final cornerPaint = Paint()
      ..color = const Color(0xFF2563eb)
      ..strokeWidth = 3.5
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;
    const cornerLen = 22.0;
    final r = scanRect;

    canvas.drawLine(r.topLeft, Offset(r.left + cornerLen, r.top), cornerPaint);
    canvas.drawLine(r.topLeft, Offset(r.left, r.top + cornerLen), cornerPaint);
    canvas.drawLine(r.topRight, Offset(r.right - cornerLen, r.top), cornerPaint);
    canvas.drawLine(r.topRight, Offset(r.right, r.top + cornerLen), cornerPaint);
    canvas.drawLine(r.bottomLeft, Offset(r.left + cornerLen, r.bottom), cornerPaint);
    canvas.drawLine(r.bottomLeft, Offset(r.left, r.bottom - cornerLen), cornerPaint);
    canvas.drawLine(r.bottomRight, Offset(r.right - cornerLen, r.bottom), cornerPaint);
    canvas.drawLine(r.bottomRight, Offset(r.right, r.bottom - cornerLen), cornerPaint);
  }

  @override
  bool shouldRepaint(covariant _OverlayPainter oldDelegate) =>
      scanRect != oldDelegate.scanRect ||
      scanLineValue != oldDelegate.scanLineValue;
}
