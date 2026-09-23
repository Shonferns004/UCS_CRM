import '../../core/lucide_icons.dart';
import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_skeleton.dart';
import '../../core/widgets/app_snackbar.dart';
import '../../services/api_service.dart';

class BeneficiaryDetailPage extends StatefulWidget {
  final Map<String, dynamic> beneficiary;
  const BeneficiaryDetailPage({super.key, required this.beneficiary});

  @override
  State<BeneficiaryDetailPage> createState() => _BeneficiaryDetailPageState();
}

class _BeneficiaryDetailPageState extends State<BeneficiaryDetailPage> {
  late Map<String, dynamic> _b;
  bool _markingKit = false;
  bool _decisionAccepted = false;
  bool _rejected = false;
  bool _justGiven = false;

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

  Future<void> _markKitDonated() async {
    setState(() => _markingKit = true);
    try {
      final result = await ApiService.post(
        '/beneficiaries/${_b['id']}/kit-given',
        body: _withinThreeMonths ? {'override': true} : null,
      );
      if (!mounted) return;
      setState(() {
        final res = result['beneficiary'];
        if (res is Map) {
          _b = Map<String, dynamic>.from(res);
        } else {
          _b['kit_given'] = true;
          _b['kit_given_at'] = DateTime.now().toIso8601String();
        }
        _justGiven = true;
        _decisionAccepted = true;
      });
      showAppSnackbar(context, 'Kit marked as given', success: true);
    } catch (e) {
      if (!mounted) return;
      showAppSnackbar(context, e.toString(), error: true);
    } finally {
      if (mounted) setState(() => _markingKit = false);
    }
  }

  // ---- 3-month eligibility helpers ---------------------------------------

  bool get _kitGiven => _b['kit_given'] == true;

  String get _kitGivenAt => _fmt(_b['kit_given_at']);

  // Adds `months` calendar months to [d], clamping the day to the target
  // month's length (e.g. Jan 31 + 1 month -> Feb 28).
  DateTime _addMonths(DateTime d, int months) {
    final m = d.month + months;
    final y = d.year + (m - 1) ~/ 12;
    final mm = (m - 1) % 12 + 1;
    final day = d.day.clamp(1, DateTime(y, mm + 1, 0).day);
    return DateTime(y, mm, day);
  }

  bool _isWithinMonths(DateTime from, int months) {
    final now = DateTime.now();
    return from.isBefore(now) && now.isBefore(_addMonths(from, months));
  }

  bool get _withinThreeMonths {
    final raw = _b['kit_given_at'];
    final at = raw == null ? null : DateTime.tryParse(raw.toString());
    return _kitGiven && at != null && _isWithinMonths(at, 3);
  }

  // ---- helpers ------------------------------------------------------------

  String _fmt(dynamic v) {
    if (v == null) return '';
    final s = v.toString();
    if (s.length >= 10 && s[4] == '-' && s[7] == '-') return s.substring(0, 10);
    return s;
  }

  @override
  Widget build(BuildContext context) {
    final name = _b['full_name'] ?? '';
    final code = _b['beneficiary_code'] ?? '';
    final status = _b['status'] ?? 'ACTIVE';

    return Scaffold(
      appBar: AppBar(
        title: const Text('Beneficiary',
            style: TextStyle(fontSize: 17, fontWeight: FontWeight.w600)),
      ),
      body: Column(
        children: [
          Expanded(child: _buildDetails(name, code, status)),
          _buildBottomControls(),
        ],
      ),
    );
  }

  // ---- details -----------------------------------------------------------

  Widget _buildDetails(String name, String code, String status) {
    final dynamic ngos = _b['ngos'];
    final ngo = (ngos is Map) ? ngos['name'] : null;

    return ListView(
      padding: const EdgeInsets.fromLTRB(24, 8, 24, 20),
      children: [
        // Header
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(8),
            boxShadow: AppTheme.cardShadow,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 60,
                    height: 60,
                    decoration: const BoxDecoration(
                      color: AppTheme.blueSoft,
                      shape: BoxShape.circle,
                    ),
                    alignment: Alignment.center,
                    child: Text(
                      name.isNotEmpty ? name[0].toUpperCase() : '?',
                      style: const TextStyle(
                          fontSize: 24,
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
              if (status.isNotEmpty)
                _infoRow('Status', status, accentSuccess: status == 'ACTIVE'),
              if (ngo != null && ngo.toString().isNotEmpty)
                _infoRow('NGO', ngo.toString()),
            ],
          ),
        ),

        // Personal & Contact
        _card('Personal & Contact', [
          if (_fmt(_b['gender']).isNotEmpty) _infoRow('Gender', _fmt(_b['gender'])),
          if (_fmt(_b['date_of_birth']).isNotEmpty)
            _infoRow('Date of Birth', _fmt(_b['date_of_birth'])),
          if (_fmt(_b['occupation']).isNotEmpty)
            _infoRow('Occupation', _fmt(_b['occupation'])),
          if (_fmt(_b['father_name']).isNotEmpty)
            _infoRow('Father', _fmt(_b['father_name'])),
          if (_fmt(_b['mother_name']).isNotEmpty)
            _infoRow('Mother', _fmt(_b['mother_name'])),
          if (_fmt(_b['guardian_name']).isNotEmpty)
            _infoRow('Guardian', _fmt(_b['guardian_name'])),
          if (_fmt(_b['guardian_occupation']).isNotEmpty)
            _infoRow('Guardian Occupation', _fmt(_b['guardian_occupation'])),
          if (_b['total_family_members'] != null)
            _infoRow('Family Members', '${_b['total_family_members']}'),
        ]),

        _card('Contact Details', [
          if (_fmt(_b['mobile']).isNotEmpty) _infoRow('Mobile', _fmt(_b['mobile'])),
          if (_fmt(_b['alternate_mobile']).isNotEmpty)
            _infoRow('Alternate Mobile', _fmt(_b['alternate_mobile'])),
          if (_fmt(_b['email']).isNotEmpty) _infoRow('Email', _fmt(_b['email'])),
        ]),

        _card('Address', [
          if (_fmt(_b['address_line_1']).isNotEmpty)
            _infoRow('Address Line 1', _fmt(_b['address_line_1'])),
          if (_fmt(_b['address_line_2']).isNotEmpty)
            _infoRow('Address Line 2', _fmt(_b['address_line_2'])),
          if (_fmt(_b['area']).isNotEmpty) _infoRow('Area', _fmt(_b['area'])),
          if (_fmt(_b['city']).isNotEmpty) _infoRow('City', _fmt(_b['city'])),
          if (_fmt(_b['district']).isNotEmpty)
            _infoRow('District', _fmt(_b['district'])),
          if (_fmt(_b['state']).isNotEmpty) _infoRow('State', _fmt(_b['state'])),
          if (_fmt(_b['pincode']).isNotEmpty)
            _infoRow('Pincode', _fmt(_b['pincode'])),
        ]),

        _card('Income & Entitlements', [
          if (_b['monthly_family_income'] != null)
            _infoRow('Monthly Income', '₹ ${_b['monthly_family_income']}'),
          if (_fmt(_b['income_category']).isNotEmpty)
            _infoRow('Income Category', _fmt(_b['income_category'])),
          if (_b['bpl_available'] != null)
            _infoRow('BPL Card', _b['bpl_available'] == true ? 'Yes' : 'No'),
          if (_b['ration_card_available'] != null)
            _infoRow('Ration Card',
                _b['ration_card_available'] == true ? 'Yes' : 'No'),
          if (_fmt(_b['registration_date']).isNotEmpty)
            _infoRow('Registered On', _fmt(_b['registration_date'])),
        ]),

        _card('Categories', _buildCategories()),

        if ((_b['disabilities'] as List?)?.isNotEmpty == true)
          _card('Disabilities', [
            ...( _b['disabilities'] as List).map<Widget>((d) {
              final pct = d['disability_percentage'] != null
                  ? ' (${d['disability_percentage']}%)'
                  : '';
              return _infoRow('Disability',
                  '${d['disability_type'] ?? ''}$pct');
            }),
          ]),

        if ((_b['family'] as List?)?.isNotEmpty == true)
          _card('Family Members', [
            ...((_b['family'] as List).map<Widget>((f) {
              return _infoRow(
                f['relationship'] ?? 'Member',
                f['name'] ?? '',
              );
            })),
          ]),

        if (_b['education'] is Map)
          _card('Education', [
            if (_fmt((_b['education'] as Map)['education_level']).isNotEmpty)
              _infoRow('Education Level',
                  _fmt((_b['education'] as Map)['education_level'])),
            if ((_b['education'] as Map)['currently_studying'] == true)
              _infoRow('Currently Studying', 'Yes'),
            if (_fmt((_b['education'] as Map)['school_or_institute']).isNotEmpty)
              _infoRow('Institute',
                  _fmt((_b['education'] as Map)['school_or_institute'])),
            if (_fmt((_b['education'] as Map)['grade']).isNotEmpty)
              _infoRow('Grade', _fmt((_b['education'] as Map)['grade'])),
            if (_fmt((_b['education'] as Map)['course']).isNotEmpty)
              _infoRow('Course', _fmt((_b['education'] as Map)['course'])),
          ]),

        if (_b['employment'] is Map)
          _card('Employment', [
            if (_fmt((_b['employment'] as Map)['employment_status']).isNotEmpty)
              _infoRow('Employment Status',
                  _fmt((_b['employment'] as Map)['employment_status'])),
            if (_fmt((_b['employment'] as Map)['occupation']).isNotEmpty)
              _infoRow('Occupation',
                  _fmt((_b['employment'] as Map)['occupation'])),
            if (_fmt((_b['employment'] as Map)['employer']).isNotEmpty)
              _infoRow('Employer', _fmt((_b['employment'] as Map)['employer'])),
            if ((_b['employment'] as Map)['monthly_income'] != null)
              _infoRow('Monthly Income',
                  '₹ ${(_b['employment'] as Map)['monthly_income']}'),
          ]),

        // Kit given status
        _card('Kit Given', [
          if (_kitGiven)
            _infoRow('Status', 'Given',
                accentSuccess: true)
          else
            _infoRow('Status', 'Pending'),
          if (_kitGivenAt.isNotEmpty)
            _infoRow('Last Given On', _kitGivenAt),
          if (_fmt(_b['kit_given_by']).isNotEmpty)
            _infoRow('Given By', _fmt(_b['kit_given_by'])),
        ]),

        // Assistance history
        if ((_b['assistance'] as List?)?.isNotEmpty == true)
          _card('Support History', [
            ...(() {
              final list = _b['assistance'] as List;
              return [
                for (var i = 0; i < list.length; i++) ...[
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 6),
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
                          _fmt(list[i]['provided_date']),
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
          ]),

        const SizedBox(height: 8),
      ],
    );
  }

  Widget _card(String title, List<Widget> children) {
    if (children.isEmpty) return const SizedBox.shrink();
    return Container(
      margin: const EdgeInsets.only(top: 16),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(8),
        boxShadow: AppTheme.cardShadow,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
                fontSize: 16, fontWeight: FontWeight.w700,
                color: AppTheme.textPrimary),
          ),
          const SizedBox(height: 16),
          ...children,
        ],
      ),
    );
  }

  List<Widget> _buildCategories() {
    final categories = (_b['categories'] as List?) ?? [];
    if (categories.isEmpty) return [];
    return [
      Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          for (final c in categories)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: AppTheme.blueSoft,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                '${c is Map ? (c['name'] ?? '') : c}',
                style: const TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.secondary),
              ),
            ),
        ],
      ),
    ];
  }

  Widget _infoRow(String label, String value, {bool accentSuccess = false}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 130,
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

  // ---- bottom swipe controls ---------------------------------------------

  Widget _buildBottomControls() {
    final within = _withinThreeMonths;
    final showDecision = within && !_decisionAccepted && !_rejected && !_justGiven;
    final showDonate =
        !_rejected && !_justGiven && (!within || _decisionAccepted);

    return SafeArea(
      top: false,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 16),
        decoration: const BoxDecoration(
          color: Colors.white,
          boxShadow: [
            BoxShadow(color: Color(0x14111827), blurRadius: 16, offset: Offset(0, -4)),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (_justGiven)
              _statusBanner(
                LucideIcons.checkCircle,
                'Kit given to this beneficiary today',
                AppTheme.success,
                AppTheme.greenSoft,
              )
            else if (_rejected)
              _statusBanner(
                LucideIcons.xCircle,
                'Rejected — no kit given',
                AppTheme.error,
                AppTheme.errorSoft,
              )
            else if (within && !_decisionAccepted)
              _statusBanner(
                LucideIcons.alertCircle,
                'Kit already given on $_kitGivenAt. Would you still want to give this beneficiary the kit?',
                AppTheme.warning,
                const Color(0xFFFDF3E3),
              ),

            if (_justGiven || _rejected)
              const SizedBox.shrink()
            else if (showDecision) ...[
              const SizedBox(height: 10),
              const Text(
                'Swipe left to reject  •  swipe right to give',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 12.5, color: AppTheme.textSecondary),
              ),
              const SizedBox(height: 10),
              _DecisionSwipe(
                onReject: _reject,
                onAccept: _accept,
              ),
            ] else if (showDonate) ...[
              const SizedBox(height: 6),
              _DonateSwipe(
                onConfirm: _markKitDonated,
                busy: _markingKit,
              ),
            ],
          ],
        ),
      ),
    );
  }

  void _reject() {
    if (_markingKit) return;
    setState(() => _rejected = true);
  }

  void _accept() {
    if (_markingKit) return;
    setState(() => _decisionAccepted = true);
  }

  Widget _statusBanner(
      IconData icon, String message, Color color, Color bg) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withValues(alpha: 0.35)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: color),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              message,
              style: TextStyle(
                fontSize: 13,
                height: 1.35,
                fontWeight: FontWeight.w600,
                color: color == AppTheme.warning ? const Color(0xFF7A4A00) : color,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Two-way decision slider. Drag the handle left to REJECT and right to
/// ACCEPT. Falls back to center when the drag does not reach a threshold.
class _DecisionSwipe extends StatefulWidget {
  final VoidCallback onReject;
  final VoidCallback onAccept;

  const _DecisionSwipe({required this.onReject, required this.onAccept});

  @override
  State<_DecisionSwipe> createState() => _DecisionSwipeState();
}

class _DecisionSwipeState extends State<_DecisionSwipe> {
  static const double _height = 64;
  static const double _thumb = 54;
  double _dragX = 0;
  double _trackWidth = 0;
  bool _dragging = false;

  double get _maxDrag =>
      _trackWidth <= 0 ? 0 : ((_trackWidth - _thumb) / 2) - 6;

  void _onUpdate(DragUpdateDetails d) {
    final max = _maxDrag;
    if (max <= 0) return;
    setState(() {
      _dragging = true;
      _dragX = (_dragX + d.delta.dx).clamp(-max, max);
    });
  }

  void _onEnd(DragEndDetails d) {
    final max = _maxDrag;
    setState(() => _dragging = false);
    if (_dragX <= -max * 0.5) {
      widget.onReject();
    } else if (_dragX >= max * 0.5) {
      widget.onAccept();
    } else {
      setState(() => _dragX = 0);
    }
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        _trackWidth = constraints.maxWidth;
        final max = _maxDrag;

        return GestureDetector(
          onHorizontalDragStart: (_) => setState(() => _dragging = true),
          onHorizontalDragUpdate: _onUpdate,
          onHorizontalDragEnd: _onEnd,
          onHorizontalDragCancel: () => setState(() {
            _dragging = false;
            _dragX = 0;
          }),
          child: Container(
            height: _height,
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: AppTheme.outline),
              boxShadow: AppTheme.cardShadow,
            ),
            child: Stack(
              children: [
                // Reject zone (left) — revealed as the thumb moves right.
                Positioned.fill(
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: Padding(
                      padding: const EdgeInsets.only(left: 14),
                      child: _zoneLabel(
                        AppTheme.greenSoft,
                        AppTheme.success,
                        LucideIcons.check,
                        'Give',
                      ),
                    ),
                  ),
                ),
                // Accept zone (right) — revealed as the thumb moves left.
                Positioned.fill(
                  child: Align(
                    alignment: Alignment.centerRight,
                    child: Padding(
                      padding: const EdgeInsets.only(right: 14),
                      child: _zoneLabel(
                        AppTheme.errorSoft,
                        AppTheme.error,
                        LucideIcons.x,
                        'Reject',
                      ),
                    ),
                  ),
                ),
                // Central instruction (fades as the handle moves).
                Positioned.fill(
                  child: AnimatedOpacity(
                    duration: const Duration(milliseconds: 120),
                    opacity: (max <= 0 ? 0.0 : (_dragX / max).abs().clamp(0.0, 1.0)) < 0.15 ? 1 : 0,
                    child: const Center(
                      child: Text(
                        'Swipe to decide',
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: AppTheme.textSecondary,
                        ),
                      ),
                    ),
                  ),
                ),
                // Handle.
                AnimatedPositioned(
                  duration: _dragging
                      ? Duration.zero
                      : const Duration(milliseconds: 220),
                  curve: Curves.easeOut,
                  left: (_trackWidth - _thumb) / 2 + _dragX,
                  top: (_height - _thumb) / 2,
                  child: Container(
                    width: _thumb,
                    height: _thumb,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: AppTheme.secondary,
                      boxShadow: const [
                        BoxShadow(
                          color: Color(0x332563EB),
                          blurRadius: 10,
                          offset: Offset(0, 3),
                        ),
                      ],
                    ),
                    child: const Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(LucideIcons.arrowLeft, size: 14, color: Colors.white),
                        SizedBox(width: 4),
                        Icon(LucideIcons.arrowRight, size: 14, color: Colors.white),
                      ],
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

  Widget _zoneLabel(Color bg, Color fg, IconData icon, String text) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: fg),
          const SizedBox(width: 4),
          Text(
            text,
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: fg,
            ),
          ),
        ],
      ),
    );
  }
}

/// Single swipe bar used to actually mark the kit as donated.
class _DonateSwipe extends StatefulWidget {
  final VoidCallback onConfirm;
  final bool busy;

  const _DonateSwipe({required this.onConfirm, required this.busy});

  @override
  State<_DonateSwipe> createState() => _DonateSwipeState();
}

class _DonateSwipeState extends State<_DonateSwipe> {
  static const double _height = 64;
  static const double _thumb = 54;
  double _dragX = 0;
  double _maxDrag = 0;
  bool _dragging = false;

  void _onUpdate(DragUpdateDetails d, double trackWidth) {
    if (widget.busy) return;
    _maxDrag = trackWidth - _thumb - 8;
    if (_maxDrag <= 0) return;
    setState(() {
      _dragging = true;
      _dragX = (_dragX + d.delta.dx).clamp(0.0, _maxDrag);
    });
  }

  void _onEnd(DragEndDetails d) {
    if (widget.busy) return;
    final threshold = _maxDrag * 0.8;
    setState(() => _dragging = false);
    if (_dragX >= threshold) {
      widget.onConfirm();
    } else {
      setState(() => _dragX = 0);
    }
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final trackWidth = constraints.maxWidth;

        if (widget.busy) {
          return Container(
            height: _height,
            decoration: BoxDecoration(
              color: AppTheme.success,
              borderRadius: BorderRadius.circular(10),
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
                  'Marking kit as donated...',
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

        final fraction =
            _maxDrag <= 0 ? 0.0 : (_dragX / _maxDrag).clamp(0.0, 1.0);

        return GestureDetector(
          onHorizontalDragStart: (_) => setState(() => _dragging = true),
          onHorizontalDragUpdate: (d) => _onUpdate(d, trackWidth),
          onHorizontalDragEnd: _onEnd,
          onHorizontalDragCancel: () => setState(() {
            _dragging = false;
            _dragX = 0;
          }),
          child: Container(
            height: _height,
            decoration: BoxDecoration(
              color: AppTheme.greenSoft,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: AppTheme.success),
            ),
            child: Stack(
              children: [
                Positioned.fill(
                  child: AnimatedOpacity(
                    duration: const Duration(milliseconds: 150),
                    opacity: 1 - fraction,
                    child: const Center(
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(LucideIcons.arrowRight,
                              size: 18, color: AppTheme.success),
                          SizedBox(width: 6),
                          Text(
                            'Swipe right to mark as donated',
                            style: TextStyle(
                              fontSize: 13.5,
                              fontWeight: FontWeight.w600,
                              color: AppTheme.success,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                AnimatedPositioned(
                  duration: _dragging
                      ? Duration.zero
                      : const Duration(milliseconds: 220),
                  curve: Curves.easeOut,
                  left: 4 + _dragX,
                  top: (_height - _thumb) / 2,
                  child: Container(
                    width: _thumb,
                    height: _thumb,
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
                      LucideIcons.arrowRight,
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