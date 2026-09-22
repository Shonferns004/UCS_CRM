import '../../core/lucide_icons.dart';
import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_skeleton.dart';
import '../../core/widgets/app_snackbar.dart';
import '../../core/widgets/section_header.dart';
import '../../services/api_service.dart';
import 'fingerprint_enroll_panel.dart';

class AddBeneficiaryPage extends StatefulWidget {
  const AddBeneficiaryPage({super.key});

  @override
  State<AddBeneficiaryPage> createState() => _AddBeneficiaryPageState();
}

class _AddBeneficiaryPageState extends State<AddBeneficiaryPage> {
  final _formKey = GlobalKey<FormState>();
  final _fullNameController = TextEditingController();
  final _mobileController = TextEditingController();
  final _occupationController = TextEditingController();
  final _addressController = TextEditingController();
  final _cityController = TextEditingController();
  final _stateController = TextEditingController();

  String? _gender;
  DateTime? _dob;
  bool _loading = false;
  Map<String, dynamic>? _created;
  List<CapturedFingerprint> _captured = [];
  bool _fingersReady = false;

  static const int requiredFingers = 3;

  @override
  void dispose() {
    _fullNameController.dispose();
    _mobileController.dispose();
    _occupationController.dispose();
    _addressController.dispose();
    _cityController.dispose();
    _stateController.dispose();
    super.dispose();
  }

  Future<void> _pickDob() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _dob ?? DateTime(now.year - 30),
      firstDate: DateTime(1900),
      lastDate: now,
    );
    if (picked != null) setState(() => _dob = picked);
  }

  Future<void> _submit() async {
if (!_fingersReady) {
      showAppSnackbar(
        context,
        'Scan all 3 fingerprints before registering',
        warning: true,
      );
      return;
    }
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _loading = true;
      _created = null;
    });
    try {
      final body = <String, dynamic>{
        'full_name': _fullNameController.text.trim(),
      };
      if (_mobileController.text.trim().isNotEmpty) body['mobile'] = _mobileController.text.trim();
      if (_dob != null) body['date_of_birth'] = '${_dob!.year.toString().padLeft(4, '0')}-${_dob!.month.toString().padLeft(2, '0')}-${_dob!.day.toString().padLeft(2, '0')}';
      if (_gender != null) body['gender'] = _gender;
      if (_occupationController.text.trim().isNotEmpty) body['occupation'] = _occupationController.text.trim();
      if (_addressController.text.trim().isNotEmpty) body['address_line_1'] = _addressController.text.trim();
      if (_cityController.text.trim().isNotEmpty) body['city'] = _cityController.text.trim();
      if (_stateController.text.trim().isNotEmpty) body['state'] = _stateController.text.trim();

      final result = await ApiService.post('/beneficiaries', body: body);
      final created = Map<String, dynamic>.from(result['beneficiary'] ?? {});
      final code = created['beneficiary_code']?.toString();

      // Enroll all captured fingerprints against the new beneficiary
      if (code != null) {
        for (final f in _captured) {
          await ApiService.post(
            '/biometrics/enroll',
            body: {'beneficiary_code': code, ...f.toEnrollBody()},
            timeout: const Duration(minutes: 1),
          );
        }
      }

      if (!mounted) return;
      setState(() {
        _loading = false;
        _created = created;
      });
showAppSnackbar(
        context,
        code != null
            ? 'Beneficiary registered: $code'
            : 'Beneficiary registered',
        success: true,
      );
      // Go straight to the home page after successful registration.
      Navigator.of(context).popUntil((route) => route.isFirst);
    } catch (e) {
      if (!mounted) return;
setState(() => _loading = false);
      showAppSnackbar(
        context,
        e.toString().replaceFirst('Exception: ', ''),
        error: true,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final created = _created;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Add Beneficiary'),
      ),
      body: Form(
        key: _formKey,
child: ListView(
          padding: const EdgeInsets.fromLTRB(24, 8, 24, 32),
          children: [
            const SectionHeader(title: 'Personal Information'),
            const SizedBox(height: 16),
            TextFormField(
              controller: _fullNameController,
              decoration: const InputDecoration(labelText: 'Full Name *'),
              textCapitalization: TextCapitalization.words,
              validator: (v) => (v == null || v.trim().isEmpty) ? 'Full name is required' : null,
              enabled: !_loading && created == null,
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _mobileController,
              decoration: const InputDecoration(labelText: 'Mobile Number'),
              keyboardType: TextInputType.phone,
              maxLength: 10,
              enabled: !_loading && created == null,
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: DropdownButtonFormField<String>(
                    initialValue: _gender,
                    decoration: const InputDecoration(labelText: 'Gender'),
                    items: ['Male', 'Female', 'Other']
                        .map((g) => DropdownMenuItem(value: g, child: Text(g)))
                        .toList(),
                    onChanged: (v) => setState(() => _gender = v),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: GestureDetector(
                    onTap: created == null ? _pickDob : null,
                    child: AbsorbPointer(
                      child: TextFormField(
                        readOnly: true,
                        decoration: InputDecoration(
                          labelText: 'Date of Birth',
                          hintText: _dob == null
                              ? 'Select date'
                              : '${_dob!.day}/${_dob!.month}/${_dob!.year}',
                          suffixIcon: const Icon(LucideIcons.calendar, size: 18),
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _occupationController,
              decoration: const InputDecoration(labelText: 'Occupation'),
              textCapitalization: TextCapitalization.words,
              enabled: !_loading && created == null,
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _addressController,
              decoration: const InputDecoration(labelText: 'Address'),
              textCapitalization: TextCapitalization.words,
              maxLines: 2,
              enabled: !_loading && created == null,
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: TextFormField(
                    controller: _cityController,
                    decoration: const InputDecoration(labelText: 'City'),
                    textCapitalization: TextCapitalization.words,
                    enabled: !_loading && created == null,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: TextFormField(
                    controller: _stateController,
                    decoration: const InputDecoration(labelText: 'State'),
                    textCapitalization: TextCapitalization.words,
                    enabled: !_loading && created == null,
                  ),
                ),
              ],
            ),
const SizedBox(height: 24),

            // Fingerprint enrollment (buffered until registration)
            const SectionHeader(title: 'Fingerprints'),
            const SizedBox(height: 16),
            FingerprintEnrollPanel(
              collectOnly: true,
              onCaptured: (list) => setState(() {
                _captured = list;
                _fingersReady = list.length >= requiredFingers;
              }),
            ),
            const SizedBox(height: 16),

// Register button â€” enabled only after 3 fingerprints are scanned
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: (_fingersReady && !_loading) ? _submit : null,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primaryBlueSoft,
                  foregroundColor: AppColors.addBeneficiaryText,
                  disabledBackgroundColor:
                      AppColors.primaryBlueSoft.withValues(alpha: 0.5),
                  disabledForegroundColor:
                      AppColors.addBeneficiaryText.withValues(alpha: 0.5),
                ),
                icon: _loading
                    ? const SkeletonBox(
                        width: 16,
                        height: 16,
                        borderRadius: 5,
                        baseColor: Color(0x262563EB),
                        shineColor: Color(0xFF2563EB),
                      )
                    : const Icon(LucideIcons.userPlus, size: 18),
                label: Text(
                  _loading
                      ? 'Registering...'
                      : _fingersReady
                          ? 'Register Beneficiary'
                          : 'Register Beneficiary (${_captured.length}/$requiredFingers fingerprints)',
                ),
              ),
            ),
            if (!_fingersReady) ...[
              const SizedBox(height: 8),
              const Text(
                'Register is unlocked only after all 3 fingerprints are scanned.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 12, color: AppTheme.textSecondary),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

