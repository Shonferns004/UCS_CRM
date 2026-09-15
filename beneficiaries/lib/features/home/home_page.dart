import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';
import '../../services/api_service.dart';
import 'widgets/today_program_card.dart';
import 'widgets/my_tasks_card.dart';
import '../programs/programs_page.dart';
import '../tasks/tasks_page.dart';
import '../profile/profile_page.dart';
import '../beneficiaries/qr_scanner_page.dart';
import '../beneficiaries/beneficiary_search_page.dart';
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

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    _volunteerData = await ApiService.getVolunteerData();
    try {
      _overview = await ApiService.get('/beneficiaries/overview');
    } catch (_) {}
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final pages = [
      _buildHomeContent(),
      const ProgramsPage(),
      const TasksPage(),
      ProfilePage(onLogout: widget.onLogout),
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
          NavigationDestination(
            icon: Icon(Icons.person_outlined),
            selectedIcon: Icon(Icons.person, color: AppTheme.secondary),
            label: 'Profile',
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
        onRefresh: _loadData,
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
              ],
            ),
            const SizedBox(height: 20),

            // Quick Scan Button
            GestureDetector(
              onTap: () => Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const QrScannerPage()),
              ),
              child: Container(
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  color: AppTheme.primary,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.qr_code_scanner, color: Colors.white, size: 28),
                    SizedBox(width: 12),
                    Text(
                      'SCAN BENEFICIARY',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 1,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),

            // Beneficiaries section
            _buildBeneficiarySection(),
            const SizedBox(height: 16),

            // Stats
            if (_overview != null) ...[
              Row(
                children: [
                  _statCard(
                    'Total',
                    '${_overview!['total_beneficiaries'] ?? 0}',
                    AppTheme.secondary,
                  ),
                  const SizedBox(width: 12),
                  _statCard(
                    'Active',
                    '${_overview!['active'] ?? 0}',
                    AppTheme.success,
                  ),
                  const SizedBox(width: 12),
                  _statCard(
                    'Programs',
                    '${_overview!['programs'] ?? 0}',
                    AppTheme.primary,
                  ),
                ],
              ),
              const SizedBox(height: 16),
            ],

            const TodayProgramCard(),
            const SizedBox(height: 12),
            const MyTasksCard(),
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
                icon: Icons.person_search,
                label: 'Find Beneficiary',
                sublabel: 'Search & enroll fingerprint',
                color: AppTheme.secondary,
                onTap: () => Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => const BeneficiarySearchPage(),
                  ),
                ),
              ),
            ),
            const SizedBox(width: 12),
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
          sublabel: 'Identify enrolled user',
          color: AppTheme.primary,
          onTap: () => Navigator.push(
            context,
            MaterialPageRoute(builder: (_) => const FingerprintLookupPage()),
          ),
        ),
      ],
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
}
