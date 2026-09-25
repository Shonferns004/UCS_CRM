import 'dart:async';
import 'package:flutter/material.dart';
import '../../core/lucide_icons.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/bottom_navigation.dart';
import '../../core/widgets/stat_card.dart';
import '../../core/widgets/section_header.dart';
import '../../services/api_service.dart';
import '../../services/fingerprint_service.dart';
import 'widgets/kit_given_users_card.dart';
import '../profile/profile_page.dart';
import '../beneficiaries/fingerprint_lookup_page.dart';

class HomePage extends StatefulWidget {
  final VoidCallback onLogout;
  const HomePage({super.key, required this.onLogout});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  int _currentTab = 0;
  Map<String, dynamic>? _volunteerData;
  Map<String, dynamic>? _overview;
  StreamSubscription<Map<String, dynamic>>? _deviceEventSub;

  @override
  void initState() {
    super.initState();
    FingerprintService.initialize();
    _loadData();
    _checkDevice();
    _deviceEventSub = FingerprintService.onEvent.listen(_handleDeviceEvent);
  }

  Future<void> _handleDeviceEvent(Map<String, dynamic> event) async {
    final type = event['type'];
    if (type == 'device_connected') {
      await _checkDevice();
    }
  }

  @override
  void dispose() {
    _deviceEventSub?.cancel();
    FingerprintService.dispose();
    super.dispose();
  }

  Future<void> _loadData() async {
    _volunteerData = await ApiService.getVolunteerData();
    try {
      _overview = await ApiService.get('/beneficiaries/overview');
    } catch (_) {}
    if (mounted) setState(() {});
  }

  Future<bool> _checkDevice() async {
    try {
      return await FingerprintService.ensureConnected();
    } catch (_) {
      return false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final name = _volunteerData?['name'] ?? 'Volunteer';
    final canAdd = [
      'super_admin',
      'admin',
      'ngo',
      'accounts',
      'event_head',
      'worker',
    ].contains(_volunteerData?['role']);
    final pages = [
      FingerprintLookupPage(name: name, canAdd: canAdd),
      _buildHomeContent(),
      ProfilePage(onLogout: widget.onLogout),
    ];

    return Scaffold(
      body: pages[_currentTab],
      bottomNavigationBar: BottomNavigation(
        currentIndex: _currentTab,
        onChanged: (i) {
          setState(() => _currentTab = i);
          if (i == 1) _kitCardKey.currentState?.refresh();
        },
      ),
    );
  }

  final GlobalKey<KitGivenUsersCardState> _kitCardKey = GlobalKey();

  Widget _buildHomeContent() {
    return SafeArea(
      bottom: false,
      child: RefreshIndicator(
        onRefresh: () async {
          await _loadData();
          await _checkDevice();
          await _kitCardKey.currentState?.refresh();
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(24, 16, 24, 32),
          children: [
            if (_overview != null) _buildStats(),
            if (_overview != null) const SizedBox(height: 28),
            if (_overview != null) _buildNgoBreakdown(),
            if (_overview != null) const SizedBox(height: 28),
            KitGivenUsersCard(key: _kitCardKey),
          ],
        ),
      ),
    );
  }

  Widget _buildStats() {
    return Row(
      children: [
        Expanded(
          child: StatCard(
            icon: LucideIcons.user,
            value: '${_overview!['total_beneficiaries'] ?? 0}',
            label: 'Total Members',
            background: AppColors.statMembersBg,
            border: AppColors.statMembersBorder,
            iconBackground: AppColors.statMembersIconBg,
            iconColor: AppColors.primaryBlue,
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: StatCard(
            icon: LucideIcons.package,
            value: '${_overview!['kit_given_today'] ?? 0}',
            label: 'Given Today',
            background: AppColors.statDonationsBg,
            border: AppColors.statDonationsBorder,
            iconBackground: AppColors.statDonationsIconBg,
            iconColor: AppColors.successGreen,
          ),
        ),
      ],
    );
  }

  // Member counts per NGO. Maps every element explicitly so a bare
  // List<dynamic> from the server never trips a List<Map<String, dynamic>>
  // cast at runtime.
  Widget _buildNgoBreakdown() {
    final raw = _overview!['ngos'];
    final ngos = raw is List
        ? raw
            .whereType<Map>()
            .map((e) => Map<String, dynamic>.from(e))
            .toList()
        : <Map<String, dynamic>>[];
    if (ngos.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionHeader(
          title: 'NGO Members',
          subtitle: 'Members registered under each NGO',
        ),
        const SizedBox(height: 16),
        ...ngos.map((n) {
          final name = n['name']?.toString() ?? 'NGO';
          final code = n['code']?.toString() ?? '';
          final count = (n['count'] as num?)?.toInt() ?? 0;
          return Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: AppTheme.radiusCard,
                boxShadow: AppTheme.cardShadow,
              ),
              child: Row(
                children: [
                  Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      color: AppColors.primaryBlueSoft,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    alignment: Alignment.center,
                    child: Text(
                      name.isNotEmpty ? name[0].toUpperCase() : '?',
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                        color: AppColors.primaryBlue,
                      ),
                    ),
                  ),
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
                            fontSize: 15,
                            fontWeight: FontWeight.w600,
                            color: AppColors.textPrimary,
                          ),
                        ),
                        if (code.isNotEmpty) ...[
                          const SizedBox(height: 2),
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
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                      color: AppColors.statMembersIconBg,
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Text(
                      '$count members',
                      style: const TextStyle(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w600,
                        color: AppColors.primaryBlue,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          );
        }),
      ],
    );
  }
}