import 'dart:async';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import '../models/punch_log.dart';

class ScanPage extends StatefulWidget {
  const ScanPage({super.key});

  @override
  State<ScanPage> createState() => _ScanPageState();
}

class _ScanPageState extends State<ScanPage> with WidgetsBindingObserver {
  final MobileScannerController _scannerController = MobileScannerController();
  final List<PunchLog> _todayLog = [];
  bool _punchedIn = false;
  DateTime? _punchInTime;
  bool _scannerActive = false;
  bool _showResult = false;
  bool _isSuccess = true;
  String _resultTitle = '';
  String _resultSub = '';
  String _lastPunchInStr = '—';
  String _lastPunchOutStr = '—';
  String _lastWorkHoursStr = '0h 0m';
  Timer? _clockTimer;
  Timer? _resultTimer;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _startClock();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _scannerController.dispose();
    _clockTimer?.cancel();
    _resultTimer?.cancel();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _startScanner();
    } else {
      _stopScanner();
    }
  }

  void _startClock() {
    _clockTimer = Timer.periodic(const Duration(seconds: 1), (_) => setState(() {}));
  }

  void _startScanner() {
    if (!_scannerActive) {
      _scannerActive = true;
      _scannerController.start();
    }
  }

  void _stopScanner() {
    if (_scannerActive) {
      _scannerActive = false;
      _scannerController.stop();
    }
  }

  void _onScan(BarcodeCapture capture) {
    if (capture.barcodes.isEmpty) return;
    if (_showResult) return;

    _stopScanner();
    final now = DateTime.now();
    final timeStr = DateFormat('hh:mm a').format(now);
    final late = now.hour >= 9 && now.minute > 10;

    if (!_punchedIn) {
      setState(() {
        _punchedIn = true;
        _punchInTime = now;
        _lastPunchInStr = timeStr;
        _isSuccess = true;
        _resultTitle = 'Punch In Successful!';
        _resultSub = '$timeStr — ${late ? 'Late arrival' : 'On time'}';
        _showResult = true;
        _todayLog.add(PunchLog(time: timeStr, label: 'Punch In', type: late ? 'late' : 'present'));
      });
    } else {
      final mins = now.difference(_punchInTime!).inMinutes;
      final h = mins ~/ 60;
      final m = mins % 60;
      setState(() {
        _punchedIn = false;
        _lastPunchOutStr = timeStr;
        _lastWorkHoursStr = '${h}h ${m}m';
        _isSuccess = true;
        _resultTitle = 'Punch Out Recorded';
        _resultSub = '$timeStr — Work hours: ${h}h ${m}m';
        _showResult = true;
        _todayLog.add(PunchLog(time: timeStr, label: 'Punch Out', type: 'out'));
      });
    }

    _resultTimer?.cancel();
    _resultTimer = Timer(const Duration(seconds: 4), () {
      setState(() => _showResult = false);
      _startScanner();
    });
  }

  Color _statusColor(String type) {
    switch (type) {
      case 'present': return const Color(0xFF1D7A4F);
      case 'late': return const Color(0xFFB06A00);
      case 'out': return const Color(0xFF2355D4);
      default: return const Color(0xFF72706B);
    }
  }

  Color _statusBg(String type) {
    switch (type) {
      case 'present': return const Color(0xFFE6F6ED);
      case 'late': return const Color(0xFFFFF3E0);
      case 'out': return const Color(0xFFEEF2FD);
      default: return const Color(0xFFF0EFE9);
    }
  }

  String _statusLabel(String type) {
    switch (type) {
      case 'present': return 'In';
      case 'late': return 'Late';
      case 'out': return 'Out';
      default: return type;
    }
  }

  Widget _punchInfo(String label, String value) {
    return Column(
      children: [
        Text(value, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
        const SizedBox(height: 2),
        Text(label, style: const TextStyle(fontSize: 11, color: Color(0xFF72706B))),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final timeStr = DateFormat('hh:mm').format(now);
    final ampm = DateFormat('a').format(now);
    final dayStr = DateFormat('EEE, dd MMM yyyy').format(now);

    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Container(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0x17000000)),
            ),
            padding: const EdgeInsets.symmetric(vertical: 28, horizontal: 20),
            child: Column(
              children: [
                Text(timeStr, style: const TextStyle(fontSize: 48, fontWeight: FontWeight.w700, color: Color(0xFF2355D4), letterSpacing: -2)),
                const SizedBox(height: 4),
                Text('$ampm — $dayStr', style: const TextStyle(fontSize: 13, color: Color(0xFF72706B))),
                const SizedBox(height: 20),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    _punchInfo('Punched In', _lastPunchInStr),
                    const SizedBox(width: 24),
                    _punchInfo('Punched Out', _lastPunchOutStr),
                    const SizedBox(width: 24),
                    _punchInfo('Work Hours', _lastWorkHoursStr),
                  ],
                ),
              ],
            ),
          ),
          if (_showResult)
            Container(
              margin: const EdgeInsets.only(top: 16),
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: _isSuccess ? const Color(0xFFE6F6ED) : const Color(0xFFFDEAEA),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: _isSuccess ? const Color(0xFFA8DFC0) : const Color(0xFFF5B7B0)),
              ),
              child: Column(
                children: [
                  Icon(_isSuccess ? Icons.check_circle : Icons.error, size: 48, color: _isSuccess ? const Color(0xFF1D7A4F) : const Color(0xFFC0392B)),
                  const SizedBox(height: 8),
                  Text(_resultTitle, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 4),
                  Text(_resultSub, style: const TextStyle(fontSize: 14, color: Color(0xFF72706B))),
                ],
              ),
            ),
          const SizedBox(height: 16),
          ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: Container(
              decoration: BoxDecoration(
                color: Colors.white,
                border: Border.all(color: const Color(0x17000000)),
              ),
              child: Column(
                children: [
                  SizedBox(
                    height: 240,
                    child: MobileScanner(
                      controller: _scannerController,
                      onDetect: _onScan,
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.all(16),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.qr_code_scanner, size: 16, color: const Color(0xFF72706B)),
                        const SizedBox(width: 8),
                        Text('Point the camera at the office QR code to punch in/out', style: const TextStyle(fontSize: 13, color: Color(0xFF72706B))),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFFFFF3E0),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.info_outline, size: 18, color: const Color(0xFF7A4900)),
                const SizedBox(width: 10),
                Expanded(child: Text('If QR camera does not start, allow camera permission when prompted by your browser.', style: TextStyle(fontSize: 13, color: const Color(0xFF7A4900)))),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Container(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0x17000000)),
            ),
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text("Today's log", style: TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: const Color(0xFF72706B), letterSpacing: 0.6)),
                const SizedBox(height: 12),
                if (_todayLog.isEmpty)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 12),
                    child: Text('No punches recorded yet', style: TextStyle(fontSize: 13, color: Color(0xFFA8A69F))),
                  )
                else
                  ..._todayLog.map((log) => Container(
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    decoration: BoxDecoration(border: Border(bottom: BorderSide(color: const Color(0x17000000)))),
                    child: Row(
                      children: [
                        Text(log.label, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500)),
                        const SizedBox(width: 12),
                        Text(log.time, style: const TextStyle(fontSize: 13, color: Color(0xFFA8A69F))),
                        const Spacer(),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(color: _statusBg(log.type), borderRadius: BorderRadius.circular(20)),
                          child: Text(_statusLabel(log.type), style: TextStyle(fontSize: 11, fontWeight: FontWeight.w500, color: _statusColor(log.type))),
                        ),
                      ],
                    ),
                  )),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
