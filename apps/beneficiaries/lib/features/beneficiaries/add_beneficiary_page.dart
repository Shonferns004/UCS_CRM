import '../../core/lucide_icons.dart';
import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';
import '../../core/widgets/app_skeleton.dart';
import '../../core/widgets/app_snackbar.dart';
import '../../core/widgets/section_header.dart';
import '../../services/api_service.dart';
import 'document_capture_page.dart';
import 'fingerprint_enroll_panel.dart';

enum _DocType { aadhaar, udid, disability }

class _PendingDoc {
  final _DocType type;
  final String label;
  final bool required;
  String? base64;
  String? name;

  _PendingDoc({required this.type, required this.label, required this.required});
}

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
  final _pincodeController = TextEditingController();
  final _aadhaarController = TextEditingController();

  final List<_PendingDoc> _docs = [
    _PendingDoc(type: _DocType.aadhaar, label: 'Aadhaar Card', required: true),
    _PendingDoc(type: _DocType.udid, label: 'UDID Card', required: false),
    _PendingDoc(
        type: _DocType.disability,
        label: 'Disability Certificate',
        required: false),
  ];

  final List<Map<String, dynamic>> _ngos = [];
  String? _selectedNgoId;

  String? _gender;
  DateTime? _dob;
  bool _loading = false;
  Map<String, dynamic>? _created;
  List<CapturedFingerprint> _captured = [];
  bool _fingersReady = false;

  static const int requiredFingers = 3;

  @override
  void initState() {
    super.initState();
    _loadNgos();
  }

  @override
  void dispose() {
    _fullNameController.dispose();
    _mobileController.dispose();
    _occupationController.dispose();
    _addressController.dispose();
    _pincodeController.dispose();
    _aadhaarController.dispose();
    super.dispose();
  }

  // NGOs for the dropdown. The operator picks which organization the new
  // member belongs to. Maps each element so a raw List<dynamic> from the
  // server never trips a List<Map<String, dynamic>> cast.
  Future<void> _loadNgos() async {
    try {
      final list = await ApiService.getList('/ngos/options');
      if (!mounted) return;
      setState(() {
        _ngos
          ..clear()
          ..addAll(list.map((e) => Map<String, dynamic>.from(e)));
      });
    } catch (_) {
      // Dropdown stays empty — operator can still register without an NGO.
    }
  }

  // Dropdown items. ngos.id is a UUID string (never an int), so the value is
  // kept as text and de-duplicated so the dropdown never sees a duplicate value.
  List<DropdownMenuItem<String>> _ngoItems() {
    final seen = <String, String>{};
    for (final n in _ngos) {
      final id = n['id']?.toString() ?? '';
      if (id.isEmpty) continue;
      seen.putIfAbsent(id, () => n['name']?.toString() ?? 'NGO');
    }
    return [
      for (final e in seen.entries)
        DropdownMenuItem<String>(
          value: e.key,
          child: Text(e.value, overflow: TextOverflow.ellipsis),
        ),
    ];
  }

  Set<String> _ngoIdSet() => {
        for (final n in _ngos)
          if ((n['id']?.toString() ?? '') case final String id when id.isNotEmpty) id,
      };

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

  String _docLabel(_DocType type) => _docs.firstWhere((d) => d.type == type).label;

  // Dotted "Upload document" area: opens a bottom sheet with the 3 choices,
  // then a doc-capture flow. Re-choosing an already-attached type replaces it.
  Future<void> _uploadDocument() async {
    if (_loading || _created != null) return;
    final selected = await showModalBottomSheet<_DocType>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(24, 8, 24, 6),
              child: Text(
                'Upload document',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: AppColors.textPrimary,
                ),
              ),
            ),
            const Padding(
              padding: EdgeInsets.fromLTRB(24, 0, 24, 14),
              child: Text(
                'Aadhaar card is required. UDID card or Disability certificate — any one is fine, all three is great.',
                style: TextStyle(fontSize: 13, height: 1.4, color: AppColors.textSecondary),
              ),
            ),
            _docOption(
              _DocType.aadhaar,
              'Aadhaar Card',
              'Required',
              LucideIcons.userCheck,
            ),
            _docOption(
              _DocType.udid,
              'UDID Card',
              'OR Disability certificate',
              LucideIcons.clipboardCheck,
            ),
            _docOption(
              _DocType.disability,
              'Disability Certificate',
              'OR UDID card',
              LucideIcons.checkCircle,
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 8, 24, 20),
              child: OutlinedButton(
                onPressed: () => Navigator.of(ctx).pop(),
                style: OutlinedButton.styleFrom(
                  minimumSize: const Size(0, 48),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                ),
                child: const Text('Cancel'),
              ),
            ),
          ],
        ),
      ),
    );
    if (selected == null || !mounted) return;

    final result = await Navigator.push<Map<String, dynamic>>(
      context,
      MaterialPageRoute(builder: (_) => const DocumentCapturePage()),
    );
    if (result == null || !mounted) return;
    setState(() {
      final doc = _docs.firstWhere((d) => d.type == selected);
      doc.base64 = result['base64']?.toString();
      doc.name = result['name']?.toString() ?? 'scanned_document.jpg';
    });
    showAppSnackbar(
      context,
      '${_docLabel(selected)} copy attached.',
      success: true,
    );
    // An uploaded Aadhaar card is automatically scraped for every field it
    // shows, so the form fills itself from the attached photo.
    if (selected == _DocType.aadhaar) {
      await _scrapeAadhaarDoc();
    }
  }

  Future<void> _scrapeAadhaarDoc() async {
    final base64 = _docs.firstWhere((d) => d.type == _DocType.aadhaar).base64;
    if (base64 == null || base64.isEmpty) return;
    try {
      final fields = await ApiService.parseAadhaarPhoto(base64);
      if (!mounted) return;

      setState(() {
        final name = fields['name']?.toString();
        if (name != null && name.trim().isNotEmpty) {
          _fullNameController.text = name.trim();
        }
        final dob = fields['dob']?.toString();
        if (dob != null && dob.length >= 10) {
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
        final gender = fields['gender']?.toString();
        if (gender != null && gender.trim().isNotEmpty) {
          _gender = gender;
        }
        final address = fields['address_line_1']?.toString();
        if (address != null && address.trim().isNotEmpty) {
          _addressController.text = address.trim();
        }
        final aadhaar = fields['aadhaar_number']?.toString();
        if (aadhaar != null && aadhaar.trim().isNotEmpty) {
          _aadhaarController.text = aadhaar.trim();
        }
      });

      showAppSnackbar(
        context,
        'Aadhaar details auto-filled. Please review before registering.',
        success: true,
      );
    } catch (e) {
      if (mounted) {
        showAppSnackbar(
          context,
          'Aadhaar copy attached, but details could not be read: $e',
          warning: true,
        );
      }
    }
  }

  Widget _docOption(_DocType type, String label, String sub, IconData icon) {
    return ListTile(
      leading: Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          color: AppColors.primaryBlueSoft,
          borderRadius: BorderRadius.circular(12),
        ),
        alignment: Alignment.center,
        child: Icon(icon, size: 20, color: AppColors.primaryBlue),
      ),
      title: Text(
        label,
        style: const TextStyle(
          fontSize: 15,
          fontWeight: FontWeight.w600,
          color: AppColors.textPrimary,
        ),
      ),
      subtitle: Text(sub, style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
      trailing: const Icon(LucideIcons.chevronRight, color: AppColors.textTertiary),
      onTap: () => Navigator.of(context).pop(type),
    );
  }

  Future<void> _submit() async {
    final aadhaar = _docs.firstWhere((d) => d.type == _DocType.aadhaar);
    final hasUdIdOrDisability = _docs
        .where((d) => d.type == _DocType.udid || d.type == _DocType.disability)
        .any((d) => d.base64 != null);
    if (aadhaar.base64 == null || !hasUdIdOrDisability) {
      showAppSnackbar(
        context,
        'Aadhaar card plus UDID card or Disability certificate are required before registering.',
        warning: true,
      );
      return;
    }
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
      if (_pincodeController.text.trim().isNotEmpty) body['pincode'] = _pincodeController.text.trim();
      if (_aadhaarController.text.trim().isNotEmpty) body['aadhaar_number'] = _aadhaarController.text.trim();
      if (_selectedNgoId != null) body['ngo_id'] = _selectedNgoId;

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

      // Attach every scanned document copy to the new beneficiary.
      if (id != null) {
        for (final doc in _docs.where((d) => d.base64 != null)) {
          try {
            await ApiService.post(
              '/beneficiaries/$id/documents',
              body: {
                'document_type': _docTypeId(doc.type),
                'file_base64': doc.base64,
                'mime_type': 'image/jpeg',
                'file_name': doc.name ?? 'scanned_document.jpg',
              },
              timeout: const Duration(minutes: 2),
            );
          } catch (_) {
            // Registration already succeeded — don't block on the doc upload.
          }
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

  String _docTypeId(_DocType type) {
    switch (type) {
      case _DocType.aadhaar:
        return 'aadhaar_card';
      case _DocType.udid:
        return 'udid_card';
      case _DocType.disability:
        return 'handicap_certificate';
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
            DropdownButtonFormField<String>(
              initialValue: _ngoIdSet().contains(_selectedNgoId) ? _selectedNgoId : null,
              decoration: const InputDecoration(labelText: 'NGO *'),
              hint: const Text('Select NGO'),
              items: _ngoItems(),
              isExpanded: true,
              onChanged:
                  (_loading || created != null) ? null : (v) => setState(() => _selectedNgoId = v),
              validator: (v) => v == null ? 'Please select an NGO' : null,
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _pincodeController,
              decoration: const InputDecoration(labelText: 'Pincode', counterText: ''),
              keyboardType: TextInputType.number,
              maxLength: 6,
              enabled: !_loading && created == null,
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

            // Documents — Aadhaar required, UDID or Disability certificate.
            const SectionHeader(title: 'Documents'),
            const SizedBox(height: 8),
            const Text(
              'Aadhaar card is required. UDID card or Disability certificate (any one) — all three is fine.',
              style: TextStyle(fontSize: 12.5, height: 1.4, color: AppColors.textSecondary),
            ),
            const SizedBox(height: 16),

            // Dotted upload area → bottom sheet with the 3 choices.
            InkWell(
              onTap: (_loading || created != null) ? null : _uploadDocument,
              borderRadius: BorderRadius.circular(16),
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: AppColors.dashedBorder, width: 1.4),
                ),
                child: const Column(
                  children: [
                    Icon(LucideIcons.camera, size: 28, color: AppColors.primaryBlue),
                    SizedBox(height: 8),
                    Text(
                      'Upload document',
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                        color: AppColors.textPrimary,
                      ),
                    ),
                    SizedBox(height: 2),
                    Text(
                      'Tap to pick Aadhaar / UDID / Disability certificate',
                      style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),

            // Per-document status rows.
            ..._docs.map((doc) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: _docStatusRow(doc),
                )),
            const SizedBox(height: 12),

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

            // Register button enabled only after 3 fingerprints are scanned
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
                style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _docStatusRow(_PendingDoc doc) {
    final attached = doc.base64 != null;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: AppColors.surfaceSoft,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        children: [
          Icon(
            attached ? LucideIcons.checkCircle : LucideIcons.camera,
            size: 18,
            color: attached ? AppColors.successGreen : AppColors.textTertiary,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  doc.label,
                  style: const TextStyle(
                    fontSize: 13.5,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textPrimary,
                  ),
                ),
                Text(
                  doc.type == _DocType.udid || doc.type == _DocType.disability
                      ? 'Required only if you skip the other'
                      : (doc.required ? 'Required' : 'Optional'),
                  style: const TextStyle(
                      fontSize: 11, color: AppColors.textSecondary),
                ),
              ],
            ),
          ),
          Text(
            attached ? 'Scanned' : 'Not scanned',
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: attached ? AppColors.successGreen : AppColors.textSecondary,
            ),
          ),
        ],
      ),
    );
  }
}