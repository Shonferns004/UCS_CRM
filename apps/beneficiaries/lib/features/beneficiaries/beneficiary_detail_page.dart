import 'package:flutter/material.dart';

import '../../core/lucide_icons.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/app_colors.dart';
import '../../core/widgets/app_snackbar.dart';
import '../../core/widgets/swipe_action_control.dart';
import '../../services/api_service.dart';

/// Spec-exact colors (JOD Beneficiary Detail Screen) not already in AppColors.
const Color _kAvatarBg = Color(0xFFEEF4FF);
const Color _kSoftGreen = Color(0xFFECF9F3);
const Color _kConnector = Color(0xFFDCEFE7);
const Color _kHistTs = Color(0xFF8A93A3);
const Color _kShowMoreBg = Color(0xFFF4F7FC);
const Color _kWarnBg = Color(0xFFFFF8EA);
const Color _kWarnBorder = Color(0xFFF4D9A5);
const Color _kWarnIcon = Color(0xFFC47A16);
const Color _kWarnText = Color(0xFF80500F);
const Color _kInstruction = Color(0xFF7C8798);
const Color _kMutedRed = Color(0xFFE96868);
const Color _kRejectSoft = Color(0xFFFFF1F1);

class BeneficiaryDetailPage extends StatefulWidget {
  final Map<String, dynamic> beneficiary;

  const BeneficiaryDetailPage({super.key, required this.beneficiary});

  @override
  State<BeneficiaryDetailPage> createState() => _BeneficiaryDetailPageState();
}

class _BeneficiaryDetailPageState extends State<BeneficiaryDetailPage> {
  static const int _initialHistoryRows = 3;

  late Map<String, dynamic> _b;
  bool _markingKit = false;
  bool _justGiven = false;
  bool _rejected = false;
  bool _historyExpanded = false;
  List<Map<String, dynamic>> _kitHistory = [];

  @override
  void initState() {
    super.initState();
    _b = widget.beneficiary;
    if (_b['id'] != null) _refresh();
  }

  Future<void> _refresh() async {
    try {
      final result = await ApiService.get('/beneficiaries/${_b['id']}');
      if (mounted) setState(() => _b = result);
    } catch (_) {}
    try {
      final audit =
          await ApiService.getList('/beneficiaries/${_b['id']}/audit');
      if (!mounted) return;
      final logs = audit
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .where((e) => e['action'] == 'KIT_GIVEN')
          .toList();
      setState(() => _kitHistory = logs);
    } catch (_) {}
  }

  // ---- kit eligibility ----------------------------------------------------

  // Tolerant check: `kit_given` may be a boolean, a 'true' string, or absent
  // on some lookup paths (QR/mobile). A non-empty `kit_given_at` also counts.
  bool get _kitGiven {
    final v = _b['kit_given'];
    if (v == true) return true;
    if (v is num && v == 1) return true;
    if (v is String) {
      final s = v.trim().toLowerCase();
      if (s == 'true' || s == '1' || s == 't' || s == 'yes') return true;
    }
    final at = _b['kit_given_at'];
    return at != null && at.toString().trim().isNotEmpty;
  }

  String get _kitGivenAt => _fmt(_b['kit_given_at']);

  bool get _active {
    final s = _b['status'];
    return s == null || s.toString().trim().toUpperCase() == 'ACTIVE';
  }

  // ---- actions ------------------------------------------------------------

  Future<void> _onGive() async {
    if (_markingKit) return;
    if (_kitGiven) {
      final confirm = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Give kit anyway?'),
          content: Text(
            'Kit already given on $_kitGivenAt. Would you still want to give '
            'this beneficiary the kit?',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.of(context).pop(true),
              child: const Text('Give'),
            ),
          ],
        ),
      );
      if (confirm != true || !mounted) return;
    }
    await _markKitDonated();
  }

  void _reject() {
    if (_markingKit) return;
    setState(() => _rejected = true);
  }

  Future<void> _markKitDonated() async {
    if (_markingKit) return;
    setState(() => _markingKit = true);
    try {
      final result = await ApiService.post(
        '/beneficiaries/${_b['id']}/kit-given',
        // Reaching this swipe already means the operator chose to give again,
        // so always pass the override when the kit was given before. This
        // avoids the 3-month guard erroring out with a toast.
        body: _kitGiven ? {'override': true} : null,
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
        _kitHistory = [
          {
            'action': 'KIT_GIVEN',
            'performed_at': DateTime.now().toIso8601String(),
            'performed_by': '',
          },
          ..._kitHistory,
        ];
      });
      showAppSnackbar(context, 'Kit marked as given', success: true);
    } catch (e) {
      if (!mounted) return;
      // The 3-month guard message is a deliberate block, not an error we
      // should surface as a toast.
      if (e.toString().contains('already given')) {
        setState(() => _markingKit = false);
        return;
      }
      showAppSnackbar(context, e.toString(), error: true);
    } finally {
      if (mounted) setState(() => _markingKit = false);
    }
  }

  // ---- helpers ------------------------------------------------------------

  String _fmt(dynamic v) {
    if (v == null) return '';
    final s = v.toString();
    if (s.length >= 10 && s[4] == '-' && s[7] == '-') return s.substring(0, 10);
    return s;
  }

  String _fmtDateTime(dynamic v) {
    if (v == null) return '';
    var s = v.toString().trim().replaceAll('T', ' ').replaceAll('Z', '');
    if (s.length >= 16) return s.substring(0, 16);
    return s;
  }

  // ---- layout -------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.background,
      body: SafeArea(
        child: Column(
          children: [
            _buildHeader(),
            Expanded(child: _buildScrollBody()),
            _buildBottomArea(),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return SizedBox(
      height: 56,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 24),
        child: Row(
          children: [
            IconButton(
              onPressed: () => Navigator.of(context).maybePop(),
              padding: EdgeInsets.zero,
              constraints:
                  const BoxConstraints(minWidth: 44, minHeight: 44),
              icon: const Icon(LucideIcons.arrowLeft, size: 24),
              color: AppColors.textPrimary,
            ),
            const SizedBox(width: 8),
            const Text(
              'Beneficiary',
              style: TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.w600,
                color: AppColors.textPrimary,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildScrollBody() {
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(24, 12, 24, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _buildProfileCard(),
          const SizedBox(height: 24),
          _buildHistoryCard(),
          if (_kitGiven && !_justGiven && !_rejected) ...[
            const SizedBox(height: 24),
            _buildWarning(),
          ],
        ],
      ),
    );
  }

  // ---- profile card -------------------------------------------------------

  Widget _buildProfileCard() {
    final name = _b['full_name'] ?? '';
    final code = _b['beneficiary_code'] ?? '';
    final date = _fmt(_b['registration_date']);

    return _card(
      Padding(
        padding: const EdgeInsets.all(20),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _avatar(name),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w600,
                      color: AppColors.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    code,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 14,
                      color: AppColors.textSecondary,
                    ),
                  ),
                ],
              ),
            ),
            if (date.isNotEmpty) ...[
              const SizedBox(width: 12),
              Flexible(child: _registrationDate(date)),
            ],
          ],
        ),
      ),
    );
  }

  Widget _avatar(String name) {
    return SizedBox(
      width: 64,
      height: 64,
      child: Stack(
        children: [
          Container(
            width: 64,
            height: 64,
            decoration: const BoxDecoration(
              color: _kAvatarBg,
              shape: BoxShape.circle,
            ),
            alignment: Alignment.center,
            child: Text(
              name.isNotEmpty ? name[0].toUpperCase() : '?',
              style: const TextStyle(
                fontSize: 32,
                fontWeight: FontWeight.w600,
                color: AppColors.primaryBlue,
              ),
            ),
          ),
          Positioned(
            right: 0,
            bottom: 0,
            child: Container(
              width: 16,
              height: 16,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: _active ? AppColors.successGreen : AppColors.error,
                border: Border.all(color: Colors.white, width: 3),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _registrationDate(String date) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        const Icon(LucideIcons.calendar, size: 15, color: AppColors.textSecondary),
        const SizedBox(width: 4),
        Flexible(
          child: Text(
            date,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 13, color: AppColors.textSecondary),
          ),
        ),
      ],
    );
  }

  // ---- history card -------------------------------------------------------

  Widget _buildHistoryCard() {
    final n = _kitHistory.length;
    final visible = _historyExpanded
        ? _kitHistory
        : _kitHistory.take(_initialHistoryRows).toList();
    final showToggle = n > _initialHistoryRows;

    return _card(
      Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Expanded(
                  child: Text(
                    'Kit Given History',
                    style: TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w600,
                      color: AppColors.textPrimary,
                    ),
                  ),
                ),
                _countBadge(n),
              ],
            ),
            const SizedBox(height: 16),
            if (n == 0)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 12),
                child: Text(
                  'No kit handed out yet.',
                  style: TextStyle(fontSize: 13.5, color: AppColors.textSecondary),
                ),
              )
            else ...[
              AnimatedSize(
                duration: const Duration(milliseconds: 200),
                curve: Curves.easeOut,
                alignment: Alignment.topCenter,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    for (var i = 0; i < visible.length; i++)
                      _historyRow(visible[i], notLast: i < visible.length - 1),
                  ],
                ),
              ),
              if (showToggle) ...[
                const SizedBox(height: 14),
                _showMoreToggle(),
              ],
            ],
          ],
        ),
      ),
    );
  }

  Widget _countBadge(int n) {
    final label = '$n kit${n == 1 ? '' : 's'} given';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: _kAvatarBg,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(LucideIcons.package, size: 14, color: AppColors.primaryBlue),
          const SizedBox(width: 6),
          Text(
            label,
            style: const TextStyle(
              fontSize: 12.5,
              fontWeight: FontWeight.w600,
              color: AppColors.primaryBlue,
            ),
          ),
        ],
      ),
    );
  }

  Widget _historyRow(Map<String, dynamic> entry, {required bool notLast}) {
    final time = _fmtDateTime(entry['performed_at']);
    return ConstrainedBox(
      constraints: const BoxConstraints(minHeight: 52),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SizedBox(
            width: 32,
            child: Column(
              children: [
                Container(
                  width: 32,
                  height: 32,
                  decoration: const BoxDecoration(
                    color: _kSoftGreen,
                    shape: BoxShape.circle,
                  ),
                  alignment: Alignment.center,
                  child: const Icon(
                    LucideIcons.check,
                    size: 16,
                    color: AppColors.successGreen,
                  ),
                ),
                if (notLast)
                  Expanded(
                    child: Center(
                      child: Container(width: 1, color: _kConnector),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(top: 7),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Expanded(
                    child: Text(
                      'Kit Given',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w500,
                        color: AppColors.textPrimary,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  if (time.isNotEmpty)
                    Flexible(
                      child: Text(
                        time,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 13, color: _kHistTs),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _showMoreToggle() {
    final expanded = _historyExpanded;
    return SizedBox(
      height: 44,
      width: double.infinity,
      child: Material(
        color: _kShowMoreBg,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: () => setState(() => _historyExpanded = !_historyExpanded),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                expanded ? 'Show Less' : 'Show More',
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: AppColors.primaryBlue,
                ),
              ),
              const SizedBox(width: 8),
              Icon(
                expanded ? LucideIcons.chevronUp : LucideIcons.chevronDown,
                size: 16,
                color: AppColors.primaryBlue,
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ---- warning ------------------------------------------------------------

  Widget _buildWarning() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: _kWarnBg,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: _kWarnBorder),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(LucideIcons.alertTriangle, size: 18, color: _kWarnIcon),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              'Kit already given on $_kitGivenAt.\n'
              'Would you still want to give this beneficiary the kit?',
              style: const TextStyle(fontSize: 13, height: 1.4, color: _kWarnText),
            ),
          ),
        ],
      ),
    );
  }

  // ---- bottom area --------------------------------------------------------

  Widget _buildBottomArea() {
    if (_justGiven || _rejected) {
      return Padding(
        padding: const EdgeInsets.fromLTRB(24, 14, 24, 24),
        child: _resultBanner(),
      );
    }
    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 14, 24, 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text(
            'Swipe left to reject  •  Swipe right to give',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 14, color: _kInstruction),
          ),
          const SizedBox(height: 12),
          SwipeActionControl(
            onReject: _reject,
            onGive: _onGive,
            enabled: !_markingKit,
          ),
        ],
      ),
    );
  }

  Widget _resultBanner() {
    final given = _justGiven;
    final color = given ? AppColors.successGreen : _kMutedRed;
    final bg = given ? _kSoftGreen : _kRejectSoft;
    final text =
        given ? 'Kit given to this beneficiary today' : 'Rejected — no kit given';
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Row(
        children: [
          Icon(
            given ? LucideIcons.checkCircle : LucideIcons.xCircle,
            size: 18,
            color: color,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              text,
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: color,
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ---- shared card --------------------------------------------------------

  Widget _card(Widget child) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(22),
        boxShadow: AppTheme.cardShadow,
      ),
      child: child,
    );
  }
}