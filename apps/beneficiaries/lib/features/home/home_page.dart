import 'dart:async';
import 'package:flutter/material.dart';
import '../../core/lucide_icons.dart';
import '../../core/theme/app_colors.dart';
import '../../core/widgets/bottom_navigation.dart';
import '../../core/widgets/stat_card.dart';
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
            icon: LucideIcons.checkCircle,
            value: _fmtAmount(_overview!['total_donated'] ?? 0),
            label: 'Donated',
            background: AppColors.statDonationsBg,
            border: AppColors.statDonationsBorder,
            iconBackground: AppColors.statDonationsIconBg,
            iconColor: AppColors.successGreen,
          ),
        ),
      ],
    );
  }

  // Compact Indian-style amount for the Donated stat: 1.2 Cr / 1.5 L above
  // lakh thresholds, else ₹12,34,567-style grouping.
  String _fmtAmount(dynamic v) {
    final n = (v is num) ? v.toDouble() : 0.0;
    if (n >= 10000000) {
      return '₹${_t(n / 10000000)} Cr';
    }
    if (n >= 100000) {
      return '₹${_t(n / 100000)} L';
    }
    final i = n.round();
    final s = i.toString();
    if (s.length <= 3) return '₹$s';
    final last3 = s.substring(s.length - 3);
    var rest = s.substring(0, s.length - 3);
    final parts = <String>[];
    while (rest.length > 2) {
      parts.insert(0, rest.substring(rest.length - 2));
      rest = rest.substring(0, rest.length - 2);
    }
    if (rest.isNotEmpty) parts.insert(0, rest);
    return '₹${parts.join(',')},$last3';
  }

  String _t(double d) {
    if (d == d.roundToDouble()) return d.round().toString();
    return d.toStringAsFixed(1);
  }
}