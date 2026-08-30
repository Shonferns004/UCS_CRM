import 'dart:async';

import 'package:flutter/material.dart';

import 'channel.dart';

class ScraperPage extends StatefulWidget {
  const ScraperPage({super.key});

  @override
  State<ScraperPage> createState() => _ScraperPageState();
}

class _ScraperPageState extends State<ScraperPage> {
  final List<Map<String, dynamic>> _log = [];
  StreamSubscription<Map<dynamic, dynamic>>? _sub;
  bool _connected = false;
  bool _running = false;
  bool _training = false;
  int _trainSteps = 0;
  int _collected = 0;
  String _stage = 'IDLE';
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _sub = ScrapperEvents.events.listen(_onEvent);
    _refreshState();
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }

  Future<void> _refreshState() async {
    final s = await getServiceState();
    final t = await getTrainingState();
    if (!mounted) return;
    setState(() {
      _connected = s['connected'] as bool? ?? false;
      _running = s['running'] as bool? ?? false;
      _training = t['training'] as bool? ?? false;
      _trainSteps = t['steps'] as int? ?? 0;
    });
  }

  void _onEvent(Map<dynamic, dynamic> e) {
    if (!mounted) return;
    final type = e['type']?.toString() ?? '?';
    final msg = switch (type) {
      'stage' || 'started' || 'stopped' => 'stage=${e['stage']}',
      'collected' => 'collected=${e['count']}',
      'warning' => 'WARNING: ${e['message']}',
      'error' => 'ERROR: ${e['message']}',
      'uploading' => 'uploading ${e['count']} (${e['reason']})',
      'done' => 'done ok=${e['payload']}',
      'connected' => 'accessibility service connected',
      'status' => 'status: ${e['message']}',
      'training' => 'training steps=${e['steps']}',
      _ => 'event $type ${e['message']}',
    };
    setState(() {
      if (type == 'training') _trainSteps = (e['steps'] as num?)?.toInt() ?? _trainSteps;
      if (type == 'stage' || type == 'started' || type == 'stopped') {
        _stage = e['stage']?.toString() ?? _stage;
      }
      if (type == 'collected') _collected = (e['count'] as num?)?.toInt() ?? _collected;
      if (type == 'started') _running = true;
      if (type == 'stopped' || (type == 'stage' && _stage == 'IDLE')) _running = false;
      _log.insert(0, {'t': DateTime.now().toIso8601String(), 'm': msg});
      if (_log.length > 80) _log.removeRange(80, _log.length);
    });
  }

  Future<void> _start() async {
    setState(() => _busy = true);
    final r = await startRun();
    if (!mounted) return;
    setState(() => _busy = false);
    final okNow = r['ok'] as bool? ?? true;
    if (!okNow) {
      _log.insert(0, {'t': DateTime.now().toIso8601String(), 'm': r['message']?.toString() ?? 'start failed'});
      setState(() {});
    } else {
      _refreshState();
    }
  }

  Future<void> _stop() async {
    await stopRun();
    _refreshState();
  }

  Future<void> _startTrain() async {
    setState(() => _busy = true);
    final r = await startTraining();
    if (!mounted) return;
    setState(() => _busy = false);
    if (r['ok'] as bool? ?? false) {
      _log.insert(0, {
        't': DateTime.now().toIso8601String(),
        'm': 'TRAINING: do the flow by hand in Google Pay (tap See all transactions, tap a transaction, scroll). Press Stop & save when done.',
      });
      setState(() => _training = true);
    } else {
      _log.insert(0, {
        't': DateTime.now().toIso8601String(),
        'm': r['message']?.toString() ?? 'training start failed',
      });
    }
    _refreshState();
  }

  Future<void> _stopTrain() async {
    setState(() => _busy = true);
    final n = await stopTraining();
    await _refreshState();
    if (!mounted) return;
    setState(() => _busy = false);
    _log.insert(0, {
      't': DateTime.now().toIso8601String(),
      'm': n > 0 ? 'Saved $n trained steps — the next Start run will replay them first.' : 'Nothing recorded, training cleared.',
    });
    setState(() {});
  }

  Color? _colorFor(String m) {
    if (m.startsWith('ERROR')) return Colors.red;
    if (m.startsWith('WARNING')) return Colors.orange;
    return null;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Scraper')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(
                          _connected ? Icons.check_circle : Icons.error,
                          color: _connected ? Colors.green : Theme.of(context).colorScheme.error,
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            _connected
                                ? 'Accessibility service connected'
                                : 'Enable "UCS GPay Scraper" in Settings > Accessibility',
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Icon(
                          _running ? Icons.sync : Icons.stop_circle,
                          color: _running ? Colors.blue : Colors.grey,
                        ),
                        const SizedBox(width: 8),
                        Text('Stage: $_stage'),
                        const Spacer(),
                        Text('Collected: $_collected'),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: FilledButton.icon(
                            onPressed: (_running || _training || _busy) ? null : _startTrain,
                            icon: _training
                                ? const Icon(Icons.fiber_manual_record)
                                : const Icon(Icons.gesture),
                            label: Text(_training ? 'Training…' : 'Start training'),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: (_training && !_busy) ? _stopTrain : null,
                            icon: const Icon(Icons.save),
                            label: const Text('Stop & save'),
                          ),
                        ),
                      ],
                    ),
                    if (_trainSteps > 0)
                      Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: Text(
                          'Saved trained flow: $_trainSteps step(s).',
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                      ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: FilledButton.icon(
                            onPressed: (_running || _busy) ? null : _start,
                            icon: const Icon(Icons.play_arrow),
                            label: const Text('Start run'),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: !_running ? null : _stop,
                            icon: const Icon(Icons.stop),
                            label: const Text('Stop'),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Keep this app open and keep the screen awake — the run triggers while the phone unlocks and opens Google Pay.',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
            child: Row(
              children: [
                const Text('Event log', style: TextStyle(fontWeight: FontWeight.bold)),
                const Spacer(),
                TextButton(onPressed: () => setState(_log.clear), child: const Text('Clear')),
              ],
            ),
          ),
          Expanded(
            child: ListView.builder(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              itemCount: _log.length,
              itemBuilder: (c, i) {
                final e = _log[i];
                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 2),
                  child: Text(
                    '${e['t']}  ${e['m']}',
                    style: TextStyle(
                      fontSize: 12,
                      fontFamily: 'monospace',
                      color: _colorFor(e['m']?.toString() ?? ''),
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}