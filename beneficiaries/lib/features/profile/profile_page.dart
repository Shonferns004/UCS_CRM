import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';
import '../../services/api_service.dart';

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
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text('Profile', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
          const SizedBox(height: 20),
          Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppTheme.outline),
            ),
            child: Column(
              children: [
                CircleAvatar(
                  radius: 36,
                  backgroundColor: AppTheme.secondary.withAlpha(30),
                  child: Text(name.isNotEmpty ? name[0].toUpperCase() : 'V',
                      style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w700, color: AppTheme.secondary)),
                ),
                const SizedBox(height: 12),
                Text(name, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
                const SizedBox(height: 4),
                Text(role.toUpperCase(), style: const TextStyle(fontSize: 11, letterSpacing: 1, color: AppTheme.textSecondary)),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: AppTheme.outline),
            ),
            child: Column(
              children: [
                _infoRow(Icons.phone, 'Mobile', mobile),
                if (email.isNotEmpty) ...[
                  const Divider(height: 24),
                  _infoRow(Icons.email, 'Email', email),
                ],
              ],
            ),
          ),
          const SizedBox(height: 24),
          OutlinedButton.icon(
            onPressed: () => _confirmLogout(context),
            icon: const Icon(Icons.logout, size: 18),
            label: const Text('Logout'),
            style: OutlinedButton.styleFrom(
              foregroundColor: AppTheme.error,
              side: const BorderSide(color: AppTheme.error),
            ),
          ),
        ],
      ),
    );
  }

  Widget _infoRow(IconData icon, String label, String value) {
    return Row(
      children: [
        Icon(icon, size: 18, color: AppTheme.textSecondary),
        const SizedBox(width: 12),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: const TextStyle(fontSize: 11, color: AppTheme.textSecondary)),
            Text(value.isNotEmpty ? value : '-', style: const TextStyle(fontSize: 14)),
          ],
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
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          TextButton(
            onPressed: () async {
              await ApiService.clearAuth();
              if (context.mounted) Navigator.pop(ctx);
              widget.onLogout();
            },
            child: const Text('Logout', style: TextStyle(color: AppTheme.error)),
          ),
        ],
      ),
    );
  }
}
