import '../../core/lucide_icons.dart';
import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_skeleton.dart';
import '../../core/widgets/app_snackbar.dart';
import '../../services/api_service.dart';
import 'fingerprint_capture_screen.dart';

class BeneficiaryDetailPage extends StatefulWidget {
  final Map<String, dynamic> beneficiary;
  const BeneficiaryDetailPage({super.key, required this.beneficiary});

  @override
  State<BeneficiaryDetailPage> createState() => _BeneficiaryDetailPageState();
}

class _BeneficiaryDetailPageState extends State<BeneficiaryDetailPage> {
  late Map<String, dynamic> _b;
  bool _loading = false;
  bool _markingKit = false;

  @override
  void initState() {
    super.initState();
    _b = widget.beneficiary;
    if (_b['fingerprint_status'] == null && _b['id'] != null) _refresh();
  }

  Future<void> _refresh() async {
    try {
      final result = await ApiService.get('/beneficiaries/${_b['id']}');
      if (mounted) setState(() => _b = result);
    } catch (_) {}
  }

  Future<void> _enrollFingerprint() async {
    if (_b['beneficiary_code'] == null) return;
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => FingerprintCaptureScreen(
          beneficiaryCode: _b['beneficiary_code'],
          beneficiaryName: _b['full_name'] ?? _b['first_name'] ?? 'Beneficiary',
        ),
      ),
    );
    _refresh();
  }

  Future<void> _checkIn() async {
    setState(() => _loading = true);
    try {
      await ApiService.post('/programs/check-in', body: {
        'beneficiary_code': _b['beneficiary_code'],
      });
      if (!mounted) return;
      showAppSnackbar(context, 'Checked in successfully', success: true);
    } catch (e) {
      if (!mounted) return;
      showAppSnackbar(context, e.toString(), error: true);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _issueBenefit() async {
    setState(() => _loading = true);
    try {
      await ApiService.post('/distributions', body: {
        'beneficiary_code': _b['beneficiary_code'],
      });
      if (!mounted) return;
      showAppSnackbar(context, 'Benefit issued', success: true);
    } catch (e) {
      if (!mounted) return;
      showAppSnackbar(context, e.toString(), error: true);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _markKitCollected() async {
    setState(() => _markingKit = true);
    try {
      final result = await ApiService.post('/beneficiaries/${_b['id']}/kit-collected');
      if (!mounted) return;
      setState(() {
        final res = result['beneficiary'];
        if (res is Map) {
          _b = Map<String, dynamic>.from(res);
        } else {
          _b['kit_collected'] = true;
        }
      });
      showAppSnackbar(context, 'Kit marked as collected', success: true);
    } catch (e) {
      if (!mounted) return;
      showAppSnackbar(context, e.toString(), error: true);
    } finally {
      if (mounted) setState(() => _markingKit = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final name = _b['full_name'] ?? _b['first_name'] ?? 'Unknown';
    final code = _b['beneficiary_code'] ?? '';
    final status = _b['status'] ?? 'ACTIVE';
    final mobile = _b['mobile'] ?? '';
    final city = _b['city'] ?? '';
    final categories = (_b['categories'] as List?)?.map((c) => c['name'] ?? c).join(', ') ?? '';

    return Scaffold(
      appBar: AppBar(title: const Text('Beneficiary', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w600))),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(24, 8, 24, 32),
        children: [
          // Header
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(24),
              boxShadow: AppTheme.cardShadow,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      width: 56,
                      height: 56,
                      decoration: const BoxDecoration(
                        color: AppTheme.blueSoft,
                        shape: BoxShape.circle,
                      ),
                      alignment: Alignment.center,
                      child: Text(
                        name.isNotEmpty ? name[0].toUpperCase() : '?',
                        style: const TextStyle(
                            fontSize: 22,
                            fontWeight: FontWeight.w700,
                            color: AppTheme.secondary),
                      ),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(name,
                              style: const TextStyle(
                                  fontSize: 18, fontWeight: FontWeight.w700)),
                          const SizedBox(height: 2),
                          Text(code,
                              style: const TextStyle(
                                  fontSize: 12, color: AppTheme.textSecondary)),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 20),
                _infoRow('Status', status, accentSuccess: status == 'ACTIVE'),
                if (mobile.isNotEmpty) _infoRow('Mobile', mobile),
                if (city.isNotEmpty) _infoRow('City', city),
                if (categories.isNotEmpty) _infoRow('Categories', categories),
                _infoRow('Fingerprint', _b['fingerprint_status'] ?? 'PENDING',
                    accentSuccess: _b['fingerprint_status'] == 'ENROLLED'),
              ],
            ),
          ),
          const SizedBox(height: 20),

          // Actions
          Row(
            children: [
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: _loading ? null : _checkIn,
                  icon: _loading
                      ? const SkeletonBox(
                          width: 16,
                          height: 16,
                          borderRadius: 5,
                          baseColor: Colors.white24,
                          shineColor: Colors.white,
                        )
                      : const Icon(LucideIcons.userCheck, size: 18),
                  label: const Text('Check In'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: _loading ? null : _issueBenefit,
                  icon: const Icon(LucideIcons.package, size: 18),
                  label: const Text('Benefit'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.success,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: _enrollFingerprint,
              icon: const Icon(LucideIcons.fingerprint, size: 18),
              label: const Text('Enroll Fingerprint'),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.blueSoft,
                foregroundColor: AppTheme.secondary,
              ),
            ),
          ),
          const SizedBox(height: 20),

          // Kit collection — swipe right to mark as collected
          _buildKitCollectionCard(),
          const SizedBox(height: 20),

          // Assistance history
          if ((_b['assistance'] as List?)?.isNotEmpty == true) ...[
            const Text('Support History',
                style: TextStyle(
                    fontSize: 21, fontWeight: FontWeight.w600,
                    color: AppTheme.textPrimary)),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(20),
                boxShadow: AppTheme.cardShadow,
              ),
              child: Column(
                children: (() {
                  final list = _b['assistance'] as List;
                  return [
                    for (var i = 0; i < list.length; i++) ...[
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        child: Row(
                          children: [
                            const Icon(LucideIcons.package,
                                size: 18, color: AppTheme.success),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Text(
                                list[i]['assistance_type'] ?? '',
                                style: const TextStyle(fontSize: 14),
                              ),
                            ),
                            Text(
                              list[i]['provided_date'] ?? '',
                              style: const TextStyle(
                                  fontSize: 12, color: AppTheme.textSecondary),
                            ),
                          ],
                        ),
                      ),
                      if (i != list.length - 1)
                        const Divider(height: 1, thickness: 1),
                    ],
                  ];
                })(),
              ),
            ),
          ],
        ],
      ),
    );
  }

  bool get _kitCollected => _b['kit_collected'] == true;

  Widget _buildKitCollectionCard() {
    final collected = _kitCollected;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: collected ? AppTheme.greenSoft : Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: collected ? AppTheme.success : AppTheme.outline,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                collected ? LucideIcons.box : LucideIcons.package,
                size: 20,
                color: collected ? AppTheme.success : AppTheme.secondary,
              ),
              const SizedBox(width: 8),
              Text(
                'Kit Collection',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: collected ? AppTheme.success : AppTheme.textPrimary,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          if (collected)
            Row(
              children: [
                const Icon(LucideIcons.checkCircle, size: 18, color: AppTheme.success),
                const SizedBox(width: 6),
                const Expanded(
                  child: Text(
                    'Kit collected',
                    style: TextStyle(
                        fontSize: 13,
                        color: AppTheme.success,
                        fontWeight: FontWeight.w600),
                  ),
                ),
                if (_b['kit_collected_at'] != null)
                  Text(
                    '${_b['kit_collected_at']}'.substring(0, 10),
                    style:
                        const TextStyle(fontSize: 11, color: AppTheme.textSecondary),
                  ),
              ],
            )
          else
            _SwipeToConfirm(
              onConfirmed: _markKitCollected,
              busy: _markingKit,
              label: 'Swipe right to mark kit collected',
            ),
        ],
      ),
    );
  }

  Widget _infoRow(String label, String value, {bool accentSuccess = false}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 110,
            child: Text(label,
                style: const TextStyle(
                    fontSize: 13,
                    color: AppTheme.textSecondary,
                    fontWeight: FontWeight.w500)),
          ),
          Expanded(
            child: Text(
              value,
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: accentSuccess ? AppTheme.success : AppTheme.textPrimary,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// A pill-shaped slide-to-confirm control with a circular drag handle
/// and directional arrows. Dragging the handle to the right calls
/// [onConfirmed] (used to mark a kit as collected).
class _SwipeToConfirm extends StatefulWidget {
  final VoidCallback onConfirmed;
  final bool busy;
  final String label;

  const _SwipeToConfirm({
    required this.onConfirmed,
    required this.busy,
    required this.label,
  });

  @override
  State<_SwipeToConfirm> createState() => _SwipeToConfirmState();
}

class _SwipeToConfirmState extends State<_SwipeToConfirm> {
  static const double _thumbSize = 46;
  double _dragX = 0;
  double _maxDrag = 0;
  bool _dragging = false;
  bool _busy = false;

  void _onPanUpdate(DragUpdateDetails details, double trackWidth) {
    if (_busy) return;
    _maxDrag = trackWidth - _thumbSize - 8;
    if (_maxDrag <= 0) return;
    setState(() {
      _dragging = true;
      _dragX = (_dragX + details.delta.dx).clamp(0.0, _maxDrag);
    });
  }

  void _onPanEnd(DragEndDetails details) {
    if (_busy) return;
    final threshold = _maxDrag * 0.8;
    setState(() => _dragging = false);
    if (_dragX >= threshold) {
      setState(() {
        _busy = true;
        _dragX = _maxDrag;
      });
      widget.onConfirmed();
    } else {
      setState(() => _dragX = 0);
    }
  }

  @override
  Widget build(BuildContext context) {
    final fraction = _maxDrag <= 0 ? 0.0 : (_dragX / _maxDrag).clamp(0.0, 1.0);

    return LayoutBuilder(
      builder: (context, constraints) {
        final trackWidth = constraints.maxWidth;
        if (_maxDrag == 0) _maxDrag = trackWidth - _thumbSize - 8;

        if (widget.busy) {
          return Container(
            height: 52,
            decoration: BoxDecoration(
              color: AppTheme.success,
              borderRadius: BorderRadius.circular(26),
            ),
            child: const Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                SkeletonBox(
                  width: 18,
                  height: 18,
                  borderRadius: 6,
                  baseColor: Colors.white24,
                  shineColor: Colors.white,
                ),
                SizedBox(width: 10),
                Text(
                  'Marking kit collected...',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: Colors.white,
                  ),
                ),
              ],
            ),
          );
        }

        return GestureDetector(
          onHorizontalDragStart: (_) => setState(() => _dragging = true),
          onHorizontalDragUpdate: (d) => _onPanUpdate(d, trackWidth),
          onHorizontalDragEnd: _onPanEnd,
          onHorizontalDragCancel: () => setState(() {
            _dragging = false;
            _dragX = 0;
          }),
          child: Container(
            height: 52,
            decoration: BoxDecoration(
                color: AppTheme.greenSoft,
                borderRadius: BorderRadius.circular(26),
                border: Border.all(color: AppTheme.success),
              ),
              child: Stack(
                children: [
                  // Directional arrow hint (fades as the handle moves).
                  Positioned.fill(
                    child: AnimatedOpacity(
                      duration: const Duration(milliseconds: 150),
                      opacity: 1 - fraction,
                      child: Center(
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 4, vertical: 2),
                              decoration: BoxDecoration(
                                color: AppTheme.greenSoft,
                                borderRadius: BorderRadius.circular(14),
                              ),
                              child: const Icon(
                                LucideIcons.chevronRight,
                                size: 20,
                                color: AppTheme.success,
                              ),
                            ),
                            const SizedBox(width: 6),
                            const Icon(
                              LucideIcons.chevronRight,
                              size: 24,
                              color: AppTheme.success,
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                  // Drag handle.
                  AnimatedPositioned(
                    duration:
                        _dragging ? Duration.zero : const Duration(milliseconds: 220),
                    curve: Curves.easeOut,
                    left: 4 + _dragX,
                    top: 3,
                    child: Container(
                      width: _thumbSize,
                      height: _thumbSize,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: AppTheme.success,
                        boxShadow: const [
                          BoxShadow(
                            color: Color(0x33159A68),
                            blurRadius: 10,
                            offset: Offset(0, 3),
                          ),
                        ],
                      ),
                      child: const Icon(
                        LucideIcons.chevronRight,
                        size: 26,
                        color: Colors.white,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          );
        },
    );
  }
}