import 'package:flutter/material.dart';
import 'dart:convert';
import 'dart:typed_data';
import 'package:file_picker/file_picker.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../../../core/theme/app_theme.dart';
import '../../../services/api_service.dart';

const List<String> _indianStates = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
  'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan',
  'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh',
  'Uttarakhand', 'West Bengal', 'Delhi', 'Jammu & Kashmir', 'Puducherry',
  'Chandigarh',
];

const List<String> _indianCities = [
  'Mumbai', 'Delhi', 'Bengaluru', 'Hyderabad', 'Ahmedabad', 'Chennai',
  'Kolkata', 'Pune', 'Jaipur', 'Surat', 'Lucknow', 'Kanpur', 'Nagpur',
  'Indore', 'Thane', 'Bhopal', 'Visakhapatnam', 'Patna', 'Vadodara',
  'Ghaziabad', 'Ludhiana', 'Agra', 'Nashik', 'Faridabad', 'Meerut',
  'Rajkot', 'Varanasi', 'Srinagar', 'Aurangabad', 'Dhanbad', 'Amritsar',
  'Navi Mumbai', 'Allahabad', 'Ranchi', 'Howrah', 'Coimbatore', 'Jabalpur',
  'Gwalior', 'Vijayawada', 'Jodhpur', 'Madurai', 'Raipur', 'Kota',
  'Guwahati', 'Chandigarh', 'Solapur', 'Hubli', 'Mysuru', 'Tiruchirappalli',
  'Bareilly', 'Aligarh', 'Tiruppur', 'Moradabad', 'Bhubaneswar', 'Salem',
];

class OperatorDashboardCard extends StatefulWidget {
  const OperatorDashboardCard({super.key});

  @override
  State<OperatorDashboardCard> createState() => _OperatorDashboardCardState();
}

class _OperatorDashboardCardState extends State<OperatorDashboardCard> {
  Map<String, dynamic>? _data;
  bool _loading = true;
  bool _saving = false;
  String? _error;
  String? _savedMessage;

  // Selected dropdown values.
  String? _selectedState;
  String? _selectedCity;
  int? _selectedEventId;
  String? _selfieBase64;
  String? _selfieUrl;

  @override
  void initState() {
    super.initState();
    _loadDashboard();
  }

  Future<Map<String, String>> _headers() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('volunteer_token');
    return {
      'Content-Type': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };
  }

  Future<Map<String, dynamic>> _get(String path) async {
    final uri = Uri.parse('${ApiService.baseUrl}$path');
    final res = await http
        .get(uri, headers: await _headers())
        .timeout(const Duration(seconds: 15));
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    if (res.statusCode != 200 && res.statusCode != 201) {
      throw Exception(body['message'] ?? 'Request failed (${res.statusCode})');
    }
    return body;
  }

  Future<Map<String, dynamic>> _post(String path, Map<String, dynamic> data) async {
    final uri = Uri.parse('${ApiService.baseUrl}$path');
    final res = await http
        .post(uri, headers: await _headers(), body: jsonEncode(data))
        .timeout(const Duration(seconds: 30));
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    if (res.statusCode != 200 && res.statusCode != 201) {
      throw Exception(body['message'] ?? 'Request failed (${res.statusCode})');
    }
    return body;
  }

  Future<void> _loadDashboard() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final body = await _get('/operator/dashboard');
      if (!mounted) return;
      setState(() {
        _data = body;
        _selectedState = body['state']?.toString();
        _selectedCity = body['city']?.toString();
        final event = body['event'] as Map<String, dynamic>?;
        _selectedEventId = event?['id'] != null ? (event!['id'] as num).toInt() : null;
        _selfieUrl = body['selfie_url']?.toString() ?? body['selfie']?.toString();
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
    setState(() {
      _saving = true;
      _savedMessage = null;
      _error = null;
    });
    try {
      String? selfieUrl = _selfieUrl;
      if (_selfieBase64 != null) {
        final up = await _post('/operator/selfie', {
          'selfie_base64': _selfieBase64,
          'mime_type': 'image/jpeg',
        });
        selfieUrl = up['selfie_url']?.toString();
      }
      await _post('/operator/self-assign', {
        'state': _selectedState,
        'city': _selectedCity,
        'event_id': _selectedEventId,
        'selfie_url': selfieUrl,
      });
      await _loadDashboard();
      if (!mounted) return;
      setState(() => _savedMessage = 'Assignment saved for today.');
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final data = _data;
    final operator = (data?['operator'] as Map<String, dynamic>?);
    final operatorName = operator?['name'] ?? 'Operator';
    final events = (data?['events'] as List?)?.map((e) => Map<String, dynamic>.from(e)).toList() ?? [];

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppTheme.outline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'OPERATOR DASHBOARD',
            style: TextStyle(
              fontSize: 10,
              letterSpacing: 2,
              color: AppTheme.primary,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            operatorName,
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 14),

          if (_loading)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 8),
              child: Center(
                child: SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              ),
            )
          else if (_error != null && data == null)
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _error!,
                  style: const TextStyle(fontSize: 12.5, color: AppTheme.error),
                ),
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  onPressed: _loadDashboard,
                  icon: const Icon(Icons.refresh, size: 18),
                  label: const Text('Retry'),
                ),
              ],
            )
          else ...[
            Row(
              children: [
                Expanded(
                  child: _dropdown<String>(
                    label: 'State',
                    value: _selectedState,
                    items: _indianStates
                        .map((s) => DropdownMenuItem(value: s, child: Text(s)))
                        .toList(),
                    hint: 'Select state',
                    onChanged: (v) => setState(() => _selectedState = v),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _dropdown<String>(
                    label: 'City',
                    value: _selectedCity,
                    items: _indianCities
                        .map((c) => DropdownMenuItem(value: c, child: Text(c)))
                        .toList(),
                    hint: 'Select city',
                    onChanged: (v) => setState(() => _selectedCity = v),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),

            _dropdown<int>(
              label: 'Event',
              value: _selectedEventId,
              items: (events.isEmpty
                      ? [
                          {'id': null, 'title': 'No events yet'}
                        ]
                      : events)
                  .map((e) => DropdownMenuItem<int>(
                        value: e['id'] != null
                            ? (e['id'] as num).toInt()
                            : null,
                        child: Text(
                          e['title']?.toString() ?? 'Event',
                          overflow: TextOverflow.ellipsis,
                        ),
                      ))
                  .toList(),
              hint: 'Select event',
              onChanged: (v) => setState(() => _selectedEventId = v),
            ),
            const SizedBox(height: 14),

            // Selfie
            Row(
              children: [
                if (_selfieBase64 != null)
                  ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: Image.memory(
                      base64Decode(_selfieBase64!),
                      width: 56,
                      height: 56,
                      fit: BoxFit.cover,
                      errorBuilder: (_, _, _) => _selfiePlaceholder(),
                    ),
                  )
                else if (_selfieUrl != null && _selfieUrl!.isNotEmpty)
                  ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: Image.network(
                      _selfieUrl!,
                      width: 56,
                      height: 56,
                      fit: BoxFit.cover,
                      errorBuilder: (_, _, _) => _selfiePlaceholder(),
                    ),
                  )
                else
                  _selfiePlaceholder(),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Selfie',
                        style:
                            TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                      ),
                      const SizedBox(height: 2),
                      const Text(
                        'Your photo for today\'s assignment',
                        style: TextStyle(
                            fontSize: 11, color: AppTheme.textSecondary),
                      ),
                    ],
                  ),
                ),
                TextButton.icon(
                  onPressed: _saving ? null : _pickSelfie,
                  icon: const Icon(Icons.photo_camera, size: 18),
                  label: Text(_selfieBase64 != null ? 'Change' : 'Add Selfie'),
                ),
              ],
            ),
            const SizedBox(height: 14),

            if (_savedMessage != null) ...[
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: AppTheme.success.withAlpha(15),
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(color: AppTheme.success),
                ),
                child: Text(
                  _savedMessage!,
                  style: const TextStyle(
                      fontSize: 12.5, color: AppTheme.success),
                ),
              ),
              const SizedBox(height: 10),
            ],
            if (_error != null && data != null) ...[
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: AppTheme.error.withAlpha(12),
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(color: AppTheme.error),
                ),
                child: Text(
                  _error!,
                  style: const TextStyle(fontSize: 12.5, color: AppTheme.error),
                ),
              ),
              const SizedBox(height: 10),
            ],

            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: _saving ? null : _save,
                icon: _saving
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Colors.white),
                      )
                    : const Icon(Icons.check, size: 18),
                label: Text(_saving ? 'Saving...' : 'Save Today\'s Assignment'),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _selfiePlaceholder() {
    return Container(
      width: 56,
      height: 56,
      decoration: BoxDecoration(
        color: AppTheme.outline,
        borderRadius: BorderRadius.circular(8),
      ),
      child: const Icon(Icons.person, color: AppTheme.textSecondary, size: 30),
    );
  }

  Widget _dropdown<T>({
    required String label,
    required T? value,
    required List<DropdownMenuItem<T>> items,
    required String hint,
    required ValueChanged<T?> onChanged,
  }) {
    return DropdownButtonFormField<T>(
      initialValue: value,
      decoration: InputDecoration(labelText: label),
      hint: Text(hint, style: const TextStyle(fontSize: 13)),
      items: items,
      isExpanded: true,
      onChanged: onChanged,
    );
  }
}