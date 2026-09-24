import '../../core/lucide_icons.dart';
import 'dart:convert';
import 'dart:typed_data';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import '../../core/constants/indian_locations.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/app_text_styles.dart';
import '../../core/widgets/app_skeleton.dart';
import '../../core/widgets/app_snackbar.dart';
import '../../core/widgets/section_header.dart';
import '../../services/api_service.dart';
import '../operator/operator_event_page.dart';

class OperatorSetupPage extends StatefulWidget {
  final VoidCallback onComplete;
  const OperatorSetupPage({super.key, required this.onComplete});

  @override
  State<OperatorSetupPage> createState() => _OperatorSetupPageState();
}

class _OperatorSetupPageState extends State<OperatorSetupPage> {
  bool _loading = true;
  bool _saving = false;
  String? _error;

  List<Map<String, dynamic>> _events = [];
  List<Map<String, dynamic>> _kits = [];
  List<Map<String, dynamic>> _organizers = [];
  String? _selectedState;
  String? _selectedCity;
  int? _selectedEventId;
  int? _selectedKitId;
  int? _selectedOrganizerId;
  String? _selfieBase64;
  String? _selfieUrl;

  @override
  void initState() {
    super.initState();
    _loadDashboard();
  }

  Future<void> _loadDashboard() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final body = await ApiService.get('/operator/dashboard');
      if (!mounted) return;
      final events = (body['events'] as List?) ?? [];
      setState(() {
        _events = events.map((e) => Map<String, dynamic>.from(e)).toList();
        _kits = ((body['kits'] as List?) ?? [])
            .map((e) => Map<String, dynamic>.from(e))
            .toList();
        _organizers = ((body['organizers'] as List?) ?? [])
            .map((e) => Map<String, dynamic>.from(e))
            .toList();
        _selectedState = body['state']?.toString();
        _selectedCity = body['city']?.toString();
        final event = body['event'] as Map<String, dynamic>?;
        _selectedEventId =
            event?['id'] != null ? (event?['id'] as num).toInt() : null;
        _selectedKitId = body['kit_id'] != null
            ? (body['kit_id'] as num).toInt()
            : null;
        _selectedOrganizerId = body['organizer_id'] != null
            ? (body['organizer_id'] as num).toInt()
            : null;
        _selfieUrl =
            body['selfie_url']?.toString() ?? body['selfie']?.toString();
        _selfieBase64 = null;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
        _loading = false;
      });
    }
  }

  Future<void> _pickSelfie() async {
    try {
      final result = await FilePicker.platform.pickFiles(
        type: FileType.image,
        withData: true,
      );
      if (result == null || result.files.isEmpty) return;
      final file = result.files.first;
      final Uint8List bytes = file.bytes ?? await file.xFile.readAsBytes();
      if (!mounted) return;
      setState(() {
        _selfieBase64 = base64Encode(bytes);
        _selfieUrl = null;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = 'Could not pick the selfie image. Try again.');
    }
  }

  Future<void> _save() async {
    if (_saving) return;
    if (_selectedState == null ||
        _selectedState!.isEmpty ||
        _selectedCity == null ||
        _selectedCity!.isEmpty) {
      setState(() => _error = 'Please select your state and city to continue.');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      String? selfieUrl = _selfieUrl;
      if (_selfieBase64 != null) {
        final up = await ApiService.post('/operator/selfie', body: {
          'selfie_base64': _selfieBase64,
          'mime_type': 'image/jpeg',
        });
        selfieUrl = up['selfie_url']?.toString();
      }
      await ApiService.post('/operator/self-assign', body: {
        'state': _selectedState,
        'city': _selectedCity,
        'event_id': _selectedEventId,
        'kit_id': _selectedKitId,
        'organizer_id': _selectedOrganizerId,
        'selfie_url': selfieUrl,
      });
      if (!mounted) return;
      widget.onComplete();
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      child: Scaffold(
        body: SafeArea(
          child: _loading
              ? const SkeletonList()
              : SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(24, 16, 24, 32),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('BEING SEVAK',
                          style: AppTextStyles.pageLabel),
                      const SizedBox(height: 8),
                      const Text('Operator Details',
                          style: TextStyle(
                            fontSize: 24,
                            fontWeight: FontWeight.w700,
                            color: AppTheme.textPrimary,
                          )),
                      const SizedBox(height: 6),
                      const Text(
                        'Please tell us about your location for today before you continue.',
                        style: TextStyle(
                            fontSize: 14, color: AppTheme.textSecondary),
                      ),
                      const SizedBox(height: 28),

                      if (_error != null) ...[
                        errorHint(context, _error!),
                        const SizedBox(height: 20),
                      ],

                      const SectionHeader(title: 'Your location today'),
                      const SizedBox(height: 16),

                      DropdownButtonFormField<String>(
                        initialValue: _selectedState,
                        decoration: const InputDecoration(labelText: 'State *'),
                        hint: const Text('Select state'),
                        items: indianStates
                            .map((s) =>
                                DropdownMenuItem(value: s, child: Text(s)))
                            .toList(),
                        isExpanded: true,
                        onChanged: (v) => setState(() => _selectedState = v),
                      ),
                      const SizedBox(height: 16),

                      DropdownButtonFormField<String>(
                        initialValue: _selectedCity,
                        decoration: const InputDecoration(labelText: 'City *'),
                        hint: const Text('Select city'),
                        items: indianCities
                            .map((c) =>
                                DropdownMenuItem(value: c, child: Text(c)))
                            .toList(),
                        isExpanded: true,
                        onChanged: (v) => setState(() => _selectedCity = v),
                      ),
                      const SizedBox(height: 16),

                      DropdownButtonFormField<int>(
                        initialValue: _selectedEventId,
                        decoration: const InputDecoration(labelText: 'Event'),
                        hint: const Text('Select event'),
                        items: (_events.isEmpty
                                ? [
                                    {'id': null, 'title': 'No events yet'}
                                  ]
                                : _events)
                            .map((e) => DropdownMenuItem<int>(
                                value: e['id'] != null
                                    ? (e['id'] as num).toInt()
                                    : null,
                                child: Text(
                                  e['title']?.toString() ?? 'Event',
                                  overflow: TextOverflow.ellipsis,
                                )))
                            .toList(),
                        isExpanded: true,
                        onChanged: (v) =>
                            setState(() => _selectedEventId = v),
                      ),
                      const SizedBox(height: 16),

                      DropdownButtonFormField<int>(
                        initialValue: _selectedKitId,
                        decoration:
                            const InputDecoration(labelText: 'Kit'),
                        hint: const Text('Select kit'),
                        items: _kits
                            .map((k) => DropdownMenuItem<int>(
                                value: k['id'] != null
                                    ? (k['id'] as num).toInt()
                                    : null,
                                child: Text(
                                  k['name']?.toString() ?? 'Kit',
                                  overflow: TextOverflow.ellipsis,
                                )))
                            .toList(),
                        isExpanded: true,
                        onChanged: (v) => setState(() => _selectedKitId = v),
                      ),
                      const SizedBox(height: 16),

                      DropdownButtonFormField<int>(
                        initialValue: _selectedOrganizerId,
                        decoration: const InputDecoration(
                            labelText: 'Organizer'),
                        hint: const Text('Select organizer'),
                        items: _organizers
                            .map((o) => DropdownMenuItem<int>(
                                value: o['id'] != null
                                    ? (o['id'] as num).toInt()
                                    : null,
                                child: Text(
                                  o['name']?.toString() ?? 'Organizer',
                                  overflow: TextOverflow.ellipsis,
                                )))
                            .toList(),
                        isExpanded: true,
                        onChanged: (v) =>
                            setState(() => _selectedOrganizerId = v),
                      ),

                      if (_selectedEventId != null) ...[
                        const SizedBox(height: 10),
                        SizedBox(
                          width: double.infinity,
                          child: OutlinedButton.icon(
                            onPressed: () {
                              final ev = _events.firstWhere(
                                (e) =>
                                    e['id'] != null &&
                                    (e['id'] as num).toInt() ==
                                        _selectedEventId,
                                orElse: () => {
                                  'id': _selectedEventId,
                                  'title': 'Event'
                                },
                              );
                              Navigator.push(
                                context,
                                MaterialPageRoute(
                                  builder: (_) => OperatorEventPage(
                                    eventId: _selectedEventId!,
                                    eventTitle:
                                        ev['title']?.toString() ?? 'Event',
                                  ),
                                ),
                              );
                            },
                            icon: const Icon(LucideIcons.calendar, size: 18),
                            label: const Text('View Event'),
                          ),
                        ),
                      ],

                      const SizedBox(height: 28),
                      const SectionHeader(title: 'Your photo'),
                      const SizedBox(height: 16),

                      Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: AppTheme.surface,
                          borderRadius: AppTheme.radiusCard,
                          boxShadow: AppTheme.cardShadow,
                        ),
                        child: Row(
                          children: [
                            if (_selfieBase64 != null)
                              ClipRRect(
                                borderRadius: BorderRadius.circular(16),
                                child: Image.memory(
                                  base64Decode(_selfieBase64!),
                                  width: 56,
                                  height: 56,
                                  fit: BoxFit.cover,
                                  errorBuilder: (_, _, _) =>
                                      _selfiePlaceholder(),
                                ),
                              )
                            else if (_selfieUrl != null &&
                                _selfieUrl!.isNotEmpty)
                              ClipRRect(
                                borderRadius: BorderRadius.circular(16),
                                child: Image.network(
                                  _selfieUrl!,
                                  width: 56,
                                  height: 56,
                                  fit: BoxFit.cover,
                                  errorBuilder: (_, _, _) =>
                                      _selfiePlaceholder(),
                                ),
                              )
                            else
                              _selfiePlaceholder(),
                            const SizedBox(width: 12),
                            const Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text('Selfie',
                                      style: TextStyle(
                                          fontSize: 14,
                                          fontWeight: FontWeight.w600)),
                                  SizedBox(height: 2),
                                  Text(
                                    'Your photo for today\'s assignment '
                                    '(optional)',
                                    style: TextStyle(
                                        fontSize: 12,
                                        color: AppTheme.textSecondary),
                                  ),
                                ],
                              ),
                            ),
                            TextButton.icon(
                              onPressed: _saving ? null : _pickSelfie,
                              icon: const Icon(LucideIcons.camera, size: 18),
                              label: Text(_selfieBase64 != null
                                  ? 'Change'
                                  : 'Add Selfie'),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 28),

                      SizedBox(
                        width: double.infinity,
                        child: ElevatedButton.icon(
                          onPressed: _saving ? null : _save,
                          icon: _saving
                              ? const SkeletonBox(
                                  width: 18,
                                  height: 18,
                                  borderRadius: 6,
                                  baseColor: Colors.white24,
                                  shineColor: Colors.white,
                                )
                              : const Icon(LucideIcons.arrowRight, size: 18),
                          label: Text(_saving ? 'Saving...' : 'Save & Continue'),
                        ),
                      ),
                    ],
                  ),
                ),
        ),
      ),
    );
  }

  Widget _selfiePlaceholder() {
    return Container(
      width: 56,
      height: 56,
      decoration: BoxDecoration(
        color: AppTheme.surfaceSoft,
        borderRadius: BorderRadius.circular(16),
      ),
      child: const Icon(LucideIcons.user,
          color: AppTheme.textSecondary, size: 26),
    );
  }
}