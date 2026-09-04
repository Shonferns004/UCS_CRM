import 'dart:convert';
import 'dart:io';
import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../services/location_service.dart';

class PunchPage extends StatefulWidget {
  final Map<String, dynamic> worker;
  final String action; // 'punch_in' | 'punch_out' | 'done'

  const PunchPage({super.key, required this.worker, required this.action});

  @override
  State<PunchPage> createState() => _PunchPageState();
}

class _PunchPageState extends State<PunchPage> {
  bool _locating = true;
  double? _lat;
  double? _lng;
  File? _selfie;
  bool _submitting = false;
  String? _localError;

  @override
  void initState() {
    super.initState();
    _resolveLocation();
  }

  Future<void> _resolveLocation() async {
    final pos = await LocationService.getCurrentLocation();
    if (!mounted) return;
    setState(() {
      _lat = pos?.latitude;
      _lng = pos?.longitude;
      _locating = false;
      _localError = pos == null ? 'Could not determine location. Enable GPS or connect to WiFi.' : null;
    });
  }

  Future<void> _captureSelfie() async {
    try {
      final cameras = await availableCameras();
      if (cameras.isEmpty) {
        _snack('No camera available');
        return;
      }
      final camera = cameras.firstWhere(
        (c) => c.lensDirection == CameraLensDirection.front,
        orElse: () => cameras.first,
      );
      final controller = CameraController(camera, ResolutionPreset.medium, enableAudio: false);
      await controller.initialize();
      if (!mounted) {
        await controller.dispose();
        return;
      }
      final file = await Navigator.of(context).push<File>(
        MaterialPageRoute(
          fullscreenDialog: true,
          builder: (_) => _SelfieCapture(controller: controller),
        ),
      );
      await controller.dispose();
      if (!mounted) return;
      if (file != null) {
        setState(() => _selfie = file);
      }
    } catch (_) {
      _snack('Could not open camera');
    }
  }

  Future<void> _submit() async {
    if (_selfie == null) {
      _snack('Capture a selfie first');
      return;
    }
    if (_lat == null || _lng == null) {
      _snack('Location not available. Please retry.');
      return;
    }
    setState(() => _submitting = true);
    try {
      final bytes = await _selfie!.readAsBytes();
      final base64Selfie = base64Encode(bytes);
      await ApiService.hrSelfiePunch(
        workerId: (widget.worker['id'] ?? '').toString(),
        type: widget.action,
        selfieBase64: base64Selfie,
        mimeType: 'image/jpeg',
        latitude: _lat!,
        longitude: _lng!,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(widget.action == 'punch_in' ? 'Punch-in recorded' : 'Punch-out recorded'),
          backgroundColor: Colors.green.shade700,
        ),
      );
      Navigator.of(context).pop();
    } catch (e) {
      _snack(e.toString());
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  void _snack(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(msg), backgroundColor: Colors.red.shade700),
    );
  }

  @override
  Widget build(BuildContext context) {
    final name = (widget.worker['name'] ?? 'Unknown').toString();
    final loginId = (widget.worker['login_id'] ?? '').toString();
    final actionLabel = widget.action == 'punch_in' ? 'Punch In' : 'Punch Out';

    return Scaffold(
      appBar: AppBar(title: Text(actionLabel)),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Card(
              child: ListTile(
                leading: const CircleAvatar(child: Icon(Icons.person)),
                title: Text(name, style: const TextStyle(fontWeight: FontWeight.w600)),
                subtitle: Text(loginId),
              ),
            ),
            const SizedBox(height: 16),
            // Location status
            Card(
              child: ListTile(
                leading: Icon(
                  _lat == null ? Icons.location_off : Icons.location_on,
                  color: _lat == null ? Colors.red : Colors.green,
                ),
                title: Text(_locating
                    ? 'Resolving location...'
                    : (_lat != null
                        ? 'Location: ${_lat!.toStringAsFixed(5)}, ${_lng!.toStringAsFixed(5)}'
                        : 'Location unavailable')),
                subtitle: _localError != null ? Text(_localError!, style: TextStyle(color: Colors.red.shade700)) : null,
                trailing: IconButton(
                  icon: const Icon(Icons.refresh),
                  onPressed: _resolveLocation,
                  tooltip: 'Retry location',
                ),
              ),
            ),
            const SizedBox(height: 16),
            // Selfie preview / capture
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text('Geo-tagged selfie', style: TextStyle(fontWeight: FontWeight.w600)),
                    const SizedBox(height: 12),
                    if (_selfie != null)
                      ClipRRect(
                        borderRadius: BorderRadius.circular(12),
                        child: Image.file(_selfie!, height: 220, fit: BoxFit.cover),
                      )
                    else
                      Container(
                        height: 180,
                        decoration: BoxDecoration(
                          color: Colors.grey.shade200,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: const Center(
                          child: Icon(Icons.camera_alt, size: 48, color: Colors.grey),
                        ),
                      ),
                    const SizedBox(height: 12),
                    OutlinedButton.icon(
                      onPressed: _captureSelfie,
                      icon: const Icon(Icons.camera_alt),
                      label: Text(_selfie == null ? 'Capture Selfie' : 'Retake Selfie'),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: _submitting ? null : _submit,
              style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 16)),
              child: _submitting
                  ? const SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                    )
                  : Text('Submit $actionLabel'),
            ),
          ],
        ),
      ),
    );
  }
}

class _SelfieCapture extends StatefulWidget {
  final CameraController controller;
  const _SelfieCapture({required this.controller});

  @override
  State<_SelfieCapture> createState() => _SelfieCaptureState();
}

class _SelfieCaptureState extends State<_SelfieCapture> {
  bool _taking = false;

  Future<void> _take() async {
    if (_taking) return;
    setState(() => _taking = true);
    try {
      final file = await widget.controller.takePicture();
      if (mounted) Navigator.of(context).pop(File(file.path));
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Failed to capture selfie')),
        );
        Navigator.of(context).pop();
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
              onTap: () => Navigator.of(context).pop(),
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
