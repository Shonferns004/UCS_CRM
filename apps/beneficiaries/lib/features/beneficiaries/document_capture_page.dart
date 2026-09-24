import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../../core/lucide_icons.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_skeleton.dart';
import '../../core/widgets/app_snackbar.dart';
import '../../services/scan_effect.dart';
import 'camera_capture_page.dart';

/// Captures a document photo and runs it through the document-scanner
/// pipeline (auto edge detection, perspective correction, whitening) so the
/// result looks like an actual scanned copy. Pops with `{ base64, name }`
/// where base64 is an already-scanned JPEG.
class DocumentCapturePage extends StatefulWidget {
  const DocumentCapturePage({super.key});

  @override
  State<DocumentCapturePage> createState() => _DocumentCapturePageState();
}

class _DocumentCapturePageState extends State<DocumentCapturePage> {
  Uint8List? _original;
  Uint8List? _scanned;
  bool _processing = false;

  Future<void> _openCamera() async {
    setState(() => _processing = true);
    try {
      final Uint8List? bytes = await Navigator.push<Uint8List>(
        context,
        MaterialPageRoute(
          builder: (_) => const CameraCapturePage(
            hint: 'Place the document on a flat surface with good lighting',
            captureLabel: 'Capture',
          ),
        ),
      );
      if (bytes == null) return;
      if (!mounted) return;
      // Run edge detection + perspective warp + whitening off the UI isolate
      // so the loading indicator can paint while it works. `compute` sends
      // the top-level `scanDocument` function and the bytes as data, avoiding
      // the Isolate.run closure-capture (unsendable _AsyncCompleter) bug.
      final scanned = await compute(scanDocument, bytes);
      if (!mounted) return;
      setState(() {
        _original = bytes;
        _scanned = scanned;
      });
    } catch (e) {
      if (!mounted) return;
      showAppSnackbar(
        context,
        'Could not open the camera: ${e.toString().replaceFirst('Exception: ', '')}',
        error: true,
      );
    } finally {
      if (mounted) setState(() => _processing = false);
    }
  }

  void _confirm() {
    final scanned = _scanned;
    if (scanned == null) return;
    Navigator.pop(context, {
      'base64': base64Encode(scanned),
      'name': 'scanned_document.jpg',
    });
  }

  Future<void> _retake() async {
    setState(() {
      _original = null;
      _scanned = null;
    });
    await _openCamera();
  }

  @override
  Widget build(BuildContext context) {
    final scanned = _scanned;
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: const Text('Capture Document'),
      ),
      body: _processing
          ? const Center(
              child: SkeletonBox(
                width: 160,
                height: 12,
                borderRadius: 6,
                baseColor: Colors.white24,
                shineColor: Colors.white,
              ),
            )
          : scanned == null
              ? _buildEmptyState()
              : _buildPreview(),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(LucideIcons.camera, size: 64, color: Colors.white54),
          const SizedBox(height: 20),
          const Text(
            'Place the document on a flat surface with good lighting, then capture.',
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.white70, fontSize: 14),
          ),
          const SizedBox(height: 28),
          ElevatedButton.icon(
            onPressed: _openCamera,
            style: ElevatedButton.styleFrom(
              backgroundColor: AppTheme.secondary,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 14),
            ),
            icon: Icon(LucideIcons.scanLine, size: 20),
            label: const Text('Capture Document'),
          ),
        ],
      ),
    );
  }

  Widget _buildPreview() {
    final original = _original;
    return SafeArea(
      child: Column(
        children: [
          Expanded(
            child: InteractiveViewer(
              child: Center(
                child: Image.memory(_scanned!, fit: BoxFit.contain),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
            child: Row(
              children: [
                if (original != null) ...[
                  Expanded(
                    child: _MiniCard(label: 'Original', bytes: original),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _MiniCard(label: 'Scanned', bytes: _scanned!),
                  ),
                ] else
                  const Expanded(child: SizedBox()),
                const SizedBox(width: 20),
                OutlinedButton.icon(
                  onPressed: _retake,
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Colors.white,
                    side: const BorderSide(color: Colors.white54),
                    padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
                  ),
                  icon: const Icon(LucideIcons.refreshCw, size: 18),
                  label: const Text('Retake'),
                ),
                const SizedBox(width: 12),
                ElevatedButton.icon(
                  onPressed: _confirm,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.secondary,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
                  ),
                  icon: const Icon(LucideIcons.check, size: 18),
                  label: const Text('Use photo'),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _MiniCard extends StatelessWidget {
  final String label;
  final Uint8List bytes;

  const _MiniCard({required this.label, required this.bytes});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(6),
      decoration: BoxDecoration(
        color: Colors.black54,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.white24),
      ),
      child: Column(
        children: [
          Text(
            label,
            style: const TextStyle(color: Colors.white70, fontSize: 12),
          ),
          const SizedBox(height: 6),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: Image.memory(
              bytes,
              width: double.infinity,
              height: 64,
              fit: BoxFit.cover,
            ),
          ),
        ],
      ),
    );
  }
}