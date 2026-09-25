import 'dart:convert';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_zxing/flutter_zxing.dart';
import '../../core/lucide_icons.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_snackbar.dart';
import '../../services/api_service.dart';
import 'camera_capture_page.dart';

/// Scans an Aadhaar card by reading the SecureQR printed on the card
/// (automatic) and returns the decoded fields (name, dob, gender, address)
/// via Navigator.pop. Decoding happens server-side (POST /aadhaar/decode-qr);
/// the raw QR value is never stored on the device.
///
/// Uses ZXing (flutter_zxing ReaderWidget) instead of ML Kit: the Android
/// ML Kit pipeline silently skips the very dense Aadhaar SecureQR even when
/// it fills the frame, while ZXing reads it reliably.
class AadhaarScannerPage extends StatefulWidget {
  const AadhaarScannerPage({super.key});

  @override
  State<AadhaarScannerPage> createState() => _AadhaarScannerPageState();
}

class _AadhaarScannerPageState extends State<AadhaarScannerPage> {
  bool _isProcessing = false;
  bool _isFlashOn = false;
  CameraController? _cameraController;

  // The same (only, valid) code is re-reported every scan cycle while the
  // card stays in frame. Don't re-post to the backend immediately after a
  // failed decode; let the user adjust framing first.
  DateTime? _lastAttemptAt;

  Future<void> _handleScan(Code code) async {
    if (_isProcessing) return;
    final text = code.text?.trim() ?? '';
    if (text.isEmpty) return;

    final now = DateTime.now();
    if (_lastAttemptAt != null &&
        now.difference(_lastAttemptAt!) < const Duration(seconds: 2)) {
      return;
    }
    _lastAttemptAt = now;

    setState(() => _isProcessing = true);
    try {
      final data = await ApiService.decodeAadhaarQr(text);
      if (!mounted) return;
      Navigator.pop(context, data);
    } catch (e) {
      if (!mounted) return;
      // Surface the server's exact reason (message + safe diagnostic detail)
      // so failures can be diagnosed from the phone.
      final reason = e is Exception ? '$e' : 'Could not read this Aadhaar QR.';
      showAppSnackbar(
        context,
        reason.replaceFirst('Exception: ', ''),
        error: true,
      );
      setState(() => _isProcessing = false);
    }
  }

  void _onControllerCreated(CameraController? controller, Exception? error) {
    _cameraController = controller;
    if (error != null && mounted) {
      showAppSnackbar(
        context,
        'Could not start the camera. Please try again.',
        error: true,
      );
    }
  }

  Future<void> _toggleFlash() async {
    final controller = _cameraController;
    if (controller == null) return;
    try {
      if (!controller.value.isInitialized) return;
      await controller.setFlashMode(_isFlashOn ? FlashMode.off : FlashMode.torch);
      if (mounted) setState(() => _isFlashOn = !_isFlashOn);
    } catch (_) {
      // Torch not available on this camera; ignore.
    }
  }

  // Google-Lens-style fallback: capture a card photo and let the backend read
  // the printed fields with vision/OCR (POST /beneficiaries/aadhaar/parse-photo).
  Future<void> _scanFromPhoto() async {
    if (_isProcessing) return;
    final Uint8List? bytes = await Navigator.push<Uint8List>(
      context,
      MaterialPageRoute(
        builder: (_) => const CameraCapturePage(
          hint: 'Fill the whole front of the card in the frame',
          captureLabel: 'Read card',
        ),
      ),
    );
    if (bytes == null || !mounted) return;

    setState(() => _isProcessing = true);
    try {
      final base64 = base64Encode(bytes);
      final fields = await ApiService.parseAadhaarPhoto(base64);
      if (!mounted) return;
      final name = fields['name']?.toString().trim();
      final dob = fields['dob']?.toString();
      final photoAddress = fields['address_line_1']?.toString().trim();
      String? gender;
      switch ((fields['gender'] ?? '').toString().trim().toLowerCase()) {
        case 'm' || 'male':
          gender = 'Male';
        case 'f' || 'female':
          gender = 'Female';
        case 'transgender' || 't':
          gender = 'Other';
      }
      if ((name?.isNotEmpty ?? false) || (dob?.isNotEmpty ?? false)) {
        Navigator.pop(context, {
          'name': (name?.isNotEmpty ?? false) ? name : null,
          'dob': dob,
          'gender': gender,
          'address': (photoAddress?.isNotEmpty ?? false) ? photoAddress : null,
        });
      } else {
        showAppSnackbar(
          context,
          'Could not read the card from the photo. Try again with better lighting.',
          error: true,
        );
        setState(() => _isProcessing = false);
      }
    } catch (e) {
      if (!mounted) return;
      final reason = e is Exception ? '$e' : 'Could not read the card photo.';
      showAppSnackbar(
        context,
        reason.replaceFirst('Exception: ', ''),
        error: true,
      );
      setState(() => _isProcessing = false);
    }
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
            ExcludeSemantics(
              // Avoid framework bug flutter/flutter#191188: the camera
              // texture stays layout-dirty while the route transitions.
              child: ReaderWidget(
                onControllerCreated: _onControllerCreated,
                onScan: _handleScan,
                codeFormat: Format.qrCode,
                tryHarder: true,
                tryInverted: true,
                tryRotate: true,
                tryDownscale: false,
                cropPercent: 0.9,
                scanDelay: const Duration(milliseconds: 250),
                resolution: ResolutionPreset.high,
                lensDirection: CameraLensDirection.back,
                showScannerOverlay: false,
                showFlashlight: false,
                showToggleCamera: false,
                showGallery: false,
                allowPinchZoom: true,
              ),
            ),

            // Overlay
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
                      IconButton(
                        onPressed: _toggleFlash,
                        icon: Icon(_isFlashOn ? LucideIcons.flashlight : LucideIcons.flashlightOff, color: Colors.white),
                      ),
                    ],
                  ),
                ),
              ),
            ),

            // Bottom hint + photo fallback
            Positioned(
              bottom: 60,
              left: 0,
              right: 0,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    decoration: BoxDecoration(
                      color: Colors.black54,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: const Text(
                      'Hold the card flat inside the card-shaped frame · pinch to zoom',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Colors.white70, fontSize: 13),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextButton.icon(
                    onPressed: _isProcessing ? null : _scanFromPhoto,
                    icon: const Icon(LucideIcons.camera, color: Colors.white70, size: 18),
                    label: const Text(
                      'QR not reading? Read the card from a photo',
                      style: TextStyle(color: Colors.white70, fontSize: 13),
                    ),
                  ),
                ],
              ),
            ),

            if (_isProcessing)
              Center(
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                  decoration: BoxDecoration(
                    color: Colors.black54,
                    borderRadius: BorderRadius.circular(24),
                  ),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      ),
                      SizedBox(width: 12),
                      Text('Reading Aadhaar…', style: TextStyle(color: Colors.white, fontSize: 15)),
                    ],
                  ),
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

    // Landscape card-shaped frame (~1.585 aspect matches the physical Aadhaar
    // card, 85.6 x 54 mm). Kept from overlapping the top bar or bottom hint.
    const cardAspect = 1.585;
    var w = size.width * 0.8;
    var h = w / cardAspect;
    final maxH = size.height * 0.38;
    if (h > maxH) {
      h = maxH;
      w = h * cardAspect;
    }
    final scanArea = Rect.fromCenter(
      center: Offset(size.width / 2, size.height / 2),
      width: w,
      height: h,
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