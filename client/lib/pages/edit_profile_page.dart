import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import '../services/api_service.dart';
import '../main.dart';
import '../utils/responsive.dart';

class EditProfilePage extends StatefulWidget {
  final Map<String, dynamic> worker;
  const EditProfilePage({super.key, required this.worker});

  @override
  State<EditProfilePage> createState() => _EditProfilePageState();
}

class _EditProfilePageState extends State<EditProfilePage> {
  late TextEditingController _nameCtrl;
  late TextEditingController _emailCtrl;
  late TextEditingController _phoneCtrl;
  late TextEditingController _altPhoneCtrl;
  late TextEditingController _fatherHusbandCtrl;
  late TextEditingController _addressCtrl;
  late TextEditingController _permanentAddressCtrl;
  late TextEditingController _cityCtrl;
  late TextEditingController _stateCtrl;
  late TextEditingController _pincodeCtrl;
  late TextEditingController _bankNameCtrl;
  late TextEditingController _accountHolderCtrl;
  late TextEditingController _ifscCtrl;
  late TextEditingController _accountNoCtrl;

  String _gender = 'Male';
  String _maritalStatus = 'Single';
  DateTime? _dob;
  bool _busy = false;

  final List<String> _genders = ['Male', 'Female', 'Other'];
  final List<String> _maritalStatuses = ['Single', 'Married', 'Divorced', 'Widowed'];

  @override
  void initState() {
    super.initState();
    final w = widget.worker;
    _nameCtrl = TextEditingController(text: w['name'] ?? '');
    _emailCtrl = TextEditingController(text: w['email'] ?? '');
    _phoneCtrl = TextEditingController(text: w['phone'] ?? '');
    _altPhoneCtrl = TextEditingController(text: w['alternate_phone'] ?? '');
    _fatherHusbandCtrl = TextEditingController(text: w['father_husband_name'] ?? '');
    _addressCtrl = TextEditingController(text: w['address'] ?? '');
    _permanentAddressCtrl = TextEditingController(text: w['permanent_address'] ?? '');
    _cityCtrl = TextEditingController(text: w['city'] ?? '');
    _stateCtrl = TextEditingController(text: w['state'] ?? '');
    _pincodeCtrl = TextEditingController(text: w['pincode'] ?? '');
    _bankNameCtrl = TextEditingController(text: w['bank_name'] ?? '');
    _accountHolderCtrl = TextEditingController(text: w['account_holder_name'] ?? '');
    _ifscCtrl = TextEditingController(text: w['ifsc_code'] ?? '');
    _accountNoCtrl = TextEditingController(text: w['account_number'] ?? '');
    if (w['gender'] != null && w['gender'].toString().isNotEmpty) _gender = w['gender'];
    if (w['marital_status'] != null && w['marital_status'].toString().isNotEmpty) _maritalStatus = w['marital_status'];
    if (w['dob'] != null) _dob = DateTime.tryParse(w['dob'].toString());
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _emailCtrl.dispose();
    _phoneCtrl.dispose();
    _altPhoneCtrl.dispose();
    _fatherHusbandCtrl.dispose();
    _addressCtrl.dispose();
    _permanentAddressCtrl.dispose();
    _cityCtrl.dispose();
    _stateCtrl.dispose();
    _pincodeCtrl.dispose();
    _bankNameCtrl.dispose();
    _accountHolderCtrl.dispose();
    _ifscCtrl.dispose();
    _accountNoCtrl.dispose();
    super.dispose();
  }

  Map<String, dynamic> _computeChanges() {
    final w = widget.worker;
    final changes = <String, dynamic>{};
    final fields = <String, dynamic>{
      'name': _nameCtrl.text.trim(),
      'email': _emailCtrl.text.trim(),
      'phone': _phoneCtrl.text.trim(),
      'alternate_phone': _altPhoneCtrl.text.trim(),
      'father_husband_name': _fatherHusbandCtrl.text.trim(),
      'gender': _gender,
      'marital_status': _maritalStatus,
      'dob': _dob?.toIso8601String().split('T')[0],
      'address': _addressCtrl.text.trim(),
      'permanent_address': _permanentAddressCtrl.text.trim(),
      'city': _cityCtrl.text.trim(),
      'state': _stateCtrl.text.trim(),
      'pincode': _pincodeCtrl.text.trim(),
      'bank_name': _bankNameCtrl.text.trim(),
      'account_holder_name': _accountHolderCtrl.text.trim(),
      'ifsc_code': _ifscCtrl.text.trim(),
      'account_number': _accountNoCtrl.text.trim(),
    };
    for (final entry in fields.entries) {
      final current = entry.value?.toString() ?? '';
      final original = w[entry.key]?.toString() ?? '';
      if (current != original) {
        changes[entry.key] = entry.value;
      }
    }
    return changes;
  }

  Future<void> _submitForReview() async {
    if (_nameCtrl.text.trim().isEmpty) {
      _showError('Name is required');
      return;
    }
    if (_phoneCtrl.text.trim().length < 10) {
      _showError('Enter a valid phone number');
      return;
    }
    final changes = _computeChanges();
    if (changes.isEmpty) {
      _showError('No changes to submit');
      return;
    }
    setState(() => _busy = true);
    try {
      await ApiService.submitProfileUpdateRequest(changes);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Changes submitted for HR review'),
            backgroundColor: Color(0xFF10b981),
          ),
        );
        Navigator.pop(context, true);
      }
    } catch (e) {
      if (mounted) _showError(e.toString().replaceFirst('Exception:', '').trim());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _showError(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(msg), backgroundColor: Colors.red),
    );
  }

  @override
  Widget build(BuildContext context) {
    final changes = _computeChanges();
    final hasChanges = changes.isNotEmpty;
    final sc = Theme.of(context).colorScheme;
    final colors = Theme.of(context).extension<AppColors>()!;

    return Scaffold(
      backgroundColor: sc.surface,
      body: Column(
        children: [
          SizedBox(height: Responsive.pad(context, 12)),
          Container(
            width: Responsive.pad(context, 40), height: Responsive.pad(context, 4),
            decoration: BoxDecoration(
              color: colors.surfaceContainerHighest,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          Padding(
            padding: EdgeInsets.symmetric(horizontal: Responsive.pad(context, 16), vertical: Responsive.pad(context, 8)),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Edit Profile', style: GoogleFonts.hankenGrotesk(
                  fontSize: Responsive.sp(context, 18), fontWeight: FontWeight.w600, color: sc.onSurface,
                )),
                TextButton(
                  onPressed: _busy ? null : _submitForReview,
                  child: _busy
                      ? SizedBox(width: Responsive.pad(context, 20), height: Responsive.pad(context, 20), child: const CircularProgressIndicator(strokeWidth: 2))
                      : Text('Submit for Review', style: GoogleFonts.hankenGrotesk(
                          fontSize: Responsive.sp(context, 14), fontWeight: FontWeight.w600,
                          color: hasChanges ? sc.primary : sc.onSurfaceVariant,
                        )),
                ),
              ],
            ),
          ),
          Expanded(
            child: ListView(
              padding: EdgeInsets.all(Responsive.pad(context, 16)),
              children: [
                if (hasChanges)
                  Container(
                    margin: EdgeInsets.only(bottom: Responsive.pad(context, 16)),
                    padding: EdgeInsets.all(Responsive.pad(context, 12)),
                    decoration: BoxDecoration(
                      color: const Color(0xFFfff8e1),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: const Color(0xFFe6a817).withValues(alpha: 0.3)),
                    ),
                    child: Row(
                      children: [
                        Icon(LucideIcons.info, size: Responsive.sp(context, 16), color: const Color(0xFFc28228)),
                        SizedBox(width: Responsive.pad(context, 8)),
                        Expanded(
                          child: Text(
                            '${changes.length} field${changes.length > 1 ? 's' : ''} changed. Changes will be sent to HR for review before being applied.',
                            style: TextStyle(fontSize: Responsive.sp(context, 12), color: const Color(0xFFc28228)),
                          ),
                        ),
                      ],
                    ),
                  ),
                _section('Basic Information'),
                _field('Full Name', _nameCtrl),
                _field('Email', _emailCtrl, keyboardType: TextInputType.emailAddress),
                Row(
                  children: [
                    Expanded(child: _field('Phone', _phoneCtrl, keyboardType: TextInputType.phone)),
                    SizedBox(width: Responsive.pad(context, 12)),
                    Expanded(child: _field('Alt. Phone', _altPhoneCtrl, keyboardType: TextInputType.phone)),
                  ],
                ),
                _field('Father / Husband Name', _fatherHusbandCtrl),
                SizedBox(height: Responsive.pad(context, 16)),
                _section('Personal Info'),
                Row(
                  children: [
                    Expanded(child: _dropdown('Gender', _gender, _genders, (v) => setState(() => _gender = v!))),
                    SizedBox(width: Responsive.pad(context, 12)),
                    Expanded(child: _dobPicker()),
                  ],
                ),
                SizedBox(height: Responsive.pad(context, 12)),
                _dropdown('Marital Status', _maritalStatus, _maritalStatuses, (v) => setState(() => _maritalStatus = v!)),
                SizedBox(height: Responsive.pad(context, 16)),
                _section('Address'),
                _field('Current Address', _addressCtrl, maxLines: 2),
                SizedBox(height: Responsive.pad(context, 12)),
                Row(
                  children: [
                    Expanded(child: _field('City', _cityCtrl)),
                    SizedBox(width: Responsive.pad(context, 12)),
                    Expanded(child: _field('State', _stateCtrl)),
                  ],
                ),
                SizedBox(height: Responsive.pad(context, 12)),
                _field('Pincode', _pincodeCtrl, keyboardType: TextInputType.number, maxLength: 6),
                SizedBox(height: Responsive.pad(context, 12)),
                _field('Permanent Address', _permanentAddressCtrl, maxLines: 2),
                SizedBox(height: Responsive.pad(context, 16)),
                _section('Bank Account Details'),
                Text('These details are used for salary disbursement',
                  style: TextStyle(fontSize: Responsive.sp(context, 12), color: Theme.of(context).extension<AppColors>()!.outline)),
                SizedBox(height: Responsive.pad(context, 8)),
                _field('Bank Name', _bankNameCtrl),
                SizedBox(height: Responsive.pad(context, 12)),
                _field('Account Holder Name', _accountHolderCtrl),
                SizedBox(height: Responsive.pad(context, 12)),
                Row(
                  children: [
                    Expanded(child: _field('IFSC Code', _ifscCtrl)),
                    SizedBox(width: Responsive.pad(context, 12)),
                    Expanded(child: _field('Account Number', _accountNoCtrl, keyboardType: TextInputType.number)),
                  ],
                ),
                SizedBox(height: Responsive.pad(context, 32)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _section(String title) {
    return Padding(
      padding: EdgeInsets.only(bottom: Responsive.pad(context, 12), top: Responsive.pad(context, 4)),
      child: Text(title,
        style: GoogleFonts.hankenGrotesk(fontSize: Responsive.sp(context, 15), fontWeight: FontWeight.w700, color: const Color(0xFF00152a))),
    );
  }

  Widget _field(String label, TextEditingController ctrl, {TextInputType? keyboardType, int maxLines = 1, int? maxLength}) {
    return Padding(
      padding: EdgeInsets.only(bottom: Responsive.pad(context, 12)),
      child: TextField(
        controller: ctrl,
        keyboardType: keyboardType,
        maxLines: maxLines,
        maxLength: maxLength,
        onChanged: (_) => setState(() {}),
        style: TextStyle(fontSize: Responsive.sp(context, 14)),
        decoration: InputDecoration(
          labelText: label,
          labelStyle: TextStyle(color: const Color(0xFF74777e), fontSize: Responsive.sp(context, 13)),
          filled: true,
          fillColor: const Color(0xFFf6fafe),
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: Color(0xFFc3c6ce))),
          enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: Color(0xFFc3c6ce))),
          focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: Color(0xFF00152a), width: 1.5)),
          contentPadding: EdgeInsets.symmetric(horizontal: Responsive.pad(context, 12), vertical: Responsive.pad(context, 12)),
          counterText: '',
        ),
      ),
    );
  }

  Widget _dropdown(String label, String value, List<String> items, ValueChanged<String?> onChanged) {
    return Padding(
      padding: EdgeInsets.only(bottom: Responsive.pad(context, 12)),
      child: DropdownButtonFormField<String>(
        initialValue: items.contains(value) ? value : null,
        items: items.map((e) => DropdownMenuItem(value: e, child: Text(e, style: TextStyle(fontSize: Responsive.sp(context, 14))))).toList(),
        onChanged: (v) { onChanged(v); setState(() {}); },
        decoration: InputDecoration(
          labelText: label,
          labelStyle: TextStyle(color: const Color(0xFF74777e), fontSize: Responsive.sp(context, 13)),
          filled: true,
          fillColor: const Color(0xFFf6fafe),
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: Color(0xFFc3c6ce))),
          enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: Color(0xFFc3c6ce))),
          focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: Color(0xFF00152a), width: 1.5)),
          contentPadding: EdgeInsets.symmetric(horizontal: Responsive.pad(context, 12), vertical: Responsive.pad(context, 12)),
        ),
      ),
    );
  }

  Widget _dobPicker() {
    return GestureDetector(
      onTap: () async {
        final date = await showDatePicker(
          context: context,
          initialDate: _dob ?? DateTime(2000, 1, 1),
          firstDate: DateTime(1950),
          lastDate: DateTime.now().subtract(const Duration(days: 365 * 15)),
        );
        if (date != null) { setState(() { _dob = date; }); }
      },
      child: Container(
        height: Responsive.pad(context, 50),
        padding: EdgeInsets.symmetric(horizontal: Responsive.pad(context, 12)),
        decoration: BoxDecoration(
          color: const Color(0xFFf6fafe),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: const Color(0xFFc3c6ce)),
        ),
        child: Row(
          children: [
            Icon(LucideIcons.calendarDays, size: Responsive.sp(context, 18), color: const Color(0xFF74777e)),
            SizedBox(width: Responsive.pad(context, 8)),
            Text(
              _dob != null ? '${_dob!.day}/${_dob!.month}/${_dob!.year}' : 'Date of Birth',
              style: TextStyle(fontSize: Responsive.sp(context, 14), color: _dob != null ? const Color(0xFF171c1f) : const Color(0xFF74777e)),
            ),
          ],
        ),
      ),
    );
  }
}
