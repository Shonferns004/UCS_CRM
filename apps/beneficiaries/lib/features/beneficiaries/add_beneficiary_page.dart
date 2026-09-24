import '../../core/lucide_icons.dart';
import 'dart:convert';
import 'dart:typed_data';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_skeleton.dart';
import '../../core/widgets/app_snackbar.dart';
import '../../core/widgets/section_header.dart';
import '../../services/api_service.dart';
import 'aadhaar_scanner_page.dart';
import 'document_capture_page.dart';
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
  final _pincodeController = TextEditingController();
  final _aadhaarController = TextEditingController();

  String? _gender;
  DateTime? _dob;
  bool _loading = false;
  Map<String, dynamic>? _created;
  List<CapturedFingerprint> _captured = [];
  bool _fingersReady = false;
  String? _handicapCertBase64;
  String? _handicapCertName;

  static const int requiredFingers = 3;

  @override
  void dispose() {
    _fullNameController.dispose();
    _mobileController.dispose();
    _occupationController.dispose();
    _addressController.dispose();
    _cityController.dispose();
    _stateController.dispose();
    _pincodeController.dispose();
    _aadhaarController.dispose();
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

  Future<void> _scanAadhaar() async {
    if (_loading || _created != null) return;
    final result = await Navigator.push<Map<String, dynamic>>(
      context,
      MaterialPageRoute(builder: (_) => const AadhaarScannerPage()),
    );
    if (result == null || !mounted) return;

    setState(() {
      final name = result['name']?.toString();
      if (name != null && name.trim().isNotEmpty) {
        _fullNameController.text = name.trim();
      }
      final dob = result['dob']?.toString();
      if (dob != null && dob.isNotEmpty) {
        final parts = dob.split('-');
        if (parts.length == 3) {
          final y = int.tryParse(parts[0]);
          final m = int.tryParse(parts[1]);
          final d = int.tryParse(parts[2]);
          if (y != null && m != null && d != null) {
            _dob = DateTime(y, m, d);
          }
        }
      }
      final gender = result['gender']?.toString();
      if (gender != null && gender.isNotEmpty) {
        _gender = gender;
      }
      final address = result['address_line_1']?.toString();
      if (address != null && address.trim().isNotEmpty) {
        _addressController.text = address.trim();
      }
      final city = result['vtc']?.toString() ??
          result['post_office']?.toString() ??
          result['district']?.toString();
      if (city != null && city.trim().isNotEmpty) {
        _cityController.text = city.trim();
      }
      final state = result['state']?.toString();
      if (state != null && state.trim().isNotEmpty) {
        _stateController.text = state.trim();
      }
      final pincode = result['pincode']?.toString();
      if (pincode != null && pincode.trim().isNotEmpty) {
        _pincodeController.text = pincode.trim();
      }
      final aadhaar = result['aadhaar_number']?.toString();
      if (aadhaar != null && aadhaar.trim().isNotEmpty) {
        _aadhaarController.text = aadhaar.trim();
      }
    });

    showAppSnackbar(
      context,
      'Aadhaar details added. Please review before registering.',
      success: true,
    );
  }

  Future<void> _pickHandicapCert() async {
    if (_loading || _created != null) return;
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
        _handicapCertBase64 = base64Encode(bytes);
        _handicapCertName = file.name;
      });
      showAppSnackbar(
        context,
        'Handicap certificate copy attached to this registration.',
        success: true,
      );
    } catch (_) {
      if (!mounted) return;
      showAppSnackbar(
        context,
        'Could not pick the certificate image. Try again.',
        error: true,
      );
    }
  }

  // Capture a photo of the certificate and apply the scan (whitening) effect
  // so it attaches as a proper scanned document.
  Future<void> _captureHandicapCert() async {
    if (_loading || _created != null) return;
    final result = await Navigator.push<Map<String, dynamic>>(
      context,
      MaterialPageRoute(builder: (_) => const DocumentCapturePage()),
    );
    if (result == null || !mounted) return;
    setState(() {
      _handicapCertBase64 = result['base64']?.toString();
      _handicapCertName = result['name']?.toString() ?? 'scanned_document.jpg';
    });
    showAppSnackbar(
      context,
      'Scanned certificate copy attached to this registration.',
      success: true,
    );
  }

  void _showDocumentOptions() {
    showModalBottomSheet<void>(
      context: context,
      builder: (sheetCtx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(24, 20, 24, 4),
              child: Text(
                'Attach certificate copy',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
              ),
            ),
            const SizedBox(height: 8),
            ListTile(
              leading: const Icon(LucideIcons.scanLine),
              title: const Text('Capture with scanner'),
              subtitle: const Text('Photograph the document and whiten it like a scan'),
              onTap: () {
                Navigator.pop(sheetCtx);
                _captureHandicapCert();
              },
            ),
            ListTile(
              leading: const Icon(LucideIcons.camera),
              title: const Text('Choose from gallery'),
              subtitle: const Text('Pick an existing image of the certificate'),
              onTap: () {
                Navigator.pop(sheetCtx);
                _pickHandicapCert();
              },
            ),
            const SizedBox(height: 12),
          ],
        ),
      ),
    );
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
      if (_pincodeController.text.trim().isNotEmpty) body['pincode'] = _pincodeController.text.trim();
      if (_aadhaarController.text.trim().isNotEmpty) body['aadhaar_number'] = _aadhaarController.text.trim();

      final result = await ApiService.post('/beneficiaries', body: body);
      final created = Map<String, dynamic>.from(result['beneficiary'] ?? {});
      final code = created['beneficiary_code']?.toString();
      final id = created['id'];

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

      // Attach the handicap-certificate copy (if one was picked) to the
      // newly created beneficiary as a document.
      if (id != null && _handicapCertBase64 != null) {
        try {
          await ApiService.post(
            '/beneficiaries/$id/documents',
            body: {
              'document_type': 'handicap_certificate',
              'file_base64': _handicapCertBase64,
              'mime_type': 'image/jpeg',
              'file_name': _handicapCertName ?? 'handicap_certificate.jpg',
            },
            timeout: const Duration(minutes: 2),
          );
        } catch (_) {
          // Registration already succeeded — don't block on the doc upload.
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

            // Aadhaar auto-fill entry point: opens the camera to scan the
            // SecureQR on an Aadhaar card and fills the form below.
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: _scanAadhaar,
                icon: const Icon(LucideIcons.scanLine, size: 18),
                label: const Text('Scan Aadhaar (auto-fill)'),
              ),
            ),
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
                const SizedBox(width: 12),
                Expanded(
                  child: TextFormField(
                    controller: _pincodeController,
                    decoration: const InputDecoration(labelText: 'Pincode', counterText: ''),
                    keyboardType: TextInputType.number,
                    maxLength: 6,
                    enabled: !_loading && created == null,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _aadhaarController,
              decoration: const InputDecoration(labelText: 'Aadhaar Number'),
              keyboardType: TextInputType.number,
              maxLength: 12,
              enabled: !_loading && created == null,
            ),
            const SizedBox(height: 24),

            // Handicap certificate document copy (optional)
            const SectionHeader(title: 'Documents'),
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
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Handicap Certificate copy',
                            style: TextStyle(
                                fontSize: 14, fontWeight: FontWeight.w600)),
                        const SizedBox(height: 2),
                        Text(
                          _handicapCertName != null
                              ? _handicapCertName!
                              : 'Photo / scan of the disability certificate (optional)',
                          style: const TextStyle(
                              fontSize: 12, color: AppTheme.textSecondary),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ),
                  TextButton.icon(
                    onPressed: (_loading || created != null)
                        ? null
                        : _showDocumentOptions,
                    icon: Icon(
                        _handicapCertBase64 != null
                            ? LucideIcons.checkCircle
                            : LucideIcons.camera,
                        size: 18),
                    label: Text(_handicapCertBase64 != null ? 'Change' : 'Add copy'),
                  ),
                ],
              ),
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

