import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:geolocator/geolocator.dart';
import 'package:camera/camera.dart';
import '../services/api_service.dart';
import '../widgets/skeleton_loader.dart';

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

  Future<void> _submitWithSelfie() async {
    if (_detected) return;
    _detected = true;

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

    final cameras = await availableCameras();
    if (cameras.isEmpty || !mounted) {
      _detected = false;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No front camera available')),
      );
      return;
    }

    final frontCamera = cameras.firstWhere(
      (c) => c.lensDirection == CameraLensDirection.front,
      orElse: () => cameras.first,
    );

    final xController = CameraController(frontCamera, ResolutionPreset.medium, enableAudio: false);
    await xController.initialize();
    if (!mounted) { await xController.dispose(); return; }

    final selfieFile = await Navigator.push<File>(
      context,
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (_) => _SelfieCapturePage(controller: xController),
      ),
    );
    await xController.dispose();
    if (!mounted) return;

    if (selfieFile == null) {
      _detected = false;
      return;
    }

    final bytes = await selfieFile.readAsBytes();
    final base64Selfie = base64Encode(bytes);

    try {
      final isPunchIn = await _shouldPunchIn();
      final result = await ApiService.selfiePunch(
        type: isPunchIn ? 'punch_in' : 'punch_out',
        selfieBase64: base64Selfie,
        mimeType: 'image/jpeg',
        latitude: pos.latitude,
        longitude: pos.longitude,
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(result['message'] ?? 'Submitted for approval')),
        );
        Navigator.pop(context, {'selfie': true, ...result});
      }
    } catch (e) {
      _detected = false;
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString())),
        );
      }
    }
  }

  Future<bool> _shouldPunchIn() async {
    try {
      final today = await ApiService.getTodayStatus();
      return today['punch_in_time'] == null;
    } catch (_) {
      return true;
    }
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
                    SkeletonLoader(
                      child: SkeletonBlock(width: 48, height: 48, borderRadius: 24, color: Colors.white24),
                    ),
                    SizedBox(height: 16),
                    Text('Starting camera...', style: TextStyle(color: Colors.white70)),
                  ],
                ),
              ),
              errorBuilder: (context, error, child) {
                WidgetsBinding.instance.addPostFrameCallback((_) {
                  if (mounted && !_detected) {
                    _submitWithSelfie();
                  }
                });
                return const SizedBox();
              },
            ),
            Positioned.fill(child: _ScanOverlay(scanLine: _scanLine)),
            Positioned(
              bottom: 40,
              left: 0,
              right: 0,
              child: Center(
                child: GestureDetector(
                  onTap: _isLocating
                      ? null
                      : () {
                          if (_isLocating) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text('Getting your location, please wait...'),
                                duration: Duration(seconds: 2),
                              ),
                            );
                            return;
                          }
                          _submitWithSelfie();
                        },
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                    decoration: BoxDecoration(
                      color: Colors.black.withValues(alpha: 0.5),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: Colors.white24),
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.camera_alt, color: Colors.white70, size: 20),
                        SizedBox(width: 10),
                        Text(
                          'Use Selfie to Punch',
                          style: TextStyle(color: Colors.white70, fontSize: 15, fontWeight: FontWeight.w500),
                        ),
                      ],
                    ),
                  ),
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
                padding: EdgeInsets.only(bottom: height * 0.22),
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

class _SelfieCapturePage extends StatefulWidget {
  final CameraController controller;
  const _SelfieCapturePage({required this.controller});

  @override
  State<_SelfieCapturePage> createState() => _SelfieCapturePageState();
}

class _SelfieCapturePageState extends State<_SelfieCapturePage> {
  bool _taking = false;

  Future<void> _take() async {
    if (_taking) return;
    setState(() => _taking = true);
    try {
      final file = await widget.controller.takePicture();
      if (mounted) Navigator.pop(context, File(file.path));
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Failed to capture selfie')),
        );
        Navigator.pop(context);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        fit: StackFit.expand,
        children: [
          Center(child: CameraPreview(widget.controller)),
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
          Positioned(
            bottom: 48,
            left: 0,
            right: 0,
            child: Center(
              child: GestureDetector(
                onTap: _take,
                child: Container(
                  width: 72,
                  height: 72,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(color: Colors.white, width: 4),
                  ),
                  child: _taking
                      ? const Padding(
                          padding: EdgeInsets.all(18),
                          child: CircularProgressIndicator(color: Colors.white, strokeWidth: 3),
                        )
                      : const Icon(Icons.camera_alt, color: Colors.white, size: 32),
                ),
              ),
            ),
          ),
          const Positioned(
            bottom: 130,
            left: 0,
            right: 0,
            child: Center(
              child: Text(
                'Take a selfie',
                style: TextStyle(color: Colors.white70, fontSize: 14),
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
