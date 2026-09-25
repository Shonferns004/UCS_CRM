import 'dart:convert';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../core/lucide_icons.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_snackbar.dart';
import '../../services/api_service.dart';

/// Reads an Aadhaar card in two photos: the FRONT side (name, DOB, gender,
/// Aadhaar number) then the BACK side (address). The user aligns the card side
/// inside the card-shaped frame, taps "Read front"/"Read back", confirms each
/// capture, and the backend reads the fields with Gemini vision/OCR
/// (POST /beneficiaries/aadhaar/parse-photo). Returns the combined fields
/// (name, dob, gender, address, aadhaar_number) via Navigator.pop. The raw
/// card photos are never stored on the device.
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

  // Confirmed FRONT photo. While null the user is photographing the front;
  // once set they photograph the BACK side.
  Uint8List? _frontBytes;

  bool get _awaitingBack => _frontBytes != null;

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

  // "Use this photo": the front shot just gets confirmed and we move on to the
  // back; once both sides are captured we read the whole card.
  Future<void> _usePhoto() async {
    final bytes = _shot;
    if (bytes == null || _isProcessing) return;
    if (_frontBytes == null) {
      setState(() {
        _frontBytes = bytes;
        _shot = null;
      });
      return;
    }
    await _readCard();
  }

  // Reads name/dob/gender/aadhaar_number from the FRONT photo and the address
  // from the BACK photo, then pops with the combined autofill fields.
  Future<void> _readCard() async {
    final front = _frontBytes;
    final back = _shot;
    if (front == null || back == null || _isProcessing) return;
    setState(() => _isProcessing = true);
    try {
      final frontFields = await ApiService.parseAadhaarPhoto(base64Encode(front), side: 'front');
      final backFields = await ApiService.parseAadhaarPhoto(base64Encode(back), side: 'back');
      if (!mounted) return;

      String? first(Map<String, dynamic> fields, List<String> keys) {
        for (final k in keys) {
          final v = fields[k];
          if (v is String && v.trim().isNotEmpty) return v.trim();
        }
        return null;
      }

      final name = first(frontFields, ['name', 'fullName', 'FullName', 'holder_name']);
      final dob = first(frontFields, ['dob', 'dateOfBirth', 'date_of_birth', 'DOB']);
      final aadhaarNumber = first(frontFields, ['aadhaar_number', 'aadhaarNumber', 'uid']);
      final photoAddress = first(backFields, ['address_line_1', 'address', 'address1']);

      String? gender;
      switch ((frontFields['gender'] ?? '').toString().trim().toLowerCase()) {
        case 'm' || 'male':
          gender = 'Male';
        case 'f' || 'female':
          gender = 'Female';
        case 'transgender' || 't':
          gender = 'Other';
      }

      if (name != null || dob != null) {
        Navigator.pop(context, {
          'name': name,
          'dob': dob,
          'gender': gender,
          'address': photoAddress,
          'aadhaar_number': aadhaarNumber,
        });
      } else {
        showAppSnackbar(
          context,
          'Could not read the front of this card. Retake with the whole card in view, flat and well-lit.',
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
                // Live preview, full screen (same pattern as the app's other
                // capture pages) so it is never stretched out of shape.
                child: ExcludeSemantics(
                  // Avoid framework bug flutter/flutter#191188: the camera
                  // texture stays layout-dirty while the route transitions.
                  child: _cameraController != null && _cameraController!.value.isInitialized
                      ? CameraPreview(_cameraController!)
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
                          label: Text(_awaitingBack ? 'Use back' : 'Use front'),
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
                          child: Text(
                            _awaitingBack
                                ? 'Step 2 of 2 · BACK side — place the back of the card inside the frame'
                                : 'Step 1 of 2 · FRONT side — place the front of the card inside the frame',
                            textAlign: TextAlign.center,
                            style: const TextStyle(color: Colors.white70, fontSize: 13),
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
                          label: Text(_awaitingBack ? 'Read back' : 'Read front'),
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