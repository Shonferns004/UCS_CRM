import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';
import 'fingerprint_enroll_panel.dart';

class FingerprintCaptureScreen extends StatefulWidget {
  final String beneficiaryCode;
  final String beneficiaryName;
  final bool isVerification;
  const FingerprintCaptureScreen({
    super.key,
    required this.beneficiaryCode,
    required this.beneficiaryName,
    this.isVerification = false,
  });

  @override
  State<FingerprintCaptureScreen> createState() => _FingerprintCaptureScreenState();
}

class _FingerprintCaptureScreenState extends State<FingerprintCaptureScreen> {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.isVerification ? 'Verify Fingerprint' : 'Enroll Fingerprint'),
        backgroundColor: AppTheme.primary,
        foregroundColor: Colors.white,
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: AppTheme.outline),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(widget.beneficiaryName, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                const SizedBox(height: 4),
                Text(widget.beneficiaryCode, style: const TextStyle(fontSize: 13, color: AppTheme.textSecondary)),
              ],
            ),
          ),
          const SizedBox(height: 16),
          FingerprintEnrollPanel(
            beneficiaryCode: widget.beneficiaryCode,
            beneficiaryName: widget.beneficiaryName,
            onDone: () => Navigator.of(context).popUntil((route) => route.isFirst),
          ),
        ],
      ),
    );
  }
}