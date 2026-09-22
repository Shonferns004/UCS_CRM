import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';
import '../../services/api_service.dart';
import '../../services/fingerprint_service.dart';
import 'widgets/my_tasks_card.dart';
import 'widgets/operator_dashboard_card.dart';
import 'widgets/kit_collected_users_card.dart';
import '../programs/programs_page.dart';
import '../tasks/tasks_page.dart';
import '../profile/profile_page.dart';
import '../beneficiaries/add_beneficiary_page.dart';
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
  bool? _deviceConnected;

  @override
  void initState() {
    super.initState();
    _loadData();
    _checkDevice();
  }

  Future<void> _loadData() async {
    _volunteerData = await ApiService.getVolunteerData();
    try {
      _overview = await ApiService.get('/beneficiaries/overview');
    } catch (_) {}
    if (mounted) setState(() {});
  }

  Future<void> _checkDevice() async {
    var connected = false;
    try {
      final info = await FingerprintService.rawGetInfo();
      connected = info['connected'] == true;
      if (!connected) {
        // Try to actually open the raw USB device — this is the connection
        // path used by fingerprint capture.
        final conn = await FingerprintService.rawConnect();
        connected = conn['connected'] == true;
      }
      if (!connected) {
        final defaultDevice = await FingerprintService.getDefaultDevice();
        if (defaultDevice != null && defaultDevice.isAvailable) {
          connected = true;
        }
      }
    } catch (_) {
      connected = false;
    }
    if (mounted) setState(() => _deviceConnected = connected);
  }

  @override
  Widget build(BuildContext context) {
    final pages = [
      _buildHomeContent(),
      const ProgramsPage(),
      const TasksPage(),
    ];

    return Scaffold(
      body: pages[_currentTab],
      bottomNavigationBar: NavigationBar(
        selectedIndex: _currentTab,
        onDestinationSelected: (i) => setState(() => _currentTab = i),
        backgroundColor: Colors.white,
        indicatorColor: AppTheme.secondary.withAlpha(30),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.home_outlined),
            selectedIcon: Icon(Icons.home, color: AppTheme.secondary),
            label: 'Home',
          ),
          NavigationDestination(
            icon: Icon(Icons.calendar_today_outlined),
            selectedIcon: Icon(Icons.calendar_today, color: AppTheme.secondary),
            label: 'Programs',
          ),
          NavigationDestination(
            icon: Icon(Icons.task_outlined),
            selectedIcon: Icon(Icons.task, color: AppTheme.secondary),
            label: 'Tasks',
          ),
        ],
      ),
    );
  }

  Widget _buildHomeContent() {
    final name = _volunteerData?['name'] ?? 'Volunteer';
    final hour = DateTime.now().hour;
    final greeting = hour < 12
        ? 'Good Morning'
        : hour < 17
        ? 'Good Afternoon'
        : 'Good Evening';

    return SafeArea(
      child: RefreshIndicator(
        onRefresh: () async {
          await _loadData();
          await _checkDevice();
        },
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'BEING SEVAK',
                        style: TextStyle(
                          fontSize: 10,
                          letterSpacing: 2,
                          color: AppTheme.textSecondary,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '$greeting, $name',
                        style: const TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w700,
                          color: AppTheme.primary,
                        ),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  icon: Icon(
                    Icons.account_circle,
                    color: _deviceConnected == true
                        ? AppTheme.success
                        : const Color(0xFFFCA5A5),
                    size: 30,
                  ),
                  onPressed: () => Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => ProfilePage(onLogout: widget.onLogout),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),

            const OperatorDashboardCard(),
            const SizedBox(height: 12),

            // Beneficiaries section
            _buildBeneficiarySection(),
            const SizedBox(height: 16),

            // Stats
            if (_overview != null) ...[
              Row(
                children: [
                  _statCard(
                    'Total Members',
                    '${_overview!['total_beneficiaries'] ?? 0}',
                    AppTheme.secondary,
                  ),
                  const SizedBox(width: 12),
                  _statCard(
                    'Donated Today',
                    '${_overview!['kit_collected_today'] ?? 0}',
                    AppTheme.success,
                  ),
                ],
              ),
              const SizedBox(height: 16),
            ],

            const MyTasksCard(),
            const SizedBox(height: 16),

            const KitCollectedUsersCard(),
          ],
        ),
      ),
    );
  }

  Widget _buildBeneficiarySection() {
    final canAdd = [
      'super_admin',
      'admin',
      'ngo',
      'accounts',
    ].contains(_volunteerData?['role']);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.only(left: 4, bottom: 8),
          child: Text(
            'BENEFICIARIES',
            style: TextStyle(
              fontSize: 11,
              letterSpacing: 1.5,
              color: AppTheme.textSecondary,
            ),
          ),
        ),
        Row(
          children: [
            Expanded(
              child: _actionCard(
                icon: Icons.person_add_alt_1,
                label: 'Add Beneficiary',
                sublabel: canAdd
                    ? 'Register new user'
                    : 'Requires admin access',
                color: canAdd ? AppTheme.success : AppTheme.textSecondary,
                onTap: canAdd
                    ? () => Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => const AddBeneficiaryPage(),
                        ),
                      )
                    : null,
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        _actionCard(
          icon: Icons.fingerprint,
          label: 'Find by Fingerprint',
          sublabel: _deviceConnected == true
              ? 'Identify enrolled user'
              : _deviceConnected == null
                  ? 'Checking fingerprint device...'
                  : 'Fingerprint device not connected',
          color: _deviceConnected == true
              ? AppTheme.primary
              : const Color(0xFFFCA5A5),
          onTap: () {
            if (_deviceConnected != true) {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text(
                      'No fingerprint device connected. Please connect the SecuGen Hamster Pro 20 and try again.'),
                  backgroundColor: AppTheme.error,
                ),
              );
              return;
            }
            Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const FingerprintLookupPage()),
            );
          },
        ),
      ],
    );
  }

  Widget _statCard(String label, String value, Color color) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: AppTheme.outline),
        ),
        child: Column(
          children: [
            Text(
              value,
              style: TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.w700,
                color: color,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              label,
              style: const TextStyle(
                fontSize: 11,
                color: AppTheme.textSecondary,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _actionCard({
    required IconData icon,
    required String label,
    required String sublabel,
    required Color color,
    VoidCallback? onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: AppTheme.outline),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: color, size: 28),
            const SizedBox(height: 10),
            Text(
              label,
              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 2),
            Text(
              sublabel,
              style: const TextStyle(
                fontSize: 11,
                color: AppTheme.textSecondary,
              ),
            ),
          ],
        ),
      ),
    );
  }
}