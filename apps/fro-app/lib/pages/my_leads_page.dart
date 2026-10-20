import 'package:flutter/material.dart';

import '../theme.dart';
import '../widgets/perf_strip.dart';
import 'leads_list_page.dart';
import 'queue_page.dart';
import 'suspense_page.dart';

class MyLeadsPage extends StatefulWidget {
  const MyLeadsPage({super.key});

  @override
  State<MyLeadsPage> createState() => _MyLeadsPageState();
}

class _MyLeadsPageState extends State<MyLeadsPage> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        const PerfStrip(),
        Container(
          decoration: const BoxDecoration(
            border: Border(bottom: BorderSide(color: AppColors.line)),
          ),
          child: Row(
            children: [
              _tabBtn('My Leads', 0, 50),
              _tabBtn('All Leads', 1, 25),
              _tabBtn('Suspense', 2, 25),
            ],
          ),
        ),
        Expanded(
          child: IndexedStack(
            index: _tab,
            children: const [
              QueuePane(),
              LeadsListPage(),
              SuspensePane(),
            ],
          ),
        ),
      ],
    );
  }

  Widget _tabBtn(String label, int idx, int pct) {
    final selected = _tab == idx;
    return Expanded(
      child: InkWell(
        onTap: () => setState(() => _tab = idx),
        child: Container(
          height: 40,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            border: Border(
              bottom: BorderSide(
                color: selected ? AppColors.sage : Colors.transparent,
                width: 2,
              ),
            ),
          ),
          child: Text(
            '$label  $pct%',
            style: TextStyle(
              fontSize: 12,
              fontWeight: selected ? FontWeight.w700 : FontWeight.w600,
              color: selected ? AppColors.ink : AppColors.inkSoft,
            ),
          ),
        ),
      ),
    );
  }
}
