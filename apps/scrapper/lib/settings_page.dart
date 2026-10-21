import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'api_config.dart';
import 'channel.dart';

/// Backend settings: pick a preset or type any URL, then Save.
///
/// The value is written to SharedPreferences by [ApiConfig.setBackend], so it
/// survives restarts and only changes when the user changes it here — the
/// default is never re-applied once a choice is saved.
class SettingsPage extends StatefulWidget {
  const SettingsPage({super.key});

  @override
  State<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends State<SettingsPage> {
  late final TextEditingController _url;
  String _savedUrl = '';

  @override
  void initState() {
    super.initState();
    _savedUrl = ApiConfig.backendUrl;
    _url = TextEditingController(text: _savedUrl);
  }

  @override
  void dispose() {
    _url.dispose();
    super.dispose();
  }

  bool get _dirty => _url.text.trim() != _savedUrl;

  String? _validate(String raw) {
    final v = raw.trim();
    if (v.isEmpty) return 'URL cannot be empty';

    final uri = Uri.tryParse(v);
    if (uri == null || !uri.hasScheme || uri.host.isEmpty) {
      return 'Enter a full URL, e.g. https://example.ngrok-free.dev';
    }
    if (uri.scheme != 'http' && uri.scheme != 'https') {
      return 'Only http:// or https:// are supported';
    }
    return null;
  }

  Future<void> _save() async {
    final err = _validate(_url.text);
    if (err != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(err), backgroundColor: const Color(0xFFD93025)),
      );
      return;
    }

    final value = _url.text.trim();
    await ApiConfig.setBackend(value);

    if (!mounted) return;
    setState(() => _savedUrl = value);

    // The running accessibility service reads backendUrl per-run, so make sure
    // the next run picks up the new value rather than a stale cached one.
    await _syncToNative();

    if (!mounted) return;
    FocusScope.of(context).unfocus();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Backend saved — $value'),
        duration: const Duration(seconds: 2),
      ),
    );
  }

  Future<void> _syncToNative() async {
    try {
      // Re-writing config makes the native side hold the same URL the app
      // uses, so a run started from the overlay matches this setting.
      await setConfig(<String, dynamic>{'backendUrl': ApiConfig.backendUrl});
    } catch (_) {
      // Native side may not be reachable (e.g. running on a desktop target).
    }
  }

  Future<void> _usePreset(Map<String, String> opt) async {
    setState(() => _url.text = opt['url']!);
    await _save();
  }

  void _resetToDefault() {
    setState(() => _url.text = _urlForDefault());
    _save();
  }

  String _urlForDefault() {
    for (final o in kBackendOptions) {
      if (o['id'] == kDefaultBackendId) return o['url']!;
    }
    return kBackendOptions.first['url']!;
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final error = _validate(_url.text);

    return Scaffold(
      backgroundColor: const Color(0xFFF7F7F8),
      appBar: AppBar(
        elevation: 0,
        backgroundColor: const Color(0xFFF7F7F8),
        surfaceTintColor: Colors.transparent,
        titleSpacing: 20,
        title: const Text(
          'Settings',
          style: TextStyle(
            fontSize: 24,
            fontWeight: FontWeight.w700,
            letterSpacing: -0.5,
          ),
        ),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 30),
          children: [
            const Text(
              'Backend',
              style: TextStyle(
                fontSize: 28,
                fontWeight: FontWeight.w700,
                letterSpacing: -0.8,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'Where this scraper sends data. Saved on this device and kept '
              'until you change it again.',
              style: TextStyle(
                fontSize: 14,
                height: 1.45,
                color: Colors.grey.shade600,
              ),
            ),
            const SizedBox(height: 26),

            // ── Presets ─────────────────────────────────────────────
            ...kBackendOptions.map((o) {
              final selected = o['url'] == _savedUrl;
              return Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Material(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(22),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(22),
                    onTap: () => _usePreset(o),
                    child: Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(18),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(22),
                        border: Border.all(
                          color: selected
                              ? scheme.primary
                              : const Color(0xFFE9E9EC),
                          width: selected ? 1.6 : 1,
                        ),
                      ),
                      child: Row(
                        children: [
                          Container(
                            width: 44,
                            height: 44,
                            decoration: BoxDecoration(
                              color: selected
                                  ? scheme.primary.withValues(alpha: 0.10)
                                  : const Color(0xFFF1F1F3),
                              borderRadius: BorderRadius.circular(14),
                            ),
                            child: Icon(
                              o['id'] == 'local'
                                  ? Icons.wifi_rounded
                                  : Icons.cloud_rounded,
                              color:
                                  selected ? scheme.primary : Colors.black87,
                            ),
                          ),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  o['label']!,
                                  style: const TextStyle(
                                    fontSize: 15,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                                const SizedBox(height: 3),
                                Text(
                                  o['url']!,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    fontSize: 12,
                                    color: Colors.grey,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 8),
                          if (selected)
                            Icon(Icons.check_circle_rounded,
                                color: scheme.primary, size: 22),
                        ],
                      ),
                    ),
                  ),
                ),
              );
            }),

            const SizedBox(height: 16),

            // ── Custom URL ──────────────────────────────────────────
            const Text(
              'Custom URL',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 10),

            TextField(
              controller: _url,
              keyboardType: TextInputType.url,
              autocorrect: false,
              enableSuggestions: false,
              inputFormatters: [
                FilteringTextInputFormatter.deny(RegExp(r'\s')),
              ],
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(
                hintText: 'https://your-tunnel.ngrok-free.dev',
                helperText: error ?? 'Applied when you tap Save.',
                helperStyle: TextStyle(
                  color: error == null ? Colors.grey : const Color(0xFFD93025),
                ),
                errorText: null,
                filled: true,
                fillColor: const Color(0xFFF7F7F8),
                prefixIcon: const Icon(Icons.link_rounded),
                suffixIcon: _url.text.isEmpty
                    ? null
                    : IconButton(
                        tooltip: 'Clear',
                        icon: const Icon(Icons.close_rounded, size: 18),
                        onPressed: () {
                          _url.clear();
                          setState(() {});
                        },
                      ),
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
                  borderSide: BorderSide(
                    color:
                        error == null ? scheme.primary : const Color(0xFFD93025),
                    width: 1.5,
                  ),
                ),
              ),
            ),

            const SizedBox(height: 16),

            // ── Save ────────────────────────────────────────────────
            Row(
              children: [
                Expanded(
                  child: FilledButton.icon(
                    onPressed: _dirty && error == null ? _save : null,
                    icon: const Icon(Icons.save_rounded, size: 18),
                    label: const Text('Save'),
                    style: FilledButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 15),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                OutlinedButton(
                  onPressed: _resetToDefault,
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(
                        vertical: 15, horizontal: 14),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                  child: const Text('Default'),
                ),
              ],
            ),

            const SizedBox(height: 24),

            // ── Status ──────────────────────────────────────────────
            Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              decoration: BoxDecoration(
                color: const Color(0xFFF0F7FF),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Row(
                children: [
                  Icon(
                    _dirty ? Icons.edit_rounded : Icons.cloud_done_outlined,
                    size: 20,
                    color: const Color(0xFF3976D2),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      _dirty
                          ? 'Unsaved changes — tap Save to apply.'
                          : 'Active backend: $_savedUrl',
                      style: TextStyle(
                        fontSize: 12,
                        height: 1.4,
                        color: Colors.grey.shade800,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
