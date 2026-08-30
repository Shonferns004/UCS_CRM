import 'dart:async';

import 'package:flutter/material.dart';

import 'channel.dart';

class InspectPage extends StatefulWidget {
  const InspectPage({super.key});

  @override
  State<InspectPage> createState() => _InspectPageState();
}

class _InspectPageState extends State<InspectPage> {
  final List<String> _lines = [];
  StreamSubscription<Map<dynamic, dynamic>>? _sub;
  bool _live = false;
  String _pkg = '';

  @override
  void initState() {
    super.initState();
    _sub = ScrapperEvents.events.listen((e) {
      if (e['type'] == 'inspect' && mounted) {
        setState(() {
          _pkg = e['pkg']?.toString() ?? '';
          _lines
            ..clear()
            ..addAll((e['lines'] as List<dynamic>? ?? []).map((x) => x.toString()));
        });
      }
    });
  }

  @override
  void dispose() {
    setInspect(false);
    _sub?.cancel();
    super.dispose();
  }

  Future<void> _toggleLive(bool on) async {
    setState(() => _live = on);
    await setInspect(on);
  }

  Future<void> _snapshot() async {
    final lines = await inspectNow();
    if (!mounted) return;
    setState(() => _lines
      ..clear()
      ..addAll(lines));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Inspect')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: Row(
              children: [
                Switch(
                  value: _live,
                  onChanged: _toggleLive,
                ),
                const SizedBox(width: 8),
                const Text('Live dump (every second)'),
                const Spacer(),
                IconButton.filledTonal(
                  onPressed: _snapshot,
                  icon: const Icon(Icons.refresh),
                  tooltip: 'Snapshot now',
                ),
              ],
            ),
          ),
          if (_pkg.isNotEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text('Foreground app: $_pkg'),
              ),
            ),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
              child: Card(
                child: Padding(
                  padding: const EdgeInsets.all(8),
                  child: _lines.isEmpty
                      ? const Center(child: Text('No dump yet. Switch on Live dump, or open Google Pay and tap snapshot.'))
                      : ListView.separated(
                          itemCount: _lines.length,
                          separatorBuilder: (_, _) => const Divider(height: 1),
                          itemBuilder: (c, i) => Text(
                            _lines[i],
                            style: const TextStyle(fontSize: 11, fontFamily: 'monospace'),
                          ),
                        ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}