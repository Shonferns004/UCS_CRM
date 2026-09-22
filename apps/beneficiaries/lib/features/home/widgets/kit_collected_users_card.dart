import 'package:flutter/material.dart';
import '../../../core/lucide_icons.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/beneficiary_tile.dart';
import '../../../core/widgets/empty_state.dart';
import '../../../core/widgets/section_header.dart';
import '../../../services/api_service.dart';
import '../../beneficiaries/beneficiary_detail_page.dart';

class KitCollectedUsersCard extends StatefulWidget {
  const KitCollectedUsersCard({super.key});

  @override
  State<KitCollectedUsersCard> createState() => _KitCollectedUsersCardState();
}

class _KitCollectedUsersCardState extends State<KitCollectedUsersCard> {
  List<Map<String, dynamic>> _users = [];
  bool _loading = true;
  bool _showAll = false;

  @override
  void initState() {
    super.initState();
    _loadUsers();
  }

  Future<void> _loadUsers() async {
    setState(() => _loading = true);
    try {
      final result = await ApiService.get('/beneficiaries', queryParams: {
        'kit_collected': 'true',
        'pageSize': '50',
      });
      final data = result['data'] ?? result['beneficiaries'] ?? [];
      setState(() {
        _users = data.map((e) => Map<String, dynamic>.from(e)).toList();
        _loading = false;
      });
    } catch (_) {
      setState(() => _loading = false);
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
          title: 'Users Who Collected the Kit',
          subtitle: 'Recently collected beneficiaries',
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
        else if (_users.isEmpty)
          const EmptyState(
            icon: LucideIcons.package,
            title: 'No kits collected yet',
            message: 'Once beneficiaries collect their kits, they will appear here.',
            dashed: true,
          )
        else
          ...visible.map((u) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: _userTile(u),
              )),
      ],
    );
  }

  Widget _userTile(Map<String, dynamic> u) {
    final name = u['full_name'] ?? u['first_name'] ?? 'Unknown';
    final code = u['beneficiary_code'] ?? '';
    final city = u['city'] ?? '';
    final collectedAt = u['kit_collected_at']?.toString();

    return BeneficiaryTile(
      name: name,
      code: code,
      subtitle: city,
      accent: AppColors.successGreen,
      onTap: () => Navigator.push(
        context,
        MaterialPageRoute(builder: (_) => BeneficiaryDetailPage(beneficiary: u)),
      ),
      trailing: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          const Text(
            'Kit Collected',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: AppColors.successGreen,
            ),
          ),
          if (collectedAt != null && collectedAt.isNotEmpty)
            Text(
              collectedAt.substring(0, 10),
              style: const TextStyle(fontSize: 10, color: AppColors.textSecondary),
            ),
        ],
      ),
    );
  }
}