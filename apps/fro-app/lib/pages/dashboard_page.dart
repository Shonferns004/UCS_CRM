import 'package:flutter/material.dart';

import '../models/dashboard.dart';
import '../services/fro_api.dart';
import '../theme.dart';
import '../widgets/aki_calendar.dart';
import '../widgets/dashboard_cards.dart';
import '../widgets/skeleton.dart';
import 'collections_page.dart';
import 'donor_split_page.dart';

class DashboardPage extends StatefulWidget {
  const DashboardPage({super.key});

  @override
  State<DashboardPage> createState() => _DashboardPageState();
}

class _DashboardPageState extends State<DashboardPage> {
  DashboardData? _dash;
  TargetData? _target;
  bool _loading = true;
  String? _error;

  String _donorStatus = 'active';
  String _donorView = '1';
  String _connectedView = 'daily';
  String _donationView = 'today';
  String _assignedView = 'total';

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
        FroApi.myDashboard(activeWindow: _donorView),
        FroApi.myTarget(),
      ]);
      if (!mounted) return;
      setState(() {
        _dash = DashboardData.fromJson(results[0]);
        _target = TargetData.fromJson(results[1]);
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _changeDonorView(String v) async {
    if (_donorView == v) return;
    setState(() => _donorView = v);
    try {
      final r = await FroApi.myDashboard(activeWindow: v);
      if (mounted) {
        setState(() => _dash = DashboardData.fromJson(r));
      }
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return ListView(
        padding: const EdgeInsets.all(16),
        children: const [
          SkeletonBlock(height: 72),
          SizedBox(height: 10),
          SkeletonBlock(height: 96),
          SizedBox(height: 10),
          SkeletonBlock(height: 96),
          SizedBox(height: 10),
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
              const Icon(Icons.error_outline,
                  size: 40, color: AppColors.danger),
              const SizedBox(height: 10),
              Text(_error!,
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 13, color: AppColors.inkSoft)),
              const SizedBox(height: 12),
              ElevatedButton(onPressed: _load, child: const Text('Retry')),
            ],
          ),
        ),
      );
    }

    final dash = _dash ?? const DashboardData();
    final target = _target ?? const TargetData();
    final collected = target.collected;
    final remaining = target.target > 0
        ? (target.target - collected).clamp(0, double.infinity)
        : 0.0;
    final progress = target.target > 0
        ? (collected / target.target).clamp(0.0, 1.0)
        : 0.0;

    final spec = ThemeServiceSpec.of(context);
    final now = DateTime.now();
    final monthStr =
        '${now.year}-${now.month.toString().padLeft(2, '0')}';

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _liveStatusCard(dash, spec),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(child: _targetCard(target, progress, spec)),
              const SizedBox(width: 12),
              Expanded(child: _remainingCard(remaining, spec)),
            ],
          ),
          const SizedBox(height: 12),
          _collectedCard(target, collected, progress, spec),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(child: _connectedCard(dash, spec)),
              const SizedBox(width: 12),
              Expanded(child: _collectionCard(dash, collected, spec)),
            ],
          ),
          const SizedBox(height: 12),
          _incentiveCard(target, spec),
          const SizedBox(height: 12),
          _activeDonorsCard(dash, spec),
          const SizedBox(height: 12),
          _assignedCard(dash, spec),
          const SizedBox(height: 12),
          _akiCalendarCard(target, monthStr, spec),
          const SizedBox(height: 12),
          _requestDataCard(spec),
        ],
      ),
    );
  }

  // ── Row 1 ────────────────────────────────────────────────
  Widget _liveStatusCard(DashboardData dash, FroThemeSpec spec) {
    final punchedIn = dash.isPunchedIn ?? false;
    final active = dash.isActive ?? false;
    final border = punchedIn ? AppColors.success : const Color(0xFFF87171);
    final color = active ? (punchedIn ? AppColors.success : const Color(0xFFF87171)) : const Color(0xFF94A3B8);
    final label = active ? (punchedIn ? 'Punched In' : 'Not Punched') : 'Inactive';
    final icon = punchedIn ? Icons.check_circle : (active ? Icons.schedule : Icons.cancel);

    return DashboardCard(
      borderColor: border,
      gradient: [
        punchedIn ? const Color(0xFFF0FDF4) : const Color(0xFFFEF2F2),
        spec.paper,
      ],
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: color,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, size: 18, color: Colors.white),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('LIVE STATUS',
                    style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 0.3,
                        color: AppColors.inkSoft)),
                const SizedBox(height: 2),
                Row(
                  children: [
                    Container(
                      width: 8,
                      height: 8,
                      decoration: BoxDecoration(color: color, shape: BoxShape.circle),
                    ),
                    const SizedBox(width: 4),
                    Text(label,
                        style: TextStyle(
                            fontSize: 12.5, fontWeight: FontWeight.w700, color: color)),
                    const SizedBox(width: 12),
                    Text(
                      'Data: ${dash.dataUsed}/${dash.statsTotal}',
                      style: const TextStyle(
                          fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.inkSoft),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _targetCard(TargetData target, double progress, FroThemeSpec spec) {
    return DashboardCard(
      borderColor: AppColors.purple,
      gradient: [const Color(0xFFFAF5FF), spec.paper],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.adjust, size: 16, color: AppColors.purple),
          const SizedBox(height: 6),
          Text('Target${target.month != null ? ' · ${_monthLabel(target.month!)}' : ''}',
              style: const TextStyle(
                  fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.inkSoft)),
          const SizedBox(height: 2),
          Text(formatCurrency(target.target),
              style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
          Text('${(progress * 100).toStringAsFixed(0)}% achieved',
              style: const TextStyle(fontSize: 10, color: AppColors.inkSoft)),
        ],
      ),
    );
  }

  Widget _remainingCard(num remaining, FroThemeSpec spec) {
    final over = remaining <= 0;
    final color = over ? AppColors.success : const Color(0xFFE53E3E);
    return DashboardCard(
      borderColor: color,
      gradient: [
        over ? const Color(0xFFF0FDF4) : const Color(0xFFFEF2F2),
        spec.paper,
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.timer_outlined, size: 16, color: color),
          const SizedBox(height: 6),
          const Text('Remaining',
              style: TextStyle(
                  fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.inkSoft)),
          const SizedBox(height: 2),
          Text(formatCurrency(remaining),
              style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: color)),
          Text(
            over ? 'Target achieved!' : 'more to hit target',
            style: const TextStyle(fontSize: 10, color: AppColors.inkSoft),
          ),
        ],
      ),
    );
  }

  Widget _collectedCard(
      TargetData target, num collected, double progress, FroThemeSpec spec) {
    final highTier = target.collectedHighTier;
    return DashboardCard(
      borderColor: spec.sage,
      gradient: [const Color(0xFFF0FDF4), spec.paper],
      onTap: () {
        Navigator.push(
            context, MaterialPageRoute(builder: (_) => const CollectionsPage()));
      },
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.account_balance_wallet,
                  size: 16, color: AppColors.success),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Collected${target.month != null ? ' · ${_monthLabel(target.month!)}' : ''}',
                  style: const TextStyle(
                      fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.inkSoft),
                ),
              ),
              Text(formatCurrency(collected),
                  style: const TextStyle(
                      fontSize: 22, fontWeight: FontWeight.w800, color: AppColors.success)),
              const Icon(Icons.chevron_right, size: 18, color: AppColors.success),
            ],
          ),
          const SizedBox(height: 6),
          ClipRRect(
            borderRadius: BorderRadius.circular(3),
            child: LinearProgressIndicator(
              value: progress,
              minHeight: 5,
              backgroundColor: spec.line,
              valueColor: AlwaysStoppedAnimation(spec.sage),
            ),
          ),
          if (target.collectedByNgo.length > 1) ...[
            const SizedBox(height: 6),
            Wrap(
              spacing: 4,
              runSpacing: 4,
              children: [
                for (final n in target.collectedByNgo)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: n.ngoId == 'others'
                          ? AppColors.pillYellowBg
                          : AppColors.pillGreenBg,
                      borderRadius: BorderRadius.circular(4),
                      border: Border.all(
                        color: n.ngoId == 'others'
                            ? const Color(0xFFFDE68A)
                            : const Color(0xFFBBF7D0),
                      ),
                    ),
                    child: Text(
                      '${n.ngoName ?? 'NGO'}: ${formatCurrency(n.amount)}',
                      style: TextStyle(
                        fontSize: 9,
                        fontWeight: FontWeight.w600,
                        color: n.ngoId == 'others'
                            ? AppColors.pillYellowText
                            : AppColors.pillGreenText,
                      ),
                    ),
                  ),
              ],
            ),
          ],
          const SizedBox(height: 6),
          DotLine(
            color: highTier > 0 ? AppColors.purple : spec.line,
            text: 'High Tier: ${formatCurrency(highTier)}',
          ),
        ],
      ),
    );
  }

  // ── Row 2 ────────────────────────────────────────────────
  Widget _connectedCard(DashboardData dash, FroThemeSpec spec) {
    final daily = _connectedView == 'daily';
    return DashboardCard(
      borderColor: spec.line,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          CardHeader(
            icon: Icons.people_outline,
            iconColor: daily ? AppColors.blue : spec.sage,
            label: 'Connected',
          ),
          const SizedBox(height: 6),
          TogglePills(
            options: const [('daily', 'Daily'), ('month', 'Monthly')],
            selected: _connectedView,
            onChanged: (v) => setState(() => _connectedView = v),
          ),
          const SizedBox(height: 8),
          Text(
            '${daily ? dash.dailyConnected : (dash.monthlyConnected > 0 ? dash.monthlyConnected : dash.statsContacted)}',
            style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w800,
                color: daily ? AppColors.blue : spec.sage),
          ),
          Text(
            daily ? 'Donors connected today' : 'Donors connected this month',
            style: const TextStyle(fontSize: 10, color: AppColors.inkSoft),
          ),
        ],
      ),
    );
  }

  Widget _collectionCard(DashboardData dash, num collected, FroThemeSpec spec) {
    final today = _donationView == 'today';
    return DashboardCard(
      borderColor: spec.line,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const CardHeader(
            icon: Icons.calendar_today,
            iconColor: AppColors.blue,
            label: 'Collection',
          ),
          const SizedBox(height: 6),
          TogglePills(
            options: const [('today', 'Today'), ('month', 'Monthly')],
            selected: _donationView,
            onChanged: (v) => setState(() => _donationView = v),
          ),
          const SizedBox(height: 8),
          Text(
            formatCurrency(today ? dash.dailyDonations : collected),
            style: const TextStyle(
                fontSize: 18, fontWeight: FontWeight.w800, color: AppColors.blue),
          ),
          Text(
            today
                ? '${dash.dailyDonorCount} donors today'
                : '${dash.monthlyDonorCount} donors this month',
            style: const TextStyle(fontSize: 10, color: AppColors.inkSoft),
          ),
        ],
      ),
    );
  }

  Widget _incentiveCard(TargetData target, FroThemeSpec spec) {
    return DashboardCard(
      borderColor: spec.line,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const CardHeader(
            icon: Icons.star,
            iconColor: AppColors.purple,
            label: 'Incentive',
          ),
          const SizedBox(height: 6),
          Text(
            formatCurrency(target.totalCollectionAki),
            style: const TextStyle(
                fontSize: 18, fontWeight: FontWeight.w800, color: AppColors.purple),
          ),
          const Text('This month',
              style: TextStyle(fontSize: 10, color: AppColors.inkSoft)),
        ],
      ),
    );
  }

  Widget _activeDonorsCard(DashboardData dash, FroThemeSpec spec) {
    final active = _donorStatus == 'active';
    return DashboardCard(
      borderColor: spec.line,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          CardHeader(
            icon: Icons.check_circle_outline,
            iconColor: AppColors.success,
            label: 'Active Donors',
            trailing: TogglePills(
              options: const [('active', 'Active'), ('inactive', 'Inactive')],
              selected: _donorStatus,
              onChanged: (v) => setState(() => _donorStatus = v),
              expand: false,
            ),
          ),
          const SizedBox(height: 6),
          if (active)
            TogglePills(
              options: const [
                ('1', '1M'), ('2', '2M'), ('3', '3M'),
                ('6', '6M'), ('8', '8M'), ('12', '1Y'),
              ],
              selected: _donorView,
              onChanged: _changeDonorView,
            ),
          const SizedBox(height: 8),
          GestureDetector(
            onTap: () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => DonorSplitPage(
                      status: _donorStatus, window: _donorView),
                ),
              );
            },
            child: Row(
              children: [
                Text(
                  '${active ? dash.activeDonors : dash.inactiveDonors}',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                    color: active ? AppColors.purple : AppColors.orange,
                  ),
                ),
                const SizedBox(width: 5),
                Text('donors',
                    style: TextStyle(fontSize: 11, color: spec.inkSoft)),
                const Spacer(),
                Icon(Icons.chevron_right, size: 18, color: spec.inkSoft),
              ],
            ),
          ),
          const SizedBox(height: 2),
          Text(
            active
                ? '${_windowLabel()} · inactive = no donation in past one month'
                : "Didn't donate in the past one month (incl. never donated)",
            style: const TextStyle(fontSize: 9, color: AppColors.inkSoft),
          ),
        ],
      ),
    );
  }

  Widget _assignedCard(DashboardData dash, FroThemeSpec spec) {
    return DashboardCard(
      borderColor: spec.line,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const CardHeader(
            icon: Icons.assignment_outlined,
            iconColor: AppColors.ink,
            label: 'Assigned Data',
          ),
          const SizedBox(height: 6),
          TogglePills(
            options: const [
              ('total', 'Total'), ('ngo', 'NGO'), ('station', 'Station'),
            ],
            selected: _assignedView,
            onChanged: (v) => setState(() => _assignedView = v),
          ),
          const SizedBox(height: 8),
          if (_assignedView == 'total')
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('${dash.statsTotal}',
                    style: const TextStyle(
                        fontSize: 18, fontWeight: FontWeight.w800)),
                const Text('Total donors assigned',
                    style: TextStyle(fontSize: 10, color: AppColors.inkSoft)),
              ],
            )
          else if (_assignedView == 'ngo')
            _assignedList(
              dash.byNgo.map((n) => (n.ngoName ?? 'NGO', '${n.count}')).toList(),
            )
          else
            _assignedList(
              dash.byStation.map((s) => (s.station ?? '—', '${s.count}')).toList(),
            ),
        ],
      ),
    );
  }

  Widget _assignedList(List<(String, String)> rows) {
    if (rows.isEmpty) {
      return const Text('No data',
          style: TextStyle(fontSize: 10, color: AppColors.inkSoft));
    }
    return Column(
      children: [
        for (final (name, count) in rows)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 1),
            child: Row(
              children: [
                Expanded(
                  child: Text(name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          fontSize: 10, color: AppColors.inkSoft)),
                ),
                Text(count,
                    style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700)),
              ],
            ),
          ),
      ],
    );
  }

  // ── Analytics ────────────────────────────────────────────
  Widget _akiCalendarCard(TargetData target, String monthStr, FroThemeSpec spec) {
    return DashboardCard(
      borderColor: spec.line,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const CardHeader(
            icon: Icons.event_available,
            iconColor: AppColors.gold,
            label: 'Incentive Calendar (AKI)',
          ),
          const SizedBox(height: 10),
          AkiCalendar(akiPerDay: target.akiPerDay, monthStr: monthStr),
        ],
      ),
    );
  }

  Widget _requestDataCard(FroThemeSpec spec) {
    return DashboardCard(
      borderColor: spec.line,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Request More Data',
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          const Text('Ask admin for more leads if you are out of work.',
              style: TextStyle(fontSize: 12, color: AppColors.inkSoft)),
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
                      const SnackBar(
                          content: Text('Request sent'),
                          backgroundColor: AppColors.success),
                    );
                  }
                } catch (e) {
                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                          content: Text(e.toString()),
                          backgroundColor: AppColors.danger),
                    );
                  }
                }
              },
            ),
          ),
        ],
      ),
    );
  }

  String _windowLabel() => switch (_donorView) {
        '12' => 'yearly donors',
        '1' => 'monthly donors',
        _ => '$_donorView-month donors',
      };

  String _monthLabel(String v) {
    final parts = v.split('-');
    if (parts.length < 2) return v;
    final y = int.tryParse(parts[0]) ?? 0;
    final m = int.tryParse(parts[1]) ?? 1;
    const names = [
      '', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];
    return '${names[m]} $y';
  }
}
