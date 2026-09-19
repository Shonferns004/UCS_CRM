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

String? _ngoError;
List<Map<String, dynamic>> _ngos = [];
bool _loadingNgos = false;

String? _selectedProjectId;
String? _savedProjectId;

@override
void initState() {
super.initState();
_load();
_fetchNgos();
}

Future<void> _load() async {
final cfg = await getConfig();

if (!mounted) return;

setState(() {
  _deviceLabel.text =
      cfg['deviceLabel']?.toString() ?? '';

  final pid =
      cfg['projectId']?.toString() ?? '';

  if (pid.isNotEmpty) {
    _setProjectId(pid);
  }
});
}

void _setProjectId(String pid) {
_savedProjectId = pid;

if (_selectedProjectId == null &&
    _ngos.any((n) => _ngoId(n) == pid)) {
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

final valid = _ngos.any(
  (n) => _ngoId(n) == _selectedProjectId,
);

if (valid) return;

if (_savedProjectId != null &&
    _ngos.any(
      (n) => _ngoId(n) == _savedProjectId,
    )) {
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
        Uri.parse(
          '$kBackendUrl/api/accounts/scraper/ngos',
        ),
        headers: {
          'X-Scraper-Key': kScraperKey,
        },
      )
      .timeout(
        const Duration(seconds: 15),
      );

  if (res.statusCode != 200) {
    throw Exception(
      'HTTP ${res.statusCode}: '
      '${res.body.length > 200 ? res.body.substring(0, 200) : res.body}',
    );
  }

  final data =
      jsonDecode(res.body) as Map<String, dynamic>;

  final list =
      (data['ngos'] as List<dynamic>? ?? [])
          .map(
            (e) => Map<String, dynamic>.from(
              e as Map,
            ),
          )
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
await setConfig(
<String, dynamic>{
'deviceLabel':
_deviceLabel.text.trim(),
'projectId':
_selectedProjectId ?? '',
},
);
}

@override
void dispose() {
_deviceLabel.dispose();
super.dispose();
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
      'Setup',
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
      child: ListView(
        padding: const EdgeInsets.fromLTRB(
          20,
          8,
          20,
          30,
        ),
        children: [

          // ─────────────────────────────
          // INTRO
          // ─────────────────────────────

          const Text(
            'Configure your device',
            style: TextStyle(
              fontSize: 28,
              fontWeight: FontWeight.w700,
              letterSpacing: -0.8,
            ),
          ),

          const SizedBox(height: 6),

          Text(
            'Set the phone label and select the NGO project this device belongs to.',
            style: TextStyle(
              fontSize: 14,
              height: 1.45,
              color: Colors.grey.shade600,
            ),
          ),

          const SizedBox(height: 26),

          // ─────────────────────────────
          // PHONE
          // ─────────────────────────────

          const Text(
            'Phone',
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
              borderRadius:
                  BorderRadius.circular(22),
              border: Border.all(
                color: const Color(0xFFE9E9EC),
              ),
            ),
            child: Column(
              crossAxisAlignment:
                  CrossAxisAlignment.start,
              children: [

                Row(
                  children: [

                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: const Color(0xFFF1F1F3),
                        borderRadius:
                            BorderRadius.circular(14),
                      ),
                      child: const Icon(
                        Icons.phone_android_rounded,
                        color: Colors.black87,
                      ),
                    ),

                    const SizedBox(width: 14),

                    const Expanded(
                      child: Column(
                        crossAxisAlignment:
                            CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Device label',
                            style: TextStyle(
                              fontSize: 15,
                              fontWeight:
                                  FontWeight.w600,
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
                  textInputAction:
                      TextInputAction.done,
                  decoration: InputDecoration(
                    hintText:
                        'e.g. BSCT-phone',
                    filled: true,
                    fillColor:
                        const Color(0xFFF7F7F8),
                    prefixIcon: const Icon(
                      Icons.label_outline_rounded,
                    ),
                    border: OutlineInputBorder(
                      borderRadius:
                          BorderRadius.circular(14),
                      borderSide:
                          BorderSide.none,
                    ),
                    enabledBorder:
                        OutlineInputBorder(
                      borderRadius:
                          BorderRadius.circular(14),
                      borderSide:
                          BorderSide.none,
                    ),
                    focusedBorder:
                        OutlineInputBorder(
                      borderRadius:
                          BorderRadius.circular(14),
                      borderSide: BorderSide(
                        color: scheme.primary,
                        width: 1.5,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: 26),

          // ─────────────────────────────
          // NGO / PROJECT
          // ─────────────────────────────

          const Text(
            'NGO / Project',
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
              borderRadius:
                  BorderRadius.circular(22),
              border: Border.all(
                color: const Color(0xFFE9E9EC),
              ),
            ),
            child: Column(
              crossAxisAlignment:
                  CrossAxisAlignment.start,
              children: [

                Row(
                  children: [

                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: const Color(0xFFEAF2FF),
                        borderRadius:
                            BorderRadius.circular(14),
                      ),
                      child: Icon(
                        Icons.business_rounded,
                        color: scheme.primary,
                      ),
                    ),

                    const SizedBox(width: 14),

                    const Expanded(
                      child: Column(
                        crossAxisAlignment:
                            CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Assigned project',
                            style: TextStyle(
                              fontSize: 15,
                              fontWeight:
                                  FontWeight.w600,
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
                  Container(
                    width: double.infinity,
                    padding:
                        const EdgeInsets.symmetric(
                      vertical: 18,
                    ),
                    decoration: BoxDecoration(
                      color:
                          const Color(0xFFF7F7F8),
                      borderRadius:
                          BorderRadius.circular(14),
                    ),
                    child: const Column(
                      children: [
                        SizedBox(
                          width: 22,
                          height: 22,
                          child:
                              CircularProgressIndicator(
                            strokeWidth: 2,
                          ),
                        ),
                        SizedBox(height: 10),
                        Text(
                          'Loading projects...',
                          style: TextStyle(
                            fontSize: 12,
                            color: Colors.grey,
                          ),
                        ),
                      ],
                    ),
                  )
                else if (_ngos.isEmpty)
                  Container(
                    width: double.infinity,
                    padding:
                        const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color:
                          const Color(0xFFFFF7F6),
                      borderRadius:
                          BorderRadius.circular(14),
                      border: Border.all(
                        color:
                            const Color(0xFFFFDDD9),
                      ),
                    ),
                    child: Row(
                      children: [
                        const Icon(
                          Icons
                              .error_outline_rounded,
                          color:
                              Color(0xFFD93025),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            'No NGO projects are available.',
                            style: TextStyle(
                              fontSize: 13,
                              color:
                                  Colors.grey.shade800,
                            ),
                          ),
                        ),
                        IconButton(
                          onPressed: _fetchNgos,
                          icon: const Icon(
                            Icons.refresh_rounded,
                          ),
                        ),
                      ],
                    ),
                  )
                else
                  DropdownButtonFormField<String>(
                    key: ValueKey<String?>(
                      'ngo-${_selectedProjectId ?? ''}',
                    ),
                    initialValue:
                        _selectedProjectId,
                    isExpanded: true,
                    icon: const Icon(
                      Icons
                          .keyboard_arrow_down_rounded,
                    ),
                    items: _ngos.map((n) {
                      final id = _ngoId(n);

                      final name =
                          n['name'] ??
                          n['project_code'] ??
                          'Unknown project';

                      final code =
                          n['project_code'] ??
                          id ??
                          '';

                      return DropdownMenuItem<String>(
                        value: id,
                        child: Text(
                          '$name ($code)',
                          overflow:
                              TextOverflow.ellipsis,
                        ),
                      );
                    }).toList(),
                    onChanged: (v) {
                      setState(() {
                        _selectedProjectId = v;
                      });

                      _autoSave();
                    },
                    decoration:
                        InputDecoration(
                      hintText:
                          'Select NGO / project',
                      filled: true,
                      fillColor:
                          const Color(0xFFF7F7F8),
                      prefixIcon: const Icon(
                        Icons.apartment_rounded,
                      ),
                      border: OutlineInputBorder(
                        borderRadius:
                            BorderRadius.circular(14),
                        borderSide:
                            BorderSide.none,
                      ),
                      enabledBorder:
                          OutlineInputBorder(
                        borderRadius:
                            BorderRadius.circular(14),
                        borderSide:
                            BorderSide.none,
                      ),
                      focusedBorder:
                          OutlineInputBorder(
                        borderRadius:
                            BorderRadius.circular(14),
                        borderSide: BorderSide(
                          color: scheme.primary,
                          width: 1.5,
                        ),
                      ),
                    ),
                  ),

                if (_ngoError != null) ...[
                  const SizedBox(height: 10),

                  Container(
                    padding:
                        const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color:
                          const Color(0xFFFFF7F6),
                      borderRadius:
                          BorderRadius.circular(12),
                    ),
                    child: Row(
                      crossAxisAlignment:
                          CrossAxisAlignment.start,
                      children: [
                        const Icon(
                          Icons
                              .error_outline_rounded,
                          size: 18,
                          color:
                              Color(0xFFD93025),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            _ngoError!,
                            style: const TextStyle(
                              fontSize: 12,
                              height: 1.35,
                              color:
                                  Color(0xFFD93025),
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

          const SizedBox(height: 24),

          // ─────────────────────────────
          // AUTO SAVE
          // ─────────────────────────────

          Container(
            padding: const EdgeInsets.symmetric(
              horizontal: 16,
              vertical: 14,
            ),
            decoration: BoxDecoration(
              color: const Color(0xFFF0F7FF),
              borderRadius:
                  BorderRadius.circular(16),
            ),
            child: Row(
              children: [

                const Icon(
                  Icons.cloud_done_outlined,
                  size: 20,
                  color: Color(0xFF3976D2),
                ),

                const SizedBox(width: 10),

                Expanded(
                  child: Text(
                    'Changes are saved automatically.',
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.grey.shade800,
                    ),
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: 12),

          Text(
            'Backend: $kBackendUrl',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 11,
              color: theme
                  .colorScheme
                  .outline,
            ),
          ),
        ],
      ),
    ),
  ),
);

}
}
