import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../services/auth_service.dart';
import '../services/call_service.dart';
import '../services/meeting_service.dart';
import '../services/socket_service.dart';
import '../theme.dart';
import '../widgets/gates.dart';
import 'dashboard_page.dart';
import 'login_page.dart';
import 'more_page.dart';
import 'my_leads_page.dart';
import 'donors_page.dart';

class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;

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
          SnackBar(
            content: Text(msg),
            backgroundColor: AppColors.sage,
          ),
        );
      }
    });
    socket.onFroTeamBroadcast((p) {
      final msg = p?['message']?.toString() ?? p?['text']?.toString();
      if (msg != null && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(msg),
            backgroundColor: AppColors.sageLight,
          ),
        );
      }
    });
    socket.onDbChange(
      table: 'meetings',
      onInsert: (_) => context.read<MeetingService>().refresh(),
      onUpdate: (_, __) => context.read<MeetingService>().refresh(),
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
      MorePage(),
    ];

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 16,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              user?.name?.isNotEmpty == true ? user!.name! : 'FRO Panel',
              style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 2),
            Row(
              children: [
                StatusPill(status: call.liveStatus, isIdle: call.isIdle),
              ],
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout, size: 20),
            tooltip: 'Logout',
            onPressed: () => _confirmLogout(context),
          ),
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
        onTap: (i) => setState(() => _index = i),
        items: const [
          BottomNavigationBarItem(icon: Icon(Icons.dashboard), label: 'Dashboard'),
          BottomNavigationBarItem(icon: Icon(Icons.phone), label: 'My Leads'),
          BottomNavigationBarItem(icon: Icon(Icons.card_giftcard), label: 'Donors'),
          BottomNavigationBarItem(icon: Icon(Icons.more_horiz), label: 'More'),
        ],
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
