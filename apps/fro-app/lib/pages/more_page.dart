import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../services/auth_service.dart';
import '../services/call_service.dart';
import '../theme.dart';
import 'lead_incentive_page.dart';
import 'login_page.dart';
import 'my_idle_page.dart';
import 'tickets_page.dart';

class MorePage extends StatelessWidget {
  const MorePage({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthService>();
    final user = auth.user;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.line),
          ),
          child: Row(
            children: [
              CircleAvatar(
                radius: 26,
                backgroundColor: AppColors.sage,
                child: Text(
                  (user?.name?.isNotEmpty == true ? user!.name![0] : 'F').toUpperCase(),
                  style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w800),
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      user?.name ?? 'FRO',
                      style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800),
                    ),
                    Text(
                      user?.role ?? 'fro',
                      style: const TextStyle(fontSize: 12, color: AppColors.inkSoft),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        _item(context, Icons.access_time, 'My Idle', () {
          Navigator.push(context, MaterialPageRoute(builder: (_) => const MyIdlePage()));
        }),
        _item(context, Icons.emoji_events, 'Lead Incentive', () {
          Navigator.push(context, MaterialPageRoute(builder: (_) => const LeadIncentivePage()));
        }),
        _item(context, Icons.local_activity, 'Raise Ticket', () {
          Navigator.push(context, MaterialPageRoute(builder: (_) => const TicketsPage()));
        }),
        const SizedBox(height: 16),
        _item(context, Icons.logout, 'Logout', () {
          showDialog(
            context: context,
            builder: (ctx) => AlertDialog(
              title: const Text('Logout'),
              content: const Text('Are you sure you want to logout?'),
              actions: [
                TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
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
        }, danger: true),
      ],
    );
  }

  Widget _item(BuildContext context, IconData icon, String label, VoidCallback onTap, {bool danger = false}) {
    final color = danger ? AppColors.danger : AppColors.ink;
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.line),
      ),
      child: ListTile(
        leading: Icon(icon, color: color, size: 20),
        title: Text(label, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: color)),
        trailing: const Icon(Icons.chevron_right, size: 20, color: AppColors.inkSoft),
        onTap: onTap,
      ),
    );
  }
}
