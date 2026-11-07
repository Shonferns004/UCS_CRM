import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../services/auth_service.dart';
import '../services/call_service.dart';
import '../services/meeting_service.dart';
import '../services/socket_service.dart';
import '../theme.dart';
import '../widgets/gates.dart';
import 'dashboard_page.dart';
import 'donors_page.dart';
import 'lead_incentive_page.dart';
import 'login_page.dart';
import 'my_idle_page.dart';
import 'my_leads_page.dart';
import 'tickets_page.dart';

class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;

  static const _titles = ['Dashboard', 'My Leads', 'Donors'];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _wireSocket());
  }

  void _wireSocket() {
    final socket = context.read<SocketService>();
    final call = context.read<CallService>();
    final auth = context.read<AuthService>();

    socket.onFroPause((p) {
      if (mounted) call.applyPause(p?['by']?.toString());
    });
    socket.onFroResume((_) {
      if (mounted) call.clearPause();
    });
    socket.onFroForceLogout((_) {
      auth.logout();
      call.forceOffline();
      if (mounted) {
        Navigator.of(context).pushAndRemoveUntil(
          MaterialPageRoute(builder: (_) => const LoginPage()),
          (_) => false,
        );
      }
    });
    socket.onFroBroadcast((p) {
      final msg = p?['message']?.toString() ?? p?['text']?.toString();
      if (msg != null && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(msg), backgroundColor: AppColors.sage),
        );
      }
    });
    socket.onFroTeamBroadcast((p) {
      final msg = p?['message']?.toString() ?? p?['text']?.toString();
      if (msg != null && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(msg), backgroundColor: AppColors.sageLight),
        );
      }
    });
    socket.onDbChange(
      table: 'meetings',
      onInsert: (_) => context.read<MeetingService>().refresh(),
      onUpdate: (_, _) => context.read<MeetingService>().refresh(),
      onDelete: (_) => context.read<MeetingService>().refresh(),
    );
    socket.onDbChange(
      table: 'fro_live_status',
      onUpdate: (row, old) {
        if (!mounted || row == null) return;
        final isPaused = row['is_paused'] == true;
        if (isPaused != call.paused) {
          if (isPaused) {
            call.applyPause(row['paused_by']?.toString());
          } else {
            call.clearPause();
          }
        }
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final call = context.watch<CallService>();
    final auth = context.watch<AuthService>();
    final user = auth.user;

    final pages = const [
      DashboardPage(),
      MyLeadsPage(),
      DonorsPage(),
    ];

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 16,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'FRO',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                letterSpacing: 0.5,
                color: AppColors.inkSoft,
              ),
            ),
            Text(
              _titles[_index],
              style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
            ),
          ],
        ),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 4),
            child: StatusPill(status: call.liveStatus, isIdle: call.isIdle),
          ),
          _avatarMenu(user?.name, user?.role),
        ],
      ),
      body: Stack(
        children: [
          IndexedStack(index: _index, children: pages),
          const Positioned.fill(child: IgnorePointer(child: MeetingGate())),
          const Positioned.fill(child: IgnorePointer(child: PauseGate())),
        ],
      ),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _index,
        onTap: _onNavTap,
        items: const [
          BottomNavigationBarItem(icon: Icon(Icons.dashboard), label: 'Dashboard'),
          BottomNavigationBarItem(icon: Icon(Icons.phone), label: 'My Leads'),
          BottomNavigationBarItem(icon: Icon(Icons.card_giftcard), label: 'Donors'),
          BottomNavigationBarItem(icon: Icon(Icons.emoji_events), label: 'Incentive'),
          BottomNavigationBarItem(icon: Icon(Icons.local_activity), label: 'Ticket'),
        ],
      ),
    );
  }

  void _onNavTap(int i) {
    if (i < 3) {
      setState(() => _index = i);
    } else if (i == 3) {
      Navigator.push(
          context, MaterialPageRoute(builder: (_) => const LeadIncentivePage()));
    } else {
      Navigator.push(
          context, MaterialPageRoute(builder: (_) => const TicketsPage()));
    }
  }

  Widget _avatarMenu(String? name, String? role) {
    final initials = (name?.isNotEmpty == true)
        ? name!.split(' ').map((w) => w.isNotEmpty ? w[0] : '').take(2).join().toUpperCase()
        : 'F';
    return PopupMenuButton<String>(
      tooltip: 'Account',
      offset: const Offset(0, 48),
      onSelected: (v) {
        switch (v) {
          case 'idle':
            Navigator.push(
                context, MaterialPageRoute(builder: (_) => const MyIdlePage()));
            break;
          case 'theme':
            _showThemeSheet();
            break;
          case 'logout':
            _confirmLogout(context);
            break;
        }
      },
      itemBuilder: (context) => [
        PopupMenuItem<String>(
          enabled: false,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(name ?? 'FRO',
                  style: const TextStyle(
                      fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.ink)),
              Text(role ?? 'fro',
                  style: const TextStyle(fontSize: 11, color: AppColors.inkSoft)),
            ],
          ),
        ),
        const PopupMenuDivider(),
        const PopupMenuItem<String>(
          value: 'idle',
          child: Row(children: [
            Icon(Icons.access_time, size: 18, color: AppColors.inkSoft),
            SizedBox(width: 8),
            Text('My Idle'),
          ]),
        ),
        const PopupMenuItem<String>(
          value: 'theme',
          child: Row(children: [
            Icon(Icons.palette_outlined, size: 18, color: AppColors.inkSoft),
            SizedBox(width: 8),
            Text('Theme'),
          ]),
        ),
        const PopupMenuDivider(),
        const PopupMenuItem<String>(
          value: 'logout',
          child: Row(children: [
            Icon(Icons.logout, size: 18, color: AppColors.danger),
            SizedBox(width: 8),
            Text('Logout', style: TextStyle(color: AppColors.danger)),
          ]),
        ),
      ],
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12),
        child: CircleAvatar(
          radius: 16,
          backgroundColor: AppColors.sage,
          child: Text(
            initials,
            style: const TextStyle(
                color: Colors.white, fontSize: 12, fontWeight: FontWeight.w700),
          ),
        ),
      ),
    );
  }

  void _showThemeSheet() {
    final theme = context.read<ThemeService>();
    showModalBottomSheet(
      context: context,
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Theme',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
              const SizedBox(height: 16),
              Wrap(
                spacing: 12,
                runSpacing: 14,
                children: [
                  for (final t in froThemes)
                    GestureDetector(
                      onTap: () {
                        theme.setTheme(t.id);
                        Navigator.pop(ctx);
                      },
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Container(
                            width: 44,
                            height: 44,
                            decoration: BoxDecoration(
                              color: t.sage,
                              shape: BoxShape.circle,
                              border: theme.id == t.id
                                  ? Border.all(color: t.ink, width: 3)
                                  : null,
                            ),
                          ),
                          const SizedBox(height: 6),
                          Text(t.name,
                              style: const TextStyle(
                                  fontSize: 10, color: AppColors.inkSoft)),
                        ],
                      ),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
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
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.danger),
            onPressed: () async {
              Navigator.pop(ctx);
              final call = context.read<CallService>();
              final auth = context.read<AuthService>();
              call.forceOffline();
              await auth.logout();
              if (context.mounted) {
                Navigator.of(context).pushAndRemoveUntil(
                  MaterialPageRoute(builder: (_) => const LoginPage()),
                  (_) => false,
                );
              }
            },
            child: const Text('Logout'),
          ),
        ],
      ),
    );
  }
}
