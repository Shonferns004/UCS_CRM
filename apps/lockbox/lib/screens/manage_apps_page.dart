import 'package:flutter/material.dart';

import '../channel.dart';
import 'apps_picker.dart';

/// Design Screen 09 — Manage Allowed Apps (post-setup). Changes persist live.
class ManageAppsPage extends StatefulWidget {
  const ManageAppsPage({super.key});

  @override
  State<ManageAppsPage> createState() => _ManageAppsPageState();
}

class _ManageAppsPageState extends State<ManageAppsPage> {
  final Set<String> _selected = {};
  late Future<List<InstalledApp>> _apps;
  Future<Set<String>>? _essentials;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final allowlist = await LockBoxChannel.getAllowlist();
    if (!mounted) return;
    setState(() {
      _selected
        ..clear()
        ..addAll(allowlist);
    });
    _apps = LockBoxChannel.getInstalledApps();
    _essentials = LockBoxChannel.getEssentialPackages();
  }

  void _toggle(String pkg) {
    setState(() {
      _selected.contains(pkg) ? _selected.remove(pkg) : _selected.add(pkg);
    });
    LockBoxChannel.saveAllowlist(_selected);
  }

  void _bulk(Set<String> next) {
    setState(() {
      _selected
        ..clear()
        ..addAll(next);
    });
    LockBoxChannel.saveAllowlist(_selected);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Allowed Apps')),
      body: Padding(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 12),
        child: FutureBuilder<Set<String>>(
          future: _essentials,
          builder: (context, snap) {
            final locked = snap.data ?? const <String>{};
            return AppsPicker(
              future: _apps,
              locked: locked,
              selected: _selected,
              onToggle: _toggle,
              onBulkChange: _bulk,
              headerNote:
                  'Apps not on this list are blocked. Changes apply immediately.',
            );
          },
        ),
      ),
    );
  }
}