import 'package:flutter/material.dart';

import 'channel.dart';
import 'scraper_page.dart';

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
  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: ScraperPage(),
    );
  }
}