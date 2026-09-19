import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

import 'api_config.dart';
import 'channel.dart';

class ScraperPage extends StatefulWidget {
  const ScraperPage({super.key});

  @override
  State<ScraperPage> createState() => _ScraperPageState();
}

class _ScraperPageState extends State<ScraperPage> {
  StreamSubscription<Map<dynamic, dynamic>>? _sub;
  Timer? _poll;
  bool _connected = false;
  bool _overlayEnabled = false;
  double _overlayOpacity = 1.0;
  String _lastCapture = '';

  final _formKey = GlobalKey<FormState>();
  final _deviceLabel = TextEditingController();
  String? _ngoError;
  List<Map<String, dynamic>> _ngos = [];
  bool _loadingNgos = false;
  String? _selectedProjectId;
  String? _savedProjectId;

  @override
  void initState() {
    super.initState();
    _sub = ScrapperEvents.events.listen(_onEvent);
    _refreshState();
    _load();
    _fetchNgos();
    _poll = Timer.periodic(
      const Duration(seconds: 2),
      (_) => _refreshState(),
    );
  }

  @override
  void dispose() {
    _poll?.cancel();
    _sub?.cancel();
    _deviceLabel.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final cfg = await getConfig();
    if (!mounted) return;
    setState(() {
      _deviceLabel.text = cfg['deviceLabel']?.toString() ?? '';
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

  void _reconcileSelection() {
    if (_ngos.isEmpty) {
      _selectedProjectId = null;
      return;
    }
    final valid = _ngos.any((n) => _ngoId(n) == _selectedProjectId);
    if (valid) return;
    if (_savedProjectId != null && _ngos.any((n) => _ngoId(n) == _savedProjectId)) {
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
          .get(
            Uri.parse('$kBackendUrl/api/accounts/scraper/ngos'),
            headers: {'X-Scraper-Key': kScraperKey},
          )
          .timeout(const Duration(seconds: 15));
      if (res.statusCode != 200) {
        throw Exception('HTTP ${res.statusCode}: '
            '${res.body.length > 200 ? res.body.substring(0, 200) : res.body}');
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

  Future<void> _autoSave() async {
    await setConfig(<String, dynamic>{
      'deviceLabel': _deviceLabel.text.trim(),
      'projectId': _selectedProjectId ?? '',
    });
  }

  Future<void> _openAccessibility() async {
    await openAccessibilitySettings();
    Future.delayed(
      const Duration(milliseconds: 500),
      _refreshState,
    );
  }

  Future<void> _toggleOverlay(bool on) async {
    await setOverlay(on);
    _refreshState();
  }

  Future<void> _changeOpacity(double value) async {
    setState(() => _overlayOpacity = value);
    await setOverlayOpacity(value);
  }

  Future<void> _refreshState() async {
    final s = await getServiceState();
    final o = await getOverlayState();

    if (!mounted) return;

    setState(() {
      _connected = s['connected'] as bool? ?? false;
      _overlayEnabled = o['enabled'] as bool? ?? false;
      final op = o['overlayOpacity'];
      if (op is num) _overlayOpacity = op.toDouble();
    });
  }

  void _onEvent(Map<dynamic, dynamic> e) {
    if (!mounted) return;

    final type = e['type']?.toString() ?? '?';

    if (type == 'captured') {
      final msg = '${e['message']}';
      final added = e['added'] == true;
      setState(() {
        _lastCapture = msg;
      });
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          SnackBar(
            content: Text(
              added ? 'Imported successfully' : msg,
              style: const TextStyle(fontSize: 13),
            ),
            backgroundColor: added
                ? const Color(0xFF1B8A4B)
                : const Color(0xFF3A3A3A),
            duration: const Duration(seconds: 2),
          ),
        );
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    return Scaffold(
      backgroundColor: const Color(0xFFF7F7F8),
      appBar: AppBar(
        elevation: 0,
        backgroundColor: const Color(0xFFF7F7F8),
        surfaceTintColor: Colors.transparent,
        titleSpacing: 20,
        title: const Text(
          'Scraper',
          style: TextStyle(
            fontSize: 24,
            fontWeight: FontWeight.w700,
            letterSpacing: -0.5,
          ),
        ),
      ),

      body: SafeArea(
        child: Form(
          key: _formKey,
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 30),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [

              // ──────────────────────────────
              // CAPTURE SECTION
              // ──────────────────────────────
              const Text(
                'Capture',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  letterSpacing: -0.2,
                ),
              ),

              const SizedBox(height: 10),

              Container(
                width: double.infinity,
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(22),
                  border: Border.all(
                    color: const Color(0xFFE9E9EC),
                  ),
                ),
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 18,
                    vertical: 8,
                  ),
                  child: Column(
                    children: [
                      Row(
                        children: [

                      Container(
                        width: 44,
                        height: 44,
                        decoration: BoxDecoration(
                          color: _overlayEnabled
                              ? const Color(0xFFEAF2FF)
                              : const Color(0xFFF1F1F3),
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: Icon(
                          Icons.layers_rounded,
                          color: _overlayEnabled
                              ? scheme.primary
                              : Colors.grey.shade600,
                        ),
                      ),

                      const SizedBox(width: 14),

                      Expanded(
                        child: Column(
                          crossAxisAlignment:
                              CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'Capture overlay',
                              style: TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            const SizedBox(height: 3),
                            Text(
                              _overlayEnabled
                                  ? 'Floating capture button is active'
                                  : 'Show the floating capture button',
                              style: TextStyle(
                                fontSize: 12,
                                color: Colors.grey.shade600,
                              ),
                            ),
                          ],
                        ),
                      ),

                      Switch.adaptive(
                        value: _overlayEnabled,
                        onChanged: _toggleOverlay,
                      ),
                        ],
                      ),

                      const SizedBox(height: 6),

                      Row(
                        children: [
                          const Icon(
                            Icons.opacity_rounded,
                            size: 18,
                            color: Color(0xFF3976D2),
                          ),
                          const SizedBox(width: 8),
                          const Expanded(
                            child: Text(
                              'Overlay opacity',
                              style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                          Text(
                            '${(_overlayOpacity * 100).round()}%',
                            style: const TextStyle(
                              fontSize: 13,
                              color: Color(0xFF3976D2),
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                      Slider(
                        value: _overlayOpacity,
                        min: 0.2,
                        max: 1.0,
                        onChanged: _changeOpacity,
                      ),
                    ],
                  ),
                ),
              ),

                // ──────────────────────────────
                // STATUS HEADER (only when disconnected)
                // ──────────────────────────────
                if (!_connected) ...[
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(24),
                  border: Border.all(
                    color: const Color(0xFFE9E9EC),
                  ),
                  boxShadow: const [
                    BoxShadow(
                      blurRadius: 20,
                      offset: Offset(0, 6),
                      color: Color(0x0A000000),
                    ),
                  ],
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [

                    Row(
                      children: [
                        Container(
                          width: 44,
                          height: 44,
                          decoration: BoxDecoration(
                            color: _connected
                                ? const Color(0xFFE9F8EF)
                                : const Color(0xFFFFEEEE),
                            borderRadius: BorderRadius.circular(14),
                          ),
                          child: Icon(
                            _connected
                                ? Icons.check_rounded
                                : Icons.priority_high_rounded,
                            color: _connected
                                ? const Color(0xFF1B8A4B)
                                : const Color(0xFFD93025),
                            size: 24,
                          ),
                        ),

                        const SizedBox(width: 14),

                        Expanded(
                          child: Column(
                            crossAxisAlignment:
                                CrossAxisAlignment.start,
                            children: [
                              Text(
                                _connected
                                    ? 'Service connected'
                                    : 'Service disconnected',
                                style: const TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              const SizedBox(height: 3),
                              Text(
                                _connected
                                    ? 'Ready to capture transactions'
                                    : 'Accessibility service is turned off',
                                style: TextStyle(
                                  fontSize: 13,
                                  color: Colors.grey.shade600,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),

                    if (!_connected) ...[
                      const SizedBox(height: 18),

                      Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: const Color(0xFFFFF7F6),
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(
                            color: const Color(0xFFFFDDD9),
                          ),
                        ),
                        child: Column(
                          crossAxisAlignment:
                              CrossAxisAlignment.start,
                          children: [

                            Row(
                              crossAxisAlignment:
                                  CrossAxisAlignment.start,
                              children: [
                                const Icon(
                                  Icons.info_outline_rounded,
                                  size: 20,
                                  color: Color(0xFFD93025),
                                ),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Text(
                                    'The scraper needs the "UCS GPay Scraper" accessibility service to read and control the screen automatically.',
                                    style: TextStyle(
                                      fontSize: 13,
                                      height: 1.45,
                                      color: Colors.grey.shade800,
                                    ),
                                  ),
                                ),
                              ],
                            ),

                            const SizedBox(height: 14),

                            SizedBox(
                              width: double.infinity,
                              child: FilledButton(
                                onPressed: _openAccessibility,
                                style: FilledButton.styleFrom(
                                  minimumSize:
                                      const Size.fromHeight(48),
                                  shape: RoundedRectangleBorder(
                                    borderRadius:
                                        BorderRadius.circular(14),
                                  ),
                                ),
                                child: const Text(
                                  'Open accessibility settings',
                                  style: TextStyle(
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ],
                ),
              ),
                ],

              const SizedBox(height: 24),

                // ──────────────────────────────
                // DEVICE SETUP
                // ──────────────────────────────
                const Text(
                  'Configure your device',
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w700,
                    letterSpacing: -0.5,
                  ),
                ),

                const SizedBox(height: 6),

                Text(
                  'Set the phone label and select the NGO project this device belongs to.',
                  style: TextStyle(
                    fontSize: 13,
                    height: 1.4,
                    color: Colors.grey.shade600,
                  ),
                ),

                const SizedBox(height: 18),

                // Device label field
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(18),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(22),
                    border: Border.all(color: const Color(0xFFE9E9EC)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Container(
                            width: 44,
                            height: 44,
                            decoration: BoxDecoration(
                              color: const Color(0xFFF1F1F3),
                              borderRadius: BorderRadius.circular(14),
                            ),
                            child: const Icon(
                              Icons.phone_android_rounded,
                              color: Colors.black87,
                            ),
                          ),
                          const SizedBox(width: 14),
                          const Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'Device label',
                                  style: TextStyle(
                                    fontSize: 15,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                                SizedBox(height: 3),
                                Text(
                                  'Give this phone a recognizable name',
                                  style: TextStyle(
                                    fontSize: 12,
                                    color: Colors.grey,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      TextFormField(
                        controller: _deviceLabel,
                        onChanged: (v) {
                          setState(() {});
                          _autoSave();
                        },
                        textInputAction: TextInputAction.done,
                        decoration: InputDecoration(
                          hintText: 'e.g. BSCT-phone',
                          filled: true,
                          fillColor: const Color(0xFFF7F7F8),
                          prefixIcon: const Icon(Icons.label_outline_rounded),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(14),
                            borderSide: BorderSide.none,
                          ),
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(14),
                            borderSide: BorderSide.none,
                          ),
                          focusedBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(14),
                            borderSide: BorderSide(color: scheme.primary, width: 1.5),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 18),

                // NGO / project picker
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(18),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(22),
                    border: Border.all(color: const Color(0xFFE9E9EC)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Container(
                            width: 44,
                            height: 44,
                            decoration: BoxDecoration(
                              color: const Color(0xFFEAF2FF),
                              borderRadius: BorderRadius.circular(14),
                            ),
                            child: Icon(Icons.business_rounded, color: scheme.primary),
                          ),
                          const SizedBox(width: 14),
                          const Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'Assigned project',
                                  style: TextStyle(
                                    fontSize: 15,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                                SizedBox(height: 3),
                                Text(
                                  'Select the NGO using this device',
                                  style: TextStyle(
                                    fontSize: 12,
                                    color: Colors.grey,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      if (_loadingNgos)
                        Row(
                          children: [
                            const SizedBox(
                              width: 22,
                              height: 22,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            ),
                            const SizedBox(width: 10),
                            Text(
                              'Loading projects...',
                              style: TextStyle(fontSize: 13, color: Colors.grey),
                            ),
                          ],
                        )
                      else if (_ngos.isEmpty)
                        Row(
                          children: [
                            const Icon(Icons.error_outline_rounded, color: Color(0xFFD93025)),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Text(
                                _ngoError != null ? 'Failed to load projects.' : 'No NGO projects are available.',
                                style: TextStyle(fontSize: 13, color: Colors.grey.shade800),
                              ),
                            ),
                            IconButton(
                              onPressed: _fetchNgos,
                              icon: const Icon(Icons.refresh_rounded),
                            ),
                          ],
                        )
                      else
                        DropdownButtonFormField<String>(
                          key: ValueKey<String?>('ngo-${_selectedProjectId ?? ''}'),
                          initialValue: _selectedProjectId,
                          isExpanded: true,
                          icon: const Icon(Icons.keyboard_arrow_down_rounded),
                          items: _ngos.map((n) {
                            final id = _ngoId(n);
                            final name = n['name'] ?? n['project_code'] ?? 'Unknown project';
                            final code = n['project_code'] ?? id ?? '';
                            return DropdownMenuItem<String>(
                              value: id,
                              child: Text('$name ($code)', overflow: TextOverflow.ellipsis),
                            );
                          }).toList(),
                          onChanged: (v) {
                            setState(() => _selectedProjectId = v);
                            _autoSave();
                          },
                          decoration: InputDecoration(
                            hintText: 'Select NGO / project',
                            filled: true,
                            fillColor: const Color(0xFFF7F7F8),
                            prefixIcon: const Icon(Icons.apartment_rounded),
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(14),
                              borderSide: BorderSide.none,
                            ),
                            enabledBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(14),
                              borderSide: BorderSide.none,
                            ),
                            focusedBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(14),
                              borderSide: BorderSide(color: scheme.primary, width: 1.5),
                            ),
                          ),
                        ),
                    ],
                  ),
                ),

                const SizedBox(height: 24),

              // ──────────────────────────────
              // LAST CAPTURE
              // ──────────────────────────────
              if (_lastCapture.isNotEmpty) ...[
                const SizedBox(height: 24),

                const Text(
                  'Latest activity',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                  ),
                ),

                const SizedBox(height: 10),

                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(18),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(22),
                    border: Border.all(
                      color: const Color(0xFFE9E9EC),
                    ),
                  ),
                  child: Row(
                    crossAxisAlignment:
                        CrossAxisAlignment.start,
                    children: [

                      Container(
                        width: 40,
                        height: 40,
                        decoration: BoxDecoration(
                          color: const Color(0xFFEAF7EF),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: const Icon(
                          Icons.check_rounded,
                          color: Color(0xFF1B8A4B),
                          size: 22,
                        ),
                      ),

                      const SizedBox(width: 12),

                      Expanded(
                        child: Text(
                          _lastCapture,
                          style: const TextStyle(
                            fontSize: 13,
                            height: 1.45,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    ),
    );
  }
}
