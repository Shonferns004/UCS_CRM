import '../../core/lucide_icons.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import '../../core/widgets/app_skeleton.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_snackbar.dart';
import '../../services/api_service.dart';
import 'beneficiary_detail_page.dart';

class QrScannerPage extends StatefulWidget {
  const QrScannerPage({super.key});

  @override
  State<QrScannerPage> createState() => _QrScannerPageState();
}

class _QrScannerPageState extends State<QrScannerPage> {
  MobileScannerController? _controller;
  bool _isProcessing = false;
  bool _isFlashOn = false;

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
    if (_isProcessing) return;
    final barcode = capture.barcodes.firstOrNull;
    if (barcode == null || barcode.rawValue == null) return;

    setState(() => _isProcessing = true);
    _controller?.stop();

    try {
      final result = await ApiService.get('/beneficiaries/lookup/${barcode.rawValue}');
      if (!mounted) return;
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (_) => BeneficiaryDetailPage(beneficiary: result)),
      );
    } catch (e) {
if (!mounted) return;
      showAppSnackbar(
        context,
        'Not found: ${barcode.rawValue}',
        error: true,
      );
      _controller?.start();
      setState(() => _isProcessing = false);
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
            MobileScanner(
              controller: _controller,
              onDetect: _onDetect,
            ),

          // Overlay
          CustomPaint(
            size: Size.infinite,
            painter: _ScannerOverlayPainter(),
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
                      child: Text('Scan QR / Barcode', style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w600)),
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

          // Bottom hint
          Positioned(
            bottom: 60,
            left: 0,
            right: 0,
            child: Center(
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                decoration: BoxDecoration(
                  color: Colors.black54,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: const Text(
                  'Position QR code within the frame',
                  style: TextStyle(color: Colors.white70, fontSize: 13),
                ),
              ),
            ),
          ),

if (_isProcessing)
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

class _ScannerOverlayPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = Colors.black45;
    final scanArea = Rect.fromCenter(
      center: Offset(size.width / 2, size.height / 2),
      width: size.width * 0.7,
      height: size.width * 0.7,
    );

    // Dim area
    canvas.drawPath(
      Path.combine(
        PathOperation.difference,
        Path()..addRect(Rect.fromLTWH(0, 0, size.width, size.height)),
        Path()..addRRect(RRect.fromRectAndRadius(scanArea, const Radius.circular(12))),
      ),
      paint,
    );

    // Corner brackets
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
    canvas.drawLine(Offset(r.right, r.bottom - len), Offset(r.right, r.bottom), bracketPaint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

