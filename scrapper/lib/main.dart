import 'package:flutter/material.dart';

import 'channel.dart';
import 'inspect_page.dart';
import 'scraper_page.dart';
import 'setup_page.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initChannel();
  runApp(const ScrapperApp());
}

class ScrapperApp extends StatelessWidget {
  const ScrapperApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'UCS GPay Scraper',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF1565C0)),
        useMaterial3: true,
      ),
      home: const HomeShell(),
    );
  }
}

class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;

  static const _pages = [
    ScraperPage(),
    SetupPage(),
    InspectPage(),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: _pages[_index],
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.play_circle_outline), label: 'Scraper'),
          NavigationDestination(icon: Icon(Icons.settings_outlined), label: 'Setup'),
          NavigationDestination(icon: Icon(Icons.bug_report_outlined), label: 'Inspect'),
        ],
      ),
    );
  }
}