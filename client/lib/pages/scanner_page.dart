import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:geolocator/geolocator.dart';
import '../services/api_service.dart';

class ScannerPage extends StatefulWidget {
  const ScannerPage({super.key});

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
  bool _showManualEntry = false;
  List<Map<String, dynamic>> _todayCodes = [];
  bool _codesLoading = true;

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

    Timer(const Duration(seconds: 5), () {
      if (mounted && !_detected) {
        setState(() => _showManualEntry = true);
      }
    });
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
      if (mounted) setState(() => _todayCodes = codes);
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

  Future<void> _submitDailyCode(String dailyCode) async {
    if (_detected) return;
    _detected = true;
    HapticFeedback.vibrate();
    await _completeWithDailyCode(dailyCode);
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
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(child: Stack(
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
                if (mounted) setState(() => _showManualEntry = true);
              });
              return const Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.camera_alt_outlined, color: Colors.white54, size: 56),
                    SizedBox(height: 16),
                    Text('Camera unavailable', style: TextStyle(color: Colors.white70)),
                    SizedBox(height: 8),
                    Text('Tap your location below', style: TextStyle(color: Colors.white38, fontSize: 13)),
                  ],
                ),
              );
            },
          ),
          Positioned.fill(child: _ScanOverlay(
            scanLine: _scanLine,
            showManual: _showManualEntry,
            todayCodes: _todayCodes,
            codesLoading: _codesLoading,
            isLocating: _isLocating,
            onTapCode: _submitDailyCode,
          )),
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
      )),
    );
  }
}

class _ScanOverlay extends StatelessWidget {
  final Animation<double> scanLine;
  final bool showManual;
  final List<Map<String, dynamic>> todayCodes;
  final bool codesLoading;
  final bool isLocating;
  final void Function(String) onTapCode;

  const _ScanOverlay({
    required this.scanLine,
    required this.showManual,
    required this.todayCodes,
    required this.codesLoading,
    required this.isLocating,
    required this.onTapCode,
  });

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
              showManual: showManual,
            ),
            child: child,
          ),
          child: Column(
            children: [
              const Spacer(),
              if (showManual)
                _ManualCodePanel(
                  todayCodes: todayCodes,
                  codesLoading: codesLoading,
                  isLocating: isLocating,
                  onTapCode: onTapCode,
                  height: height,
                )
              else
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

class _ManualCodePanel extends StatelessWidget {
  final List<Map<String, dynamic>> todayCodes;
  final bool codesLoading;
  final bool isLocating;
  final void Function(String) onTapCode;
  final double height;

  const _ManualCodePanel({
    required this.todayCodes,
    required this.codesLoading,
    required this.isLocating,
    required this.onTapCode,
    required this.height,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: EdgeInsets.only(bottom: height * 0.04),
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.75),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.touch_app, color: Colors.white54, size: 18),
              SizedBox(width: 6),
              Text(
                'Tap your location',
                style: TextStyle(
                  color: Colors.white70,
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          if (codesLoading && todayCodes.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 8),
              child: SizedBox(
                width: 20, height: 20,
                child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white38),
              ),
            )
          else if (todayCodes.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 12),
              child: Text(
                'No codes available for today.\nContact HR to generate daily codes.',
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.white38, fontSize: 13),
              ),
            )
          else
            ...todayCodes.map((c) => Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Material(
                color: Colors.white.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(10),
                child: InkWell(
                  borderRadius: BorderRadius.circular(10),
                  onTap: () {
                    if (isLocating) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('Getting your location, please wait...'),
                          duration: Duration(seconds: 2),
                        ),
                      );
                      return;
                    }
                    onTapCode(c['daily_code'] as String);
                  },
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                    child: Row(
                      children: [
                        const Icon(Icons.location_on_outlined, color: Colors.white54, size: 18),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            c['label'] as String? ?? 'Unknown',
                            style: const TextStyle(color: Colors.white, fontSize: 15),
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                          decoration: BoxDecoration(
                            color: const Color(0xFF2563eb).withValues(alpha: 0.3),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(
                            c['daily_code'] as String? ?? '',
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 18,
                              fontWeight: FontWeight.bold,
                              letterSpacing: 2,
                            ),
                          ),
                        ),
                        const SizedBox(width: 6),
                        const Icon(Icons.chevron_right, color: Colors.white24, size: 20),
                      ],
                    ),
                  ),
                ),
              ),
            )),
        ],
      ),
    );
  }
}

class _OverlayPainter extends CustomPainter {
  final Rect scanRect;
  final double scanLineValue;
  final bool showManual;

  _OverlayPainter({
    required this.scanRect,
    this.scanLineValue = 0,
    this.showManual = false,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final overlayPaint = Paint()..color = Colors.black.withValues(alpha: 0.55);
    final path = Path()
      ..fillType = PathFillType.evenOdd
      ..addRect(Rect.fromLTWH(0, 0, size.width, size.height))
      ..addRRect(RRect.fromRectAndRadius(scanRect, const Radius.circular(12)));
    canvas.drawPath(path, overlayPaint);

    if (!showManual) {
      final lineY = scanRect.top + scanRect.height * scanLineValue;
      final linePaint = Paint()
        ..color = const Color(0xFF2563eb).withValues(alpha: 0.6)
        ..strokeWidth = 2.0;
      canvas.drawLine(
        Offset(scanRect.left + 4, lineY),
        Offset(scanRect.right - 4, lineY),
        linePaint,
      );
    }

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
      scanLineValue != oldDelegate.scanLineValue ||
      showManual != oldDelegate.showManual;
}
