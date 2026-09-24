import 'dart:typed_data';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';

import '../../core/lucide_icons.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_snackbar.dart';

/// In-app camera built directly on CameraX (no external camera app / intent).
/// Captures one photo and pops with the raw JPEG bytes (Uint8List). The
/// caller decides what to do with it (whiten, OCR, ...).
class CameraCapturePage extends StatefulWidget {
  const CameraCapturePage({
    super.key,
    this.hint = 'Tap the shutter to capture',
    this.captureLabel = 'Capture',
  });

  final String hint;
  final String captureLabel;

  @override
  State<CameraCapturePage> createState() => _CameraCapturePageState();
}

class _CameraCapturePageState extends State<CameraCapturePage> {
  CameraController? _controller;
  bool _initializing = true;
  bool _capturing = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
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
      _controller = CameraController(cam, ResolutionPreset.high, enableAudio: false);
      await _controller!.initialize();
      if (!mounted) return;
      setState(() => _initializing = false);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _initializing = false;
        _error = e.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  Future<void> _capture() async {
    final controller = _controller;
    if (controller == null || !controller.value.isInitialized) return;
    if (_capturing) return;
    setState(() => _capturing = true);
    try {
      final XFile shot = await controller.takePicture();
      if (!mounted) return;
      final Uint8List bytes = await shot.readAsBytes();
      if (!mounted) return;
      Navigator.pop(context, bytes);
    } catch (e) {
      if (!mounted) return;
      showAppSnackbar(
        context,
        'Capture failed: ${e.toString().replaceFirst('Exception: ', '')}',
        error: true,
      );
      setState(() => _capturing = false);
    }
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Stack(
          children: [
            if (_controller != null && _controller!.value.isInitialized)
              Positioned.fill(
                child: ExcludeSemantics(
                  // The platform-view texture is torn down with the page/route
                  // transition; excluding it from the semantics tree avoids
                  // framework bug flutter/flutter#191188 (flushSemantics runs
                  // on a layout-dirty render object).
                  child: CameraPreview(_controller!),
                ),
              )
            else
              Positioned.fill(
                child: Center(
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

            // Top bar
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                child: Row(
                  children: [
                    IconButton(
                      onPressed: () => Navigator.pop(context),
                      icon: const Icon(LucideIcons.arrowLeft, color: Colors.white),
                    ),
                    Expanded(
                      child: Center(
                        child: Text(
                          widget.hint,
                          textAlign: TextAlign.center,
                          style: const TextStyle(color: Colors.white70, fontSize: 13),
                        ),
                      ),
                    ),
                    const SizedBox(width: 48),
                  ],
                ),
              ),
            ),

            // Shutter
            Positioned(
              bottom: 36,
              left: 0,
              right: 0,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  ElevatedButton.icon(
                    onPressed:
                        (_initializing || _controller == null || _capturing)
                            ? null
                            : _capture,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppTheme.secondary,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(horizontal: 36, vertical: 14),
                    ),
                    icon: _capturing
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(
                                strokeWidth: 2, color: Colors.white),
                          )
                        : const Icon(LucideIcons.camera, size: 20),
                    label: Text(widget.captureLabel),
                  ),
                  if (_controller != null && !_controller!.value.isInitialized)
                    const Padding(
                      padding: EdgeInsets.only(top: 12),
                      child: Text(
                        'Initializing camera...',
                        style: TextStyle(color: Colors.white54, fontSize: 12),
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}