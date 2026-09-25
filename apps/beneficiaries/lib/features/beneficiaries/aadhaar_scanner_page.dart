import 'dart:convert';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../core/lucide_icons.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_snackbar.dart';
import '../../services/api_service.dart';

/// Reads an Aadhaar card from a photo: the user aligns the whole card front
/// inside the card-shaped frame, taps "Read card", confirms the captured
/// picture, and the backend reads the printed fields with vision/OCR
/// (POST /beneficiaries/aadhaar/parse-photo). Returns the decoded fields
/// (name, dob, gender, address) via Navigator.pop. The raw card is never
/// stored on the device.
class AadhaarScannerPage extends StatefulWidget {
  const AadhaarScannerPage({super.key});

  @override
  State<AadhaarScannerPage> createState() => _AadhaarScannerPageState();
}

class _AadhaarScannerPageState extends State<AadhaarScannerPage> {
  CameraController? _cameraController;
  bool _initializing = true;
  bool _isProcessing = false;
  bool _isFlashOn = false;
  String? _error;

  // Captured photo awaiting confirmation (shown for review before OCR).
  Uint8List? _shot;

  @override
  void initState() {
    super.initState();
    _initCamera();
  }

  @override
  void dispose() {
    _cameraController?.dispose();
    super.dispose();
  }

  Future<void> _initCamera() async {
    try {
      final cameras = await availableCameras();
      if (!mounted) return;
      final cam = cameras.isEmpty
          ? null
          : cameras.firstWhere(
              (c) => c.lensDirection == CameraLensDirection.back,
              orElse: () => cameras.first,
            );
      if (cam == null) {
        setState(() {
          _initializing = false;
          _error = 'No camera found on this device.';
        });
        return;
      }
      final controller = CameraController(cam, ResolutionPreset.high, enableAudio: false);
      await controller.initialize();
      if (!mounted) {
        controller.dispose();
        return;
      }
      setState(() {
        _cameraController = controller;
        _initializing = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _initializing = false;
        _error = e.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  Future<void> _toggleFlash() async {
    final controller = _cameraController;
    if (controller == null || !controller.value.isInitialized) return;
    try {
      await controller.setFlashMode(_isFlashOn ? FlashMode.off : FlashMode.torch);
      if (mounted) setState(() => _isFlashOn = !_isFlashOn);
    } catch (_) {
      // Torch not available on this camera; ignore.
    }
  }

  Future<void> _capture() async {
    if (_isProcessing) return;
    final controller = _cameraController;
    if (controller == null || !controller.value.isInitialized) return;
    try {
      final XFile shot = await controller.takePicture();
      if (!mounted) return;
      final bytes = await shot.readAsBytes();
      if (!mounted) return;
      setState(() => _shot = bytes);
    } catch (e) {
      if (!mounted) return;
      showAppSnackbar(
        context,
        'Capture failed: ${e.toString().replaceFirst('Exception: ', '')}',
        error: true,
      );
    }
  }

  void _retake() {
    if (_isProcessing) return;
    setState(() => _shot = null);
  }

  Future<void> _usePhoto() async {
    final bytes = _shot;
    if (bytes == null || _isProcessing) return;
    setState(() => _isProcessing = true);
    try {
      final fields = await ApiService.parseAadhaarPhoto(base64Encode(bytes));
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
          'Could not read the card from this photo. Try again with better lighting.',
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
            if (_shot != null)
              // Review the capture before it is sent to OCR.
              Positioned.fill(
                child: Container(
                  color: Colors.black,
                  child: Center(
                    child: Image.memory(_shot!, fit: BoxFit.contain),
                  ),
                ),
              )
            else
              Positioned.fill(
                // The live preview is letterboxed to the camera's aspect ratio
                // so the captured photo matches exactly what the user framed.
                child: ExcludeSemantics(
                  // Avoid framework bug flutter/flutter#191188: the camera
                  // texture stays layout-dirty while the route transitions.
                  child: _cameraController != null && _cameraController!.value.isInitialized
                      ? Center(
                          child: AspectRatio(
                            aspectRatio: _cameraController!.value.aspectRatio,
                            child: CameraPreview(_cameraController!),
                          ),
                        )
                      : Center(
                          child: _initializing
                              ? const CircularProgressIndicator(color: Colors.white)
                              : Padding(
                                  padding: const EdgeInsets.all(24),
                                  child: Text(
                                    _error ?? 'Camera unavailable',
                                    textAlign: TextAlign.center,
                                    style: const TextStyle(color: Colors.white70),
                                  ),
                                ),
                        ),
                ),
              ),

            if (_shot == null)
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
                        onPressed: _shot == null ? _toggleFlash : null,
                        icon: Icon(_isFlashOn ? LucideIcons.flashlight : LucideIcons.flashlightOff, color: Colors.white),
                      ),
                    ],
                  ),
                ),
              ),
            ),

            // Bottom actions
            Positioned(
              bottom: 40,
              left: 0,
              right: 0,
              child: _shot != null
                  ? Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        OutlinedButton.icon(
                          onPressed: _isProcessing ? null : _retake,
                          style: OutlinedButton.styleFrom(
                            foregroundColor: Colors.white,
                            side: const BorderSide(color: Colors.white54),
                            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
                          ),
                          icon: const Icon(LucideIcons.refreshCw, size: 18),
                          label: const Text('Retake'),
                        ),
                        const SizedBox(width: 16),
                        ElevatedButton.icon(
                          onPressed: _isProcessing ? null : _usePhoto,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: AppTheme.secondary,
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
                          ),
                          icon: _isProcessing
                              ? const SizedBox(
                                  width: 18,
                                  height: 18,
                                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                                )
                              : const Icon(LucideIcons.check, size: 20),
                          label: const Text('Use this photo'),
                        ),
                      ],
                    )
                  : Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                          decoration: BoxDecoration(
                            color: Colors.black54,
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: const Text(
                            'Place the card flat inside the frame, then tap Read card',
                            textAlign: TextAlign.center,
                            style: TextStyle(color: Colors.white70, fontSize: 13),
                          ),
                        ),
                        const SizedBox(height: 12),
                        ElevatedButton.icon(
                          onPressed:
                              (_initializing || _cameraController == null || _isProcessing)
                                  ? null
                                  : _capture,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: AppTheme.secondary,
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(horizontal: 36, vertical: 14),
                          ),
                          icon: const Icon(LucideIcons.camera, size: 20),
                          label: const Text('Read card'),
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