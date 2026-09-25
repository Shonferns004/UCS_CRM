import 'package:flutter/material.dart';
import '../../../core/lucide_icons.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/empty_state.dart';
import '../../../core/widgets/section_header.dart';
import '../../../services/api_service.dart';
import '../../beneficiaries/beneficiary_detail_page.dart';

class KitGivenUsersCard extends StatefulWidget {
  const KitGivenUsersCard({super.key});

  @override
  State<KitGivenUsersCard> createState() => KitGivenUsersCardState();
}

class KitGivenUsersCardState extends State<KitGivenUsersCard> {
  List<Map<String, dynamic>> _users = [];
  bool _loading = true;
  bool _showAll = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadUsers();
  }

  Future<void> refresh() => _loadUsers();

  Future<void> _loadUsers() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final result = await ApiService.get('/beneficiaries', queryParams: {
        'kit_given': 'true',
        'pageSize': '100',
      });
      // Guard the shape defensively: the server may return a bare list or a
      // {data: [...]} body. Mapping each element (never casting the raw list)
      // avoids the "List<dynamic> is not a subtype of List<Map<String, dynamic>>"
      // runtime crash.
      final rawData = result['data'] ?? result['beneficiaries'] ?? const [];
      final data = rawData is List ? rawData : const <dynamic>[];
      setState(() {
        _users = data
            .map((e) => Map<String, dynamic>.from(e))
            .toList();
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final showingAll = _showAll || _users.length <= 8;
    final visible = showingAll ? _users : _users.take(8).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionHeader(
          title: 'Users Who Were Given the Kit',
          subtitle: 'Recently given beneficiaries',
          action: _users.isEmpty
              ? null
              : TextButton(
                  onPressed: () => setState(() => _showAll = !_showAll),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(showingAll ? 'Show Less' : 'View All'),
                      const SizedBox(width: 2),
                      const Icon(LucideIcons.arrowRight, size: 16),
                    ],
                  ),
                ),
        ),
        const SizedBox(height: 16),
        if (_loading)
          ...List.generate(
            3,
            (i) => Container(
              height: 72,
              margin: const EdgeInsets.only(bottom: 8),
              decoration: BoxDecoration(
                color: AppColors.skeleton,
                borderRadius: BorderRadius.circular(16),
              ),
            ),
          )
        else if (_error != null)
          InkWell(
            onTap: _loadUsers,
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
                  const Icon(LucideIcons.alertCircle,
                      color: AppColors.error, size: 18),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      _error!,
                      style: const TextStyle(
                          fontSize: 12.5, color: AppColors.textSecondary),
                    ),
                  ),
                  TextButton(
                    onPressed: _loadUsers,
                    child: const Text('Retry',
                        style: TextStyle(fontSize: 12.5)),
                  ),
                ],
              ),
            ),
          )
        else if (_users.isEmpty)
          const EmptyState(
            icon: LucideIcons.package,
            title: 'No kits given yet',
            message: 'Once a kit is given to a beneficiary, they will appear here.',
            dashed: true,
          )
        else
          ...visible.map((u) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: _kitGivenCard(u),
              )),
      ],
    );
  }

  Widget _kitGivenCard(Map<String, dynamic> u) {
    final name = u['full_name'] ?? u['first_name'] ?? 'Unknown';
    final code = u['beneficiary_code'] ?? '';
    final city = u['city'] ?? '';
    final givenAt = u['kit_given_at']?.toString();
    final subtitle = [code, city]
        .where((e) => e != null && e.toString().isNotEmpty)
        .map((e) => e.toString())
        .join(' • ');

    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        onTap: () => Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => BeneficiaryDetailPage(
              beneficiary: u,
              readOnly: true,
            ),
          ),
        ),
        borderRadius: BorderRadius.circular(18),
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),
            boxShadow: AppTheme.cardShadow,
          ),
          child: Row(
            children: [
              Container(
                width: 46,
                height: 46,
                decoration: const BoxDecoration(
                  color: AppColors.successGreenSoft,
                  shape: BoxShape.circle,
                ),
                alignment: Alignment.center,
                child: Text(
                  name.isNotEmpty ? name[0].toUpperCase() : '?',
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                    color: AppColors.successGreen,
                  ),
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 15.5,
                        fontWeight: FontWeight.w600,
                        color: AppColors.textPrimary,
                      ),
                    ),
                    if (subtitle.isNotEmpty) ...[
                      const SizedBox(height: 3),
                      Text(
                        subtitle,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 12,
                          color: AppColors.textSecondary,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                    decoration: BoxDecoration(
                      color: AppColors.successGreenSoft,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Text(
                      'Kit Given',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: AppColors.successGreen,
                      ),
                    ),
                  ),
                  if (givenAt != null && givenAt.length >= 10) ...[
                    const SizedBox(height: 5),
                    Text(
                      givenAt.substring(0, 10),
                      style: const TextStyle(
                        fontSize: 10.5,
                        color: AppColors.textSecondary,
                      ),
                    ),
                  ],
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}