import 'package:flutter/material.dart';
import '../../../core/theme/app_theme.dart';
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
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text(
              'Users Who Collected the Kit',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
            ),
            Text(
              '${_users.length}',
              style: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: AppTheme.success,
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        if (_loading)
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: AppTheme.outline),
            ),
            child: const Center(
              child: SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            ),
          )
        else if (_users.isEmpty)
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: AppTheme.outline),
            ),
            child: const Center(
              child: Text(
                'No kits collected yet',
                style: TextStyle(color: AppTheme.textSecondary, fontSize: 13),
              ),
            ),
          )
        else
          ..._users.take(8).map((u) => _userTile(u)),
      ],
    );
  }

  Widget _userTile(Map<String, dynamic> u) {
    final name = u['full_name'] ?? u['first_name'] ?? 'Unknown';
    final code = u['beneficiary_code'] ?? '';
    final city = u['city'] ?? '';
    final collectedAt = u['kit_collected_at']?.toString();
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AppTheme.outline),
      ),
      child: InkWell(
        onTap: () => Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => BeneficiaryDetailPage(beneficiary: u),
          ),
        ),
        child: Row(
          children: [
            CircleAvatar(
              radius: 18,
              backgroundColor: AppTheme.success.withAlpha(30),
              child: Text(
                name.isNotEmpty ? name[0].toUpperCase() : '?',
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: AppTheme.success,
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(name, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                  Text(
                    [if (code.isNotEmpty) code, if (city.isNotEmpty) city].join(' • '),
                    style: const TextStyle(fontSize: 11, color: AppTheme.textSecondary),
                  ),
                ],
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                const Text(
                  'Kit Collected',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.success,
                  ),
                ),
                if (collectedAt != null && collectedAt.isNotEmpty)
                  Text(
                    collectedAt.substring(0, 10),
                    style: const TextStyle(fontSize: 10, color: AppTheme.textSecondary),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}