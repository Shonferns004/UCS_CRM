import 'package:flutter/material.dart';

import '../../../core/lucide_icons.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_text_styles.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/app_skeleton.dart';
import '../../../core/widgets/empty_state.dart';
import '../../../core/widgets/section_header.dart';
import '../../../services/api_service.dart';
import '../../beneficiaries/beneficiary_detail_page.dart';
import '../../beneficiaries/beneficiary_list_page.dart';

/// Kits screen — per-NGO (BSCT / AFLF / MANN) registration counts, total and
/// kit-given cards, today's event name, and the list of beneficiaries who
/// collected kits.
class KitsPage extends StatefulWidget {
  const KitsPage({super.key});

  @override
  State<KitsPage> createState() => KitsPageState();
}

class KitsPageState extends State<KitsPage> {
  List<Map<String, dynamic>> _programs = [];
  List<Map<String, dynamic>> _collectors = [];
  int _totalRegistered = 0;
  int _kitGivenToday = 0;
  String _eventName = '';
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> refresh() => _load();

  Future<void> _load() async {
    if (!mounted) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final data = await ApiService.get('/operator/kits');
      if (!mounted) return;
      final programsRaw = data['programs'];
      setState(() {
        _programs = programsRaw is List
            ? programsRaw.map((e) => Map<String, dynamic>.from(e)).toList()
            : const [];
        final collectorsRaw = data['collectors'];
        _collectors = collectorsRaw is List
            ? collectorsRaw.map((e) => Map<String, dynamic>.from(e)).toList()
            : const [];
        _totalRegistered =
            data['total_registered'] is num ? (data['total_registered'] as num).toInt() : 0;
        _kitGivenToday = data['kit_given_today'] is num
            ? (data['kit_given_today'] as num).toInt()
            : 0;
        _eventName = (data['event_name']?.toString() ?? '');
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Kits', style: AppTextStyles.pageLabel),
        const SizedBox(height: 4),
        Text('Kit distribution overview', style: AppTextStyles.pageTitle),
        const SizedBox(height: 20),
        if (_loading) ...[
          const SkeletonStatRow(cards: 3, height: 78),
          const SizedBox(height: 12),
          const SkeletonStatRow(cards: 2, height: 70, numberWidth: 40),
          const SizedBox(height: 28),
          const SkeletonBox(width: 130, height: 15, borderRadius: 6),
          const SizedBox(height: 8),
          const SkeletonBox(width: 180, height: 12, borderRadius: 6),
          const SizedBox(height: 16),
          const SkeletonCardRows(rows: 3),
        ] else if (_error != null)
          _errorTile()
        else ...[
          _programCards(),
          const SizedBox(height: 12),
          _summaryCards(),
          const SizedBox(height: 28),
          SectionHeader(
            title: 'Kits Collected',
            subtitle: _eventName.isEmpty ? 'No event assigned today' : _eventName,
          ),
          const SizedBox(height: 16),
          if (_collectors.isEmpty)
            const EmptyState(
              icon: LucideIcons.box,
              title: 'No kits given yet',
              message: 'Beneficiaries who collect a kit today will appear here.',
              dashed: true,
            )
          else
            ..._collectors.map((c) => Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: _collectorCard(c),
                )),
        ],
      ],
    );
  }

  // ─── Program cards: BSCT | AFLF | MANN ─────────────────────────────

  Widget _programCards() {
    final b = _byCode('BSCT');
    final a = _byCode('AFLF');
    final m = _byCode('MANN');

    return Row(
      children: [
        Expanded(child: _programCard('BSCT', _count(b), AppColors.statMembersBg, AppColors.statMembersBorder, AppColors.primaryBlue)),
        const SizedBox(width: 10),
        Expanded(child: _programCard('AFLF', _count(a), AppColors.statDonationsBg, AppColors.statDonationsBorder, AppColors.successGreen)),
        const SizedBox(width: 10),
        Expanded(child: _programCard('MANN', _count(m), AppColors.statPinkBg, AppColors.statPinkBorder, AppColors.statPinkText)),
      ],
    );
  }

  Map<String, dynamic>? _byCode(String code) {
    for (final p in _programs) {
      if ((p['code']?.toString() ?? '').toUpperCase() == code) return p;
    }
    return null;
  }

  int _count(Map<String, dynamic>? p) {
    final v = p?['registered'];
    return v is num ? v.toInt() : 0;
  }

  Widget _programCard(String label, int value, Color bg, Color border, Color accent) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 16),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: border),
      ),
      child: Column(
        children: [
          Text(
            '$value',
            style: TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.w700,
              color: accent,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontSize: 12.5,
              fontWeight: FontWeight.w600,
              color: AppColors.textPrimary,
            ),
          ),
        ],
      ),
    );
  }

  // ─── Summary: Total (bsct+aflf+mann) + Kit given ────────────────────

  Widget _summaryCards() {
    return Row(
      children: [
        // Total is the way into the full member list (name + number, searchable).
        Expanded(
          child: InkWell(
            onTap: () => _openBeneficiaryList(),
            borderRadius: BorderRadius.circular(18),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              decoration: BoxDecoration(
                color: AppColors.primaryBlueSoft,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: AppColors.statMembersBorder),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '$_totalRegistered',
                          style: const TextStyle(
                            fontSize: 22,
                            fontWeight: FontWeight.w700,
                            color: AppColors.primaryBlue,
                          ),
                        ),
                        const SizedBox(height: 2),
                        const Text(
                          'Total',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w500,
                            color: AppColors.textSecondary,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const Icon(
                    LucideIcons.chevronRight,
                    size: 18,
                    color: AppColors.primaryBlue,
                  ),
                ],
              ),
            ),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            decoration: BoxDecoration(
              color: AppColors.successGreenSoft,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: AppColors.statDonationsBorder),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '$_kitGivenToday',
                  style: const TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.w700,
                    color: AppColors.successGreen,
                  ),
                ),
                const SizedBox(height: 2),
                const Text(
                  'Kit Given',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w500,
                    color: AppColors.textSecondary,
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Future<void> _openBeneficiaryList() async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => const BeneficiaryListPage(
          title: 'All Beneficiaries',
        ),
      ),
    );
  }

  // ─── Collector list ────────────────────────────────────────────────

  Widget _collectorCard(Map<String, dynamic> c) {
    final name = c['full_name']?.toString() ?? 'Unknown';
    final code = c['beneficiary_code']?.toString() ?? '';
    final event = c['event_name']?.toString() ?? '';
    final at = _fmtDateTime(c['performed_at']);

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(18),
        boxShadow: AppTheme.cardShadow,
      ),
      child: InkWell(
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => BeneficiaryDetailPage(
              beneficiary: {
                'id': c['beneficiary_id'],
                'full_name': c['full_name'],
                'beneficiary_code': c['beneficiary_code'],
                'mobile': c['mobile'],
                'photo': c['photo'],
              },
              readOnly: true,
            ),
          ),
        ),
        borderRadius: BorderRadius.circular(18),
        child: Row(
          children: [
            _avatar(c['photo'], name),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 14.5,
                      fontWeight: FontWeight.w600,
                      color: AppColors.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    code.isEmpty ? 'No code' : code,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppColors.textSecondary,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      const Icon(LucideIcons.calendar, size: 12, color: AppColors.successGreen),
                      const SizedBox(width: 4),
                      Expanded(
                        child: Text(
                          '${event.isEmpty ? 'Kit collected' : event} · $at',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w500,
                            color: AppColors.successGreen,
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const Icon(LucideIcons.chevronRight, size: 18, color: AppColors.textTertiary),
          ],
        ),
      ),
    );
  }

  Widget _avatar(dynamic photo, String name) {
    final url = photo?.toString() ?? '';
    ImageProvider? provider;
    if (url.startsWith('http')) provider = NetworkImage(url);
    return CircleAvatar(
      radius: 22,
      backgroundColor: AppColors.primaryBlueSoft,
      backgroundImage: provider,
      child: provider == null
          ? Text(
              name.isNotEmpty ? name[0].toUpperCase() : '?',
              style: const TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w700,
                color: AppColors.primaryBlue,
              ),
            )
          : null,
    );
  }

  String _fmtDateTime(dynamic v) {
    final dt = DateTime.tryParse(v?.toString() ?? '');
    if (dt == null) return '';
    const mons = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    final local = dt.toLocal();
    final h = local.hour % 12 == 0 ? 12 : local.hour % 12;
    final min = local.minute.toString().padLeft(2, '0');
    final ap = local.hour >= 12 ? 'pm' : 'am';
    return '${local.day} ${mons[local.month - 1]}, $h:$min $ap';
  }

  Widget _errorTile() {
    return InkWell(
      onTap: _load,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.surfaceSoft,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Row(
          children: [
            const Icon(LucideIcons.alertCircle, color: AppColors.error, size: 18),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                _error!,
                style: const TextStyle(fontSize: 12.5, color: AppColors.textSecondary),
              ),
            ),
            TextButton(
              onPressed: _load,
              child: const Text('Retry', style: TextStyle(fontSize: 12.5)),
            ),
          ],
        ),
      ),
    );
  }
}