import 'package:flutter/material.dart';
import '../../../core/lucide_icons.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/empty_state.dart';
import '../../../core/widgets/section_header.dart';
import '../../../services/api_service.dart';

class KitGivenUsersCard extends StatefulWidget {
  const KitGivenUsersCard({super.key});

  @override
  State<KitGivenUsersCard> createState() => KitGivenUsersCardState();
}

class KitGivenUsersCardState extends State<KitGivenUsersCard> {
  List<Map<String, dynamic>> _ngos = [];
  bool _loading = true;
  bool _showAll = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadNgos();
  }

  Future<void> refresh() => _loadNgos();

  Future<void> _loadNgos() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final result = await ApiService.get('/ngos/member-counts');
      // Guard the shape defensively: the server may return a bare list or a
      // {data: [...]} body. Mapping each element (never casting the raw list)
      // avoids the "List<dynamic> is not a subtype of List<Map<String, dynamic>>"
      // runtime crash.
      final rawData =
          result is List ? result : (result['data'] ?? result['ngos'] ?? const []);
      final data = rawData is List ? rawData : const <dynamic>[];
      setState(() {
        _ngos = data.map((e) => Map<String, dynamic>.from(e)).toList();
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
    final showingAll = _showAll || _ngos.length <= 8;
    final visible = showingAll ? _ngos : _ngos.take(8).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionHeader(
          title: 'NGOs',
          subtitle: 'Members under each NGO',
          action: _ngos.isEmpty
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
              height: 76,
              margin: const EdgeInsets.only(bottom: 8),
              decoration: BoxDecoration(
                color: AppColors.skeleton,
                borderRadius: BorderRadius.circular(18),
              ),
            ),
          )
        else if (_error != null)
          InkWell(
            onTap: _loadNgos,
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
                    onPressed: _loadNgos,
                    child: const Text('Retry',
                        style: TextStyle(fontSize: 12.5)),
                  ),
                ],
              ),
            ),
          )
        else if (_ngos.isEmpty)
          const EmptyState(
            icon: LucideIcons.box,
            title: 'No NGOs yet',
            message: 'NGOs with their member counts will appear here.',
            dashed: true,
          )
        else
          ...visible.map((n) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: _ngoCard(n),
              )),
      ],
    );
  }

  Widget _ngoCard(Map<String, dynamic> n) {
    final name = n['name']?.toString() ?? 'Unknown NGO';
    final code = n['code']?.toString() ?? '';
    final members = n['member_count'] is num
        ? (n['member_count'] as num).toInt()
        : 0;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(18),
        boxShadow: AppTheme.cardShadow,
      ),
      child: Row(
        children: [
          Container(
            width: 46,
            height: 46,
            decoration: const BoxDecoration(
              color: AppColors.primaryBlueSoft,
              shape: BoxShape.circle,
            ),
            alignment: Alignment.center,
            child: Text(
              name.isNotEmpty ? name[0].toUpperCase() : '?',
              style: const TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w700,
                color: AppColors.primaryBlue,
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
                if (code.isNotEmpty) ...[
                  const SizedBox(height: 3),
                  Text(
                    code,
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
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            decoration: BoxDecoration(
              color: AppColors.primaryBlueSoft,
              borderRadius: BorderRadius.circular(14),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  '$members',
                  style: const TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w700,
                    color: AppColors.primaryBlue,
                  ),
                ),
                Text(
                  members == 1 ? 'member' : 'members',
                  style: const TextStyle(
                    fontSize: 10.5,
                    color: AppColors.textSecondary,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}