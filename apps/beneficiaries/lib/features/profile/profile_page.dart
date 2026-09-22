import '../../core/lucide_icons.dart';
import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/app_text_styles.dart';
import '../../services/api_service.dart';
import '../home/widgets/operator_dashboard_card.dart';

class ProfilePage extends StatefulWidget {
  final VoidCallback onLogout;
  const ProfilePage({super.key, required this.onLogout});

  @override
  State<ProfilePage> createState() => _ProfilePageState();
}

class _ProfilePageState extends State<ProfilePage> {
  Map<String, dynamic>? _volunteer;

  @override
  void initState() {
    super.initState();
    _loadProfile();
  }

  Future<void> _loadProfile() async {
    _volunteer = await ApiService.getVolunteerData();
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final name = _volunteer?['name'] ?? 'Volunteer';
    final mobile = _volunteer?['mobile'] ?? _volunteer?['phone'] ?? '';
    final email = _volunteer?['email'] ?? '';
    final role = _volunteer?['role'] ?? 'volunteer';

    return SafeArea(
      bottom: false,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(24, 16, 24, 32),
        children: [
          const Text('Profile', style: AppTextStyles.sectionTitle),
          const SizedBox(height: 20),

          // Identity header
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: AppTheme.radiusCard,
              boxShadow: AppTheme.cardShadow,
            ),
            child: Row(
              children: [
                Container(
                  width: 64,
                  height: 64,
                  decoration: const BoxDecoration(
                    color: AppColors.primaryBlueSoft,
                    shape: BoxShape.circle,
                  ),
                  alignment: Alignment.center,
                  child: Text(
                    name.isNotEmpty ? name[0].toUpperCase() : 'V',
                    style: const TextStyle(
                      fontSize: 26,
                      fontWeight: FontWeight.w700,
                      color: AppColors.primaryBlue,
                    ),
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(name,
                          style: const TextStyle(
                              fontSize: 18, fontWeight: FontWeight.w700)),
                      const SizedBox(height: 4),
                      Text(
                        role
                            .split('_')
                            .map((w) => w.isEmpty
                                ? w
                                : '${w[0].toUpperCase()}${w.substring(1)}')
                            .join(' '),
                        style: AppTextStyles.caption,
                      ),
                      const Divider(),
                      _infoRow(LucideIcons.phone, 'Mobile', mobile),
                      if (email.isNotEmpty) ...[
                        const SizedBox(height: 12),
                        _infoRow(LucideIcons.mail, 'Email', email),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),

          const Text('Operator Details', style: AppTextStyles.sectionTitle),
          const SizedBox(height: 16),
          const OperatorDashboardCard(),
          const SizedBox(height: 28),

          // Logout (destructive, soft)
          SizedBox(
            width: double.infinity,
            height: 52,
            child: TextButton.icon(
              onPressed: () => _confirmLogout(context),
              icon: const Icon(LucideIcons.logOut, size: 18),
              label: const Text('Logout',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
              style: TextButton.styleFrom(
                backgroundColor: AppColors.errorSoft,
                foregroundColor: AppColors.error,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(18),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _infoRow(IconData icon, String label, String value) {
    return Row(
      children: [
        Icon(icon, size: 18, color: AppColors.textSecondary),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: AppTextStyles.caption),
              Text(value.isNotEmpty ? value : '-',
                  style: const TextStyle(
                      fontSize: 14, color: AppColors.textPrimary)),
            ],
          ),
        ),
      ],
    );
  }

  void _confirmLogout(BuildContext context) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Logout'),
        content: const Text('Are you sure you want to logout?'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          TextButton(
            onPressed: () async {
              await ApiService.clearAuth();
              if (context.mounted) Navigator.pop(ctx);
              widget.onLogout();
            },
            child: const Text('Logout', style: TextStyle(color: AppColors.error)),
          ),
        ],
      ),
    );
  }
}