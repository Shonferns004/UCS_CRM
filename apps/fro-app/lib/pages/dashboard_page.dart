import 'package:flutter/material.dart';

import '../services/fro_api.dart';
import '../theme.dart';
import '../widgets/skeleton.dart';

class DashboardPage extends StatefulWidget {
  const DashboardPage({super.key});

  @override
  State<DashboardPage> createState() => _DashboardPageState();
}

class _DashboardPageState extends State<DashboardPage> {
  Map<String, dynamic>? _dash;
  Map<String, dynamic>? _target;
  bool _loading = true;
  String? _error;
  final _requestCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _requestCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final results = await Future.wait([
        FroApi.myDashboard(),
        FroApi.myTarget(),
      ]);
      if (!mounted) return;
      setState(() {
        _dash = _flattenDashboard((results[0] as Map<String, dynamic>?) ?? <String, dynamic>{});
        _target = (results[1] as Map<String, dynamic>?) ?? <String, dynamic>{};
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Map<String, dynamic> _flattenDashboard(Map<String, dynamic> raw) {
    // Backend returns a nested payload (worker/target/connected/donations/...).
    // Flatten it to the keys the UI reads, mirroring the web Dashboard mapping.
    if (raw['worker'] is Map || raw['target'] is Map || raw['connected'] is Map || raw['donations'] is Map) {
      final worker = raw['worker'] is Map ? raw['worker'] as Map<String, dynamic> : <String, dynamic>{};
      final target = raw['target'] is Map ? raw['target'] as Map<String, dynamic> : <String, dynamic>{};
      final connected = raw['connected'] is Map ? raw['connected'] as Map<String, dynamic> : <String, dynamic>{};
      final donations = raw['donations'] is Map ? raw['donations'] as Map<String, dynamic> : <String, dynamic>{};
      final donors = raw['donors'] is Map ? raw['donors'] as Map<String, dynamic> : <String, dynamic>{};
      final verification = raw['verification'] is Map ? raw['verification'] as Map<String, dynamic> : <String, dynamic>{};
      final data = raw['data'] is Map ? raw['data'] as Map<String, dynamic> : <String, dynamic>{};
      final vToday = verification['today'] is Map ? verification['today'] as Map<String, dynamic> : <String, dynamic>{};
      final vUnverified = vToday['unverified'] is Map ? vToday['unverified'] as Map<String, dynamic> : <String, dynamic>{};
      final vMonth = verification['month'] is Map ? verification['month'] as Map<String, dynamic> : <String, dynamic>{};
      final vMonthUnverified = vMonth['unverified'] is Map ? vMonth['unverified'] as Map<String, dynamic> : <String, dynamic>{};
      return <String, dynamic>{
        'is_active': worker['is_active'],
        'is_punched_in': worker['is_punched_in'],
        'target': target['amount'],
        'collected': target['collected'],
        'collected_high_tier': target['collected_high_tier'],
        'achieved_target': target['achieved'],
        'monthly_connected': connected['monthly'],
        'daily_connected': connected['daily'],
        'daily_donations': donations['daily'],
        'daily_donor_count': donations['daily_donors'],
        'monthly_donor_count': donations['monthly_donors'],
        'data_used': data['used'],
        'active_donors': donors['active'],
        'inactive_donors': donors['inactive'],
        'verification': vUnverified['count'] ?? vMonthUnverified['count'],
        'stats': raw['stats'],
        'assignedData': raw['assignedData'],
      };
    }
    return raw;
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return ListView(
        padding: const EdgeInsets.all(16),
        children: const [
          SkeletonBlock(height: 120),
          SizedBox(height: 12),
          SkeletonBlock(height: 80),
          SizedBox(height: 12),
          SkeletonBlock(height: 160),
        ],
      );
    }
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.error_outline, size: 40, color: AppColors.danger),
              const SizedBox(height: 10),
              Text(_error!, textAlign: TextAlign.center, style: const TextStyle(fontSize: 13, color: AppColors.inkSoft)),
              const SizedBox(height: 12),
              ElevatedButton(onPressed: _load, child: const Text('Retry')),
            ],
          ),
        ),
      );
    }

    final dash = _dash ?? {};
    final tgt = _target ?? {};
    final target = (tgt['target'] ?? dash['target']?['amount'] ?? 0) as num;
    final collected = (tgt['collected'] ?? dash['target']?['collected'] ?? 0) as num;
    final remaining = target > 0 ? (target - collected).clamp(0, double.infinity) : 0.0;
    final progress = target > 0 ? (collected / target).clamp(0.0, 1.0) : 0.0;

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _card(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('This Month Target', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.inkSoft)),
                const SizedBox(height: 6),
                Text(formatCurrency(target), style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w800)),
                const SizedBox(height: 10),
                ClipRRect(
                  borderRadius: BorderRadius.circular(6),
                  child: LinearProgressIndicator(
                    value: progress,
                    minHeight: 10,
                    backgroundColor: AppColors.line,
                    valueColor: const AlwaysStoppedAnimation(AppColors.sage),
                  ),
                ),
                const SizedBox(height: 8),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('Collected ${formatCurrency(collected)}', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                    Text(
                      remaining > 0 ? '${formatCurrency(remaining)} to go' : 'Target achieved!',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: remaining > 0 ? AppColors.inkSoft : AppColors.success,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(child: _statCard('Connected', dash['daily_connected']?.toString() ?? '—', Icons.phone_in_talk, AppColors.sage)),
              const SizedBox(width: 10),
              Expanded(child: _statCard('Donations', dash['daily_donations']?.toString() ?? '—', Icons.card_giftcard, const Color(0xFF2563eb))),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(child: _statCard('Today Calls', dash['today_calls']?.toString() ?? '—', Icons.phone, const Color(0xFF0891b2))),
              const SizedBox(width: 10),
              Expanded(child: _statCard('Pending Verify', dash['verification']?.toString() ?? '—', Icons.verified, AppColors.warning)),
            ],
          ),
          const SizedBox(height: 16),
          _card(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Request More Data', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
                const SizedBox(height: 4),
                const Text('Ask admin for more leads if you are out of work.', style: TextStyle(fontSize: 12, color: AppColors.inkSoft)),
                const SizedBox(height: 10),
                TextField(
                  controller: _requestCtrl,
                  maxLines: 2,
                  decoration: const InputDecoration(hintText: 'Message (optional)'),
                ),
                const SizedBox(height: 10),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    icon: const Icon(Icons.send, size: 16),
                    label: const Text('Request Data'),
                    onPressed: () async {
                      try {
                        await FroApi.requestMoreData(_requestCtrl.text.trim());
                        _requestCtrl.clear();
                        if (mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(content: Text('Request sent'), backgroundColor: AppColors.success),
                          );
                        }
                      } catch (e) {
                        if (mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(content: Text(e.toString()), backgroundColor: AppColors.danger),
                          );
                        }
                      }
                    },
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _card({required Widget child}) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.line),
      ),
      child: child,
    );
  }

  Widget _statCard(String label, String value, IconData icon, Color color) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 3,
            height: 18,
            decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(2)),
          ),
          const SizedBox(height: 6),
          Icon(icon, size: 18, color: color),
          const SizedBox(height: 8),
          Text(value, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
          Text(label, style: const TextStyle(fontSize: 11.5, color: AppColors.inkSoft, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}
