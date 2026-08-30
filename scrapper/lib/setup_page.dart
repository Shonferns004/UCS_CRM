import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

import 'api_config.dart';
import 'channel.dart';

class SetupPage extends StatefulWidget {
  const SetupPage({super.key});

  @override
  State<SetupPage> createState() => _SetupPageState();
}

class _SetupPageState extends State<SetupPage> {
  final _formKey = GlobalKey<FormState>();
  final _deviceLabel = TextEditingController();
  final _devicePin = TextEditingController();
  final _gpayPin = TextEditingController();
  final _historyText = TextEditingController();
  final _maxTxCtl = TextEditingController();

  bool _receivedOnly = true;
  String _gpayLockType = 'pin';
  bool _saving = false;
  String? _ngoError;
  List<Map<String, dynamic>> _ngos = [];
  bool _loadingNgos = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final cfg = await getConfig();
    if (!mounted) return;
    setState(() {
      _deviceLabel.text = cfg['deviceLabel']?.toString() ?? '';
      _devicePin.text = cfg['devicePin']?.toString() ?? '';
      _gpayPin.text = cfg['gpayPin']?.toString() ?? '';
      _gpayLockType = cfg['gpayLockType']?.toString() ?? 'pin';
      _historyText.text = cfg['historyText']?.toString() ?? 'All activity';
      _receivedOnly = cfg['receivedOnly'] as bool? ?? true;
      _maxTxCtl.text = (cfg['maxTransactions'] as num?)?.toString() ?? '200';
      final pid = cfg['projectId']?.toString() ?? '';
      if (pid.isNotEmpty) _setProjectId(pid);
    });
  }

  void _setProjectId(String pid) {
    _savedProjectId = pid;
    if (_selectedProjectId == null && _ngos.any((n) => _ngoId(n) == pid)) {
      _selectedProjectId = pid;
    }
    _reconcileSelection();
  }

  String? _ngoId(Map<String, dynamic> n) =>
      (n['id'] ?? n['project_id'])?.toString();

  String? _selectedProjectId;
  String? _savedProjectId;

  void _reconcileSelection() {
    if (_ngos.isEmpty) {
      _selectedProjectId = null;
      return;
    }
    final valid = _ngos.any((n) => _ngoId(n) == _selectedProjectId);
    if (valid) return;
    if (_savedProjectId != null &&
        _ngos.any((n) => _ngoId(n) == _savedProjectId)) {
      _selectedProjectId = _savedProjectId;
    } else {
      _selectedProjectId = _ngoId(_ngos.first);
    }
  }

  Future<void> _fetchNgos() async {
    setState(() {
      _loadingNgos = true;
      _ngoError = null;
    });
    try {
      final res = await http
          .get(Uri.parse('$kBackendUrl/api/accounts/scraper/ngos'), headers: {
        'X-Scraper-Key': kScraperKey,
      }).timeout(const Duration(seconds: 15));
      if (res.statusCode != 200) {
        throw Exception('HTTP ${res.statusCode}: ${res.body.length > 200 ? res.body.substring(0, 200) : res.body}');
      }
      final data = jsonDecode(res.body) as Map<String, dynamic>;
      final list = (data['ngos'] as List<dynamic>? ?? [])
          .map((e) => Map<String, dynamic>.from(e as Map))
          .toList();
      if (!mounted) return;
      setState(() {
        _ngos = list;
        _loadingNgos = false;
        _reconcileSelection();
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loadingNgos = false;
        _ngoError = e.toString();
      });
    }
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _saving = true);
    final cfg = <String, dynamic>{
      'deviceLabel': _deviceLabel.text.trim(),
      'devicePin': _devicePin.text.trim(),
      'gpayPin': _gpayPin.text.trim(),
      'gpayLockType': _gpayLockType,
      'projectId': _selectedProjectId ?? '',
      'receivedOnly': _receivedOnly,
      'maxTransactions': int.tryParse(_maxTxCtl.text) ?? 200,
      'historyText': _historyText.text.trim(),
    };
    await setConfig(cfg);
    if (!mounted) return;
    setState(() => _saving = false);
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Settings saved to this device.')),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Setup')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text('Phone', style: TextStyle(fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                TextFormField(
                  controller: _deviceLabel,
                  decoration: const InputDecoration(
                    labelText: 'Device label (e.g. BSCT-phone)',
                    border: OutlineInputBorder(),
                  ),
                  validator: (v) => (v == null || v.trim().isEmpty) ? 'Required' : null,
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _devicePin,
                  decoration: const InputDecoration(
                    labelText: 'Phone lock PIN',
                    helperText: 'Stored encrypted in Android Keystore',
                    border: OutlineInputBorder(),
                  ),
                  obscureText: true,
                  keyboardType: TextInputType.number,
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _gpayPin,
                  decoration: const InputDecoration(
                    labelText: 'Google Pay passcode',
                    border: OutlineInputBorder(),
                  ),
                  obscureText: true,
                  keyboardType: TextInputType.number,
                  validator: (v) => (_gpayLockType == 'pin' && (v == null || v.trim().isEmpty))
                      ? 'Required when GPay uses a passcode'
                      : null,
                ),
                const SizedBox(height: 12),
                SegmentedButton<String>(
                  segments: const [
                    ButtonSegment(value: 'pin', label: Text('Passcode')),
                    ButtonSegment(value: 'biometric', label: Text('Fingerprint / Face')),
                    ButtonSegment(value: 'none', label: Text('No lock')),
                  ],
                  selected: {_gpayLockType},
                  onSelectionChanged: (s) => setState(() => _gpayLockType = s.first),
                ),
                const SizedBox(height: 6),
                Text(
                  'Passcode: the app types it automatically. Fingerprint/Face: the run waits and prompts you to scan, then continues. No lock: Google Pay opens straight to transactions. For hands-free runs, set a passcode in Google Pay or pick No lock.',
                  style: TextStyle(color: Theme.of(context).colorScheme.outline, fontSize: 12),
                ),
                const SizedBox(height: 20),
                const Text('NGO / project', style: TextStyle(fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: DropdownButtonFormField<String>(
                        key: ValueKey<String?>('ngo-${_selectedProjectId ?? ''}'),
                        initialValue: _selectedProjectId,
                        items: _ngos
                            .map((n) => DropdownMenuItem(
                                  value: _ngoId(n),
                                  child: Text(
                                    '${n['name'] ?? n['project_code']} (${n['project_code'] ?? _ngoId(n)})',
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ))
                            .toList(),
                        onChanged: (v) => setState(() => _selectedProjectId = v),
                        decoration: const InputDecoration(
                          labelText: 'NGO',
                          border: OutlineInputBorder(),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    IconButton.filled(
                      onPressed: _loadingNgos ? null : _fetchNgos,
                      icon: _loadingNgos
                          ? const SizedBox(
                              width: 18, height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.cloud_sync),
                      tooltip: 'Fetch NGO list',
                    ),
                  ],
                ),
                if (_ngoError != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Text(
                      _ngoError!,
                      style: TextStyle(color: Theme.of(context).colorScheme.error, fontSize: 12),
                    ),
                  ),
                const SizedBox(height: 20),
                const Text('Run options', style: TextStyle(fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                TextFormField(
                  controller: _maxTxCtl,
                  decoration: const InputDecoration(
                    labelText: 'Max transactions to collect',
                    helperText: 'Scrolls automatically and stops once it goes before yesterday.',
                    border: OutlineInputBorder(),
                  ),
                  keyboardType: TextInputType.number,
                ),
                const SizedBox(height: 12),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Received transactions only'),
                  value: _receivedOnly,
                  onChanged: (v) => setState(() => _receivedOnly = v),
                ),
                const SizedBox(height: 8),
                TextFormField(
                  controller: _historyText,
                  decoration: const InputDecoration(
                    labelText: 'History link text (optional)',
                    helperText: 'Clickable link to open the full activity list.',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 20),
                FilledButton.icon(
                  onPressed: _saving ? null : _save,
                  icon: const Icon(Icons.save),
                  label: Text(_saving ? 'Saving…' : 'Save on this phone'),
                ),
                const SizedBox(height: 12),
                Text(
                  'Backend: $kBackendUrl (built-in)',
                  style: TextStyle(color: Theme.of(context).colorScheme.outline, fontSize: 12),
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}