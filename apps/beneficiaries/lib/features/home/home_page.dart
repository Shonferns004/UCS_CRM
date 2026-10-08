import 'dart:async';
import 'package:flutter/material.dart';
import '../../core/lucide_icons.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_text_styles.dart';
import '../../core/theme/app_theme.dart';
import '../../services/api_service.dart';
import '../../services/fingerprint_service.dart';
import '../auth/operator_setup_page.dart';
import '../beneficiaries/add_beneficiary_page.dart';
import '../beneficiaries/beneficiary_list_page.dart';
import '../beneficiaries/fingerprint_lookup_page.dart';
import '../profile/profile_page.dart';
import 'widgets/kits_page.dart';
import 'package:shared_preferences/shared_preferences.dart';

class HomePage extends StatefulWidget {
  final VoidCallback onLogout;
  const HomePage({super.key, required this.onLogout});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  Map<String, dynamic>? _volunteerData;
  StreamSubscription<Map<String, dynamic>>? _deviceEventSub;
  int? _totalRegistered;
  int? _kitGivenToday;

  @override
  void initState() {
    super.initState();
    FingerprintService.initialize();
    _loadData();
    _checkDevice();
    _deviceEventSub = FingerprintService.onEvent.listen((event) {
      if (event['type'] == 'device_connected') _checkDevice();
    });
  }

  @override
  void dispose() {
    _deviceEventSub?.cancel();
    FingerprintService.dispose();
    super.dispose();
  }

  Future<void> _loadData() async {
    _volunteerData = await ApiService.getVolunteerData();
    if (mounted) setState(() {});
    try {
      final data = await ApiService.get('/operator/kits');
      if (!mounted) return;
      setState(() {
        _totalRegistered = (data['total_registered'] as num?)?.toInt() ?? 0;
        _kitGivenToday = (data['kit_given_today'] as num?)?.toInt() ?? 0;
      });
    } catch (_) {}
  }

  Future<bool> _checkDevice() async {
    try {
      return await FingerprintService.ensureConnected();
    } catch (_) {
      return false;
    }
  }

  bool get _canAdd => [
    'super_admin',
    'admin',
    'ngo',
    'accounts',
    'event_head',
    'worker',
  ].contains(_volunteerData?['role']);

  String get _name => (_volunteerData?['name'] ?? 'Volunteer').toString();

  String get _roleLabel {
    final role = (_volunteerData?['role'] ?? '').toString();
    if (role.isEmpty || role == 'worker') return 'Operator';
    return role
        .split('_')
        .map((w) => w.isEmpty ? w : '${w[0].toUpperCase()}${w.substring(1)}')
        .join(' ');
  }

  // Registration -> register page
  Future<void> _openRegistration() async {
    await Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => const AddBeneficiaryPage()),
    );
    if (mounted) _loadData();
  }

  // Distribution -> Operator Details form -> fingerprint/kit screen
  String get _setupStamp {
    final now = DateTime.now();
    final day =
        '${now.year}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}';
    final who = (_volunteerData?['login_id'] ?? _volunteerData?['id'] ?? _name)
        .toString();
    return '$who|$day';
  }

  Future<void> _openDistribution() async {
    final prefs = await SharedPreferences.getInstance();
    if (!mounted) return;
    final stamp = _setupStamp;

    if (prefs.getString('operator_setup_stamp') == stamp) {
      await Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => FingerprintLookupPage(name: _name, canAdd: false),
        ),
      );
      if (mounted) _loadData();
      return;
    }

    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (ctx) => OperatorSetupPage(
          canGoBack: true,
          onComplete: () async {
            await prefs.setString('operator_setup_stamp', stamp);
            if (!ctx.mounted) return;
            Navigator.pushReplacement(
              ctx,
              MaterialPageRoute(
                builder: (_) =>
                    FingerprintLookupPage(name: _name, canAdd: false),
              ),
            );
          },
        ),
      ),
    );
    if (mounted) _loadData();
  }

  void _openProfile() {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (ctx) => Scaffold(
          appBar: AppBar(title: const Text('Profile')),
          body: ProfilePage(
            onLogout: () {
              Navigator.of(ctx).popUntil((r) => r.isFirst);
              widget.onLogout();
            },
          ),
        ),
      ),
    );
  }

  // Total Registered -> registration list
  void _openMyRegistrations() {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => const BeneficiaryListPage(title: 'Registrations'),
      ),
    );
  }

  // Kits Given Today -> kit list
  void _openMyDistributions() {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => Scaffold(
          appBar: AppBar(title: const Text('Distributions')),
          body: const SafeArea(
            child: SingleChildScrollView(
              padding: EdgeInsets.fromLTRB(24, 8, 24, 32),
              child: KitsPage(),
            ),
          ),
        ),
      ),
    );
  }

  // ---- UI ----

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () async {
            await _loadData();
            await _checkDevice();
          },
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(24, 16, 24, 32),
            children: [
              _header(),
              const SizedBox(height: 20),

              // Stat cards (tap to open list)
              Row(
                children: [
                  Expanded(
                    child: _StatTile(
                      icon: LucideIcons.userCheck,
                      value: _totalRegistered,
                      label: 'Total Registered',
                      background: AppColors.statMembersBg,
                      border: AppColors.statMembersBorder,
                      iconBg: AppColors.statMembersIconBg,
                      iconColor: AppColors.primaryBlue,
                      onTap: _openMyRegistrations,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _StatTile(
                      icon: LucideIcons.package,
                      value: _kitGivenToday,
                      label: 'Kits Given Today',
                      background: AppColors.surfaceSoft,
                      border: AppColors.border,
                      iconBg: AppColors.primaryBlueSoft,
                      iconColor: AppColors.addBeneficiaryText,
                      onTap: _openMyDistributions,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 20),

              // Registration card (bright blue)
              if (_canAdd) ...[
                _ActionCard(
                  color: AppColors.primaryBlue,
                  icon: LucideIcons.userPlus,
                  title: 'Beneficiary Registration',
                  subtitle: 'Add a new beneficiary to the system',
                  onTap: _openRegistration,
                ),
                const SizedBox(height: 16),
              ],

              // Distribution card (dark navy)
              _ActionCard(
                color: AppColors.addBeneficiaryText,
                icon: LucideIcons.package,
                title: 'Beneficiary Operator',
                subtitle: 'Record materials delivered to a beneficiary',
                onTap: _openDistribution,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _header() {
    return Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Namaste 🙏', style: AppTextStyles.pageSubtitle),
              const SizedBox(height: 2),
              Text(_name, style: AppTextStyles.pageTitle),
              const SizedBox(height: 2),
              Text(
                _roleLabel,
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: AppColors.primaryBlue,
                ),
              ),
            ],
          ),
        ),
        Material(
          color: AppColors.primaryBlue,
          shape: const CircleBorder(),
          child: InkWell(
            customBorder: const CircleBorder(),
            onTap: _openProfile,
            child: const SizedBox(
              width: 52,
              height: 52,
              child: Icon(LucideIcons.user, color: Colors.white, size: 24),
            ),
          ),
        ),
      ],
    );
  }
}

class _ActionCard extends StatelessWidget {
  final Color color;
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  const _ActionCard({
    required this.color,
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: color,
      borderRadius: AppTheme.radiusLarge,
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 52,
                height: 52,
                decoration: BoxDecoration(
                  color: Colors.white.withAlpha(46),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Icon(icon, color: Colors.white, size: 26),
              ),
              const SizedBox(height: 24),
              Text(
                title,
                style: const TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w700,
                  color: Colors.white,
                ),
              ),
              const SizedBox(height: 8),
              Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Expanded(
                    child: Text(
                      subtitle,
                      style: TextStyle(
                        fontSize: 15,
                        height: 1.4,
                        color: Colors.white.withAlpha(225),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  const Icon(
                    LucideIcons.arrowRight,
                    color: Colors.white,
                    size: 22,
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StatTile extends StatelessWidget {
  final IconData icon;
  final int? value;
  final String label;
  final Color background;
  final Color border;
  final Color iconBg;
  final Color iconColor;
  final VoidCallback onTap;

  const _StatTile({
    required this.icon,
    required this.value,
    required this.label,
    required this.background,
    required this.border,
    required this.iconBg,
    required this.iconColor,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: background,
      borderRadius: AppTheme.radiusCard,
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: AppTheme.radiusCard,
            border: Border.all(color: border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      color: iconBg,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Icon(icon, color: iconColor, size: 18),
                  ),
                  const Spacer(),
                  const Icon(
                    LucideIcons.chevronRight,
                    color: AppColors.textTertiary,
                    size: 18,
                  ),
                ],
              ),
              const SizedBox(height: 14),
              Text(value?.toString() ?? '–', style: AppTextStyles.largeStat),
              const SizedBox(height: 2),
              Text(label, style: AppTextStyles.secondaryStatLabel),
            ],
          ),
        ),
      ),
    );
  }
}
