import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import '../../core/lucide_icons.dart';
import '../../core/widgets/app_skeleton.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_snackbar.dart';
import '../../services/api_service.dart';
import 'camera_capture_page.dart';

/// Scans an Aadhaar card two ways:
///   - QR: reads the SecureQR printed on the card (automatic); or
///   - Photo: captures the front of the card and OCRs it server-side.
/// Both return the decoded fields (name, dob, gender, address, aadhaar number)
/// via Navigator.pop.
class AadhaarScannerPage extends StatefulWidget {
  const AadhaarScannerPage({super.key});

  @override
  State<AadhaarScannerPage> createState() => _AadhaarScannerPageState();
}

class _AadhaarScannerPageState extends State<AadhaarScannerPage> {
  MobileScannerController? _controller;
  bool _isProcessing = false;
  bool _isFlashOn = false;
  bool _photoMode = false;

  @override
  void initState() {
    super.initState();
    _controller = MobileScannerController(
      detectionSpeed: DetectionSpeed.normal,
      facing: CameraFacing.back,
      torchEnabled: false,
    );
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  Future<void> _onDetect(BarcodeCapture capture) async {
    if (_isProcessing || _photoMode) return;
    final barcode = capture.barcodes.firstOrNull;
    if (barcode == null || barcode.rawValue == null) return;

    setState(() => _isProcessing = true);
    _controller?.stop();

    try {
      final result = await ApiService.post(
        '/beneficiaries/aadhaar/parse',
        body: {'qr_value': barcode.rawValue},
        timeout: const Duration(seconds: 30),
      );
      if (!mounted) return;
      Navigator.pop(context, Map<String, dynamic>.from(result));
    } catch (e) {
      if (!mounted) return;
      showAppSnackbar(
        context,
        e.toString().replaceFirst('Exception: ', ''),
        error: true,
      );
      _controller?.start();
      setState(() => _isProcessing = false);
    }
  }

  Future<void> _capturePhoto() async {
    if (_isProcessing) return;
    setState(() => _isProcessing = true);
    _controller?.stop();
    try {
      final Uint8List? bytes = await Navigator.push<Uint8List>(
        context,
        MaterialPageRoute(
          builder: (_) => const CameraCapturePage(
            hint: 'Capture the full front of the Aadhaar card',
            captureLabel: 'Capture',
          ),
        ),
      );
      if (bytes == null) {
        if (!mounted) return;
        _controller?.start();
        setState(() => _isProcessing = false);
        return;
      }
      final base64 = base64Encode(bytes);
      if (!mounted) return;
      final result = await ApiService.post(
        '/beneficiaries/aadhaar/parse-photo',
        body: {'image': base64},
        timeout: const Duration(seconds: 40),
      );
      if (!mounted) return;
      Navigator.pop(context, Map<String, dynamic>.from(result));
    } catch (e) {
      if (!mounted) return;
      showAppSnackbar(
        context,
        e.toString().replaceFirst('Exception: ', ''),
        error: true,
      );
      _controller?.start();
      setState(() => _isProcessing = false);
    }
  }

  Future<void> _togglePhotoMode() async {
    setState(() {
      _photoMode = !_photoMode;
      _isProcessing = false;
    });
    if (_photoMode) {
      _controller?.stop();
    } else {
      _isFlashOn = false;
      _controller?.start();
    }
  }

  void _toggleFlash() {
    _isFlashOn = !_isFlashOn;
    _controller?.toggleTorch();
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: const SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Brightness.light,
        statusBarBrightness: Brightness.dark,
      ),
      child: Scaffold(
        backgroundColor: Colors.black,
        body: Stack(
          children: [
            if (!_photoMode)
              ExcludeSemantics(
                // Avoid framework bug flutter/flutter#191188: the camera
                // texture stays layout-dirty while the route transitions.
                child: MobileScanner(
                  controller: _controller,
                  onDetect: _onDetect,
                ),
              )
            else
              const SizedBox.expand(
                child: Center(
                  child: Text(
                    'Photo mode: capture the full front of the Aadhaar card.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Colors.white70, fontSize: 14),
                  ),
                ),
              ),

            // Overlay
            if (!_photoMode)
              CustomPaint(
                size: Size.infinite,
                painter: _AadhaarOverlayPainter(),
              ),

            // Top bar
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              child: SafeArea(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  child: Row(
                    children: [
                      IconButton(
                        onPressed: () => Navigator.pop(context),
                        icon: const Icon(LucideIcons.arrowLeft, color: Colors.white),
                      ),
                      const Expanded(
                        child: Text('Scan Aadhaar Card',
                            style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w600)),
                      ),
                      if (!_photoMode)
                        IconButton(
                          onPressed: _toggleFlash,
                          icon: Icon(_isFlashOn ? LucideIcons.flashlight : LucideIcons.flashlightOff, color: Colors.white),
                        ),
                    ],
                  ),
                ),
              ),
            ),

            // Bottom hint + mode switch / capture
            Positioned(
              bottom: 60,
              left: 0,
              right: 0,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Center(
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                      decoration: BoxDecoration(
                        color: Colors.black54,
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(
                        _photoMode
                            ? 'Whole card visible & well-lit'
                            : 'Position the Aadhaar QR code within the frame',
                        style: const TextStyle(color: Colors.white70, fontSize: 13),
                      ),
                    ),
                  ),
                  const SizedBox(height: 18),
                  if (_photoMode)
                    ElevatedButton.icon(
                      onPressed: _isProcessing ? null : _capturePhoto,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppTheme.secondary,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 14),
                      ),
                      icon: _isProcessing
                          ? const SkeletonBox(
                              width: 16,
                              height: 16,
                              borderRadius: 5,
                              baseColor: Colors.white24,
                              shineColor: Colors.white,
                            )
                          : const Icon(LucideIcons.camera, size: 20),
                      label: Text(_isProcessing ? 'Reading...' : 'Click Photo'),
                    )
                  else
                    TextButton.icon(
                      onPressed: _togglePhotoMode,
                      style: TextButton.styleFrom(
                        foregroundColor: Colors.white,
                        backgroundColor: Colors.black45,
                        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
                      ),
                      icon: const Icon(LucideIcons.camera, size: 18),
                      label: const Text('Take a photo instead'),
                    ),
                ],
              ),
            ),

            if (_isProcessing && !_photoMode)
              const Center(
                child: SkeletonBox(
                  width: 140,
                  height: 10,
                  borderRadius: 5,
                  baseColor: Colors.white24,
                  shineColor: Colors.white,
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _AadhaarOverlayPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = Colors.black45;
    final scanArea = Rect.fromCenter(
      center: Offset(size.width / 2, size.height / 2),
      width: size.width * 0.75,
      height: size.width * 0.75,
    );

    canvas.drawPath(
      Path.combine(
        PathOperation.difference,
        Path()..addRect(Rect.fromLTWH(0, 0, size.width, size.height)),
        Path()..addRRect(RRect.fromRectAndRadius(scanArea, const Radius.circular(12))),
      ),
      paint,
    );

    final bracketPaint = Paint()
      ..color = AppTheme.secondary
      ..strokeWidth = 3
      ..style = PaintingStyle.stroke;

    const len = 30.0;
    final r = scanArea;

    // Top-left
    canvas.drawLine(Offset(r.left, r.top + len), Offset(r.left, r.top), bracketPaint);
    canvas.drawLine(Offset(r.left, r.top), Offset(r.left + len, r.top), bracketPaint);
    // Top-right
    canvas.drawLine(Offset(r.right - len, r.top), Offset(r.right, r.top), bracketPaint);
    canvas.drawLine(Offset(r.right, r.top), Offset(r.right, r.top + len), bracketPaint);
    // Bottom-left
    canvas.drawLine(Offset(r.left, r.bottom - len), Offset(r.left, r.bottom), bracketPaint);
    canvas.drawLine(Offset(r.left, r.bottom), Offset(r.left + len, r.bottom), bracketPaint);
    // Bottom-right
    canvas.drawLine(Offset(r.right - len, r.bottom), Offset(r.right, r.bottom), bracketPaint);
    canvas.drawLine(Offset(r.right, r.bottom), Offset(r.right, r.bottom - len), bracketPaint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}