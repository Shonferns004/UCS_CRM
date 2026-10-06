import 'dart:convert';
import 'dart:io';
import 'package:dropdown_button2/dropdown_button2.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:google_mlkit_text_recognition/google_mlkit_text_recognition.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/lucide_icons.dart';
import '../../core/theme/app_colors.dart';
import '../../core/widgets/app_skeleton.dart';
import '../../core/widgets/app_snackbar.dart';
import '../../core/widgets/section_header.dart';
import '../../core/utils/photo_utils.dart';
import '../../services/api_service.dart';
import 'camera_capture_page.dart';
import 'document_capture_page.dart';
import 'fingerprint_enroll_panel.dart';

enum _DocType { aadhaar, aadhaarBack, udid, disability }

class _PendingDoc {
  final _DocType type;
  final String label;
  final bool required;
  String? base64;
  String? name;

  String? _cachedB64;
  Uint8List? _cachedBytes;

  /// Decoded image bytes, cached so the preview does not re-decode on every rebuild.
  Uint8List? get bytes {
    final b = base64;
    if (b == null || b.isEmpty) return null;
    if (_cachedB64 != b) {
      try {
        _cachedBytes = base64Decode(b);
        _cachedB64 = b;
      } catch (_) {
        return null;
      }
    }
    return _cachedBytes;
  }

  _PendingDoc({
    required this.type,
    required this.label,
    required this.required,
  });
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
  final _neededController = TextEditingController();
  final _locationController = TextEditingController();
  final _cityController = TextEditingController();
  final _stateController = TextEditingController();
  final _dobController = TextEditingController();
  final _pincodeController = TextEditingController();
  final _aadhaarController = TextEditingController();
  final _disabilityPctController = TextEditingController();
  final _certNoController = TextEditingController();

  bool _ocrBusyProof = false;

  final ImagePicker _picker = ImagePicker();

  final List<_PendingDoc> _docs = [
    _PendingDoc(
      type: _DocType.aadhaar,
      label: 'Aadhaar Card (Front)',
      required: true,
    ),
    _PendingDoc(
      type: _DocType.aadhaarBack,
      label: 'Aadhaar Card (Back)',
      required: false,
    ),
    _PendingDoc(type: _DocType.udid, label: 'UDID Card', required: false),
    _PendingDoc(
      type: _DocType.disability,
      label: 'Disability Certificate',
      required: false,
    ),
  ];

  final List<Map<String, dynamic>> _ngos = [];
  String? _selectedNgoId;

  String? _gender;
  DateTime? _dob;
  bool _loading = false;
  Map<String, dynamic>? _created;
  List<CapturedFingerprint> _captured = [];
  bool _fingersReady = false;
  String? _photo;
  bool _photoBusy = false;

  // True while OCR is reading that side of the Aadhaar card.
  bool _ocrBusyFront = false;
  bool _ocrBusyBack = false;

  static const int requiredFingers = 3;

  static const List<String> _disabilityTypes = [
    'Locomotor / Orthopedic',
    'Visual Impairment',
    'Hearing Impairment',
    'Speech & Language',
    'Intellectual Disability',
    'Mental Illness',
    'Multiple Disabilities',
    'Cerebral Palsy',
    'Autism Spectrum Disorder',
    'Dwarfism',
    'Leprosy Cured',
    'Other',
  ];

  String? _disabilityType;

  @override
  void initState() {
    super.initState();
    _loadNgos();
    _prefillArea();
  }

  /// City/state default to the operator's own area, chosen on the Operator
  /// Details screen, so a registration only has to change them when the
  /// beneficiary lives somewhere else.
  Future<void> _prefillArea() async {
    final area = await ApiService.getOperatorArea();
    if (area == null || !mounted) return;
    if (area.city.isEmpty && area.state.isEmpty) return;
    setState(() {
      if (_cityController.text.trim().isEmpty && area.city.isNotEmpty) {
        _cityController.text = area.city;
      }
      if (_stateController.text.trim().isEmpty && area.state.isNotEmpty) {
        _stateController.text = area.state;
      }
    });
  }

  /// Captures the beneficiary's photo with the plain camera (no document scan
  /// effect) and stores it small enough to keep in the record's `photo` column.
  Future<void> _pickPhoto() async {
    final bytes = await Navigator.push<Uint8List>(
      context,
      MaterialPageRoute(
        builder: (_) => const CameraCapturePage(
          hint: 'Frame the face and capture',
          captureLabel: 'Capture Photo',
        ),
      ),
    );
    if (bytes == null || bytes.isEmpty || !mounted) return;
    setState(() => _photoBusy = true);
    try {
      final dataUrl = await compute(photoDataUrl, bytes);
      if (!mounted) return;
      setState(() => _photo = dataUrl);
    } catch (e) {
      if (!mounted) return;
      showAppSnackbar(context, 'Could not use that photo: $e', error: true);
    } finally {
      if (mounted) setState(() => _photoBusy = false);
    }
  }

  Widget _photoSection() {
    final has = _photo != null && _photo!.isNotEmpty;
    return Row(
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(14),
          child: has
              ? Image.memory(
                  dataUrlBytes(_photo!),
                  width: 64,
                  height: 64,
                  fit: BoxFit.cover,
                  gaplessPlayback: true,
                  errorBuilder: (_, _, _) => const PhotoPlaceholder(),
                )
              : const PhotoPlaceholder(),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Photo',
                style: TextStyle(
                  fontSize: 13.5,
                  fontWeight: FontWeight.w600,
                  color: AppColors.textPrimary,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                has ? 'Will be saved with the record' : 'Optional',
                style: const TextStyle(
                  fontSize: 11,
                  color: AppColors.textSecondary,
                ),
              ),
              const SizedBox(height: 8),
              OutlinedButton.icon(
                onPressed: (_created != null) || _photoBusy ? null : _pickPhoto,
                style: OutlinedButton.styleFrom(
                  minimumSize: const Size(0, 36),
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(10),
                  ),
                ),
                icon: _photoBusy
                    ? const SkeletonBox(
                        width: 14,
                        height: 14,
                        borderRadius: 7,
                        baseColor: Color(0x262563EB),
                        shineColor: Color(0xFF2563EB),
                      )
                    : Icon(
                        has ? LucideIcons.camera : LucideIcons.userCircle,
                        size: 15,
                        color: AppColors.primaryBlue,
                      ),
                label: Text(
                  has ? 'Replace photo' : 'Add photo',
                  style: const TextStyle(fontSize: 12.5),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  @override
  void dispose() {
    _fullNameController.dispose();
    _mobileController.dispose();
    _occupationController.dispose();
    _neededController.dispose();
    _locationController.dispose();
    _cityController.dispose();
    _stateController.dispose();
    _dobController.dispose();
    _pincodeController.dispose();
    _aadhaarController.dispose();
    _disabilityPctController.dispose();
    _certNoController.dispose();
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
      // Dropdown stays empty - operator can still register without an NGO.
    }
  }

  // Dropdown items. ngos.id is a UUID string (never an int), so the value is
  // kept as text and de-duplicated so the dropdown never sees a duplicate value.
  List<DropdownItem<String>> _ngoItems() {
    final seen = <String, String>{};

    for (final n in _ngos) {
      final id = n['id']?.toString().trim() ?? '';
      final name = n['name']?.toString().trim() ?? '';

      if (id.isEmpty || name.isEmpty) continue;

      seen.putIfAbsent(id, () => name);
    }

    return [
      for (final e in seen.entries)
        DropdownItem<String>(
          value: e.key,
          child: Text(
            e.value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontSize: 12.5,
              color: AppColors.textPrimary,
            ),
          ),
        ),
    ];
  }

  Set<String> _ngoIdSet() => {
    for (final n in _ngos)
      if ((n['id']?.toString() ?? '') case final String id when id.isNotEmpty)
        id,
  };

  static String _formatDob(DateTime d) =>
      '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year}';

  DateTime? _parseOcrDob(String value) {
    final match = RegExp(
      r'^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$',
    ).firstMatch(value.trim());

    if (match == null) return null;

    final day = int.tryParse(match.group(1)!);
    final month = int.tryParse(match.group(2)!);
    final year = int.tryParse(match.group(3)!);

    if (day == null || month == null || year == null) {
      return null;
    }

    final date = DateTime(year, month, day);

    // Reject invalid dates (e.g. 31/02/2000 rolling over to March).
    if (date.year != year || date.month != month || date.day != day) {
      return null;
    }

    return date;
  }

  Future<void> _pickDob() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _dob ?? DateTime(now.year - 30),
      firstDate: DateTime(1900),
      lastDate: now,
    );
    if (picked != null) {
      setState(() {
        _dob = picked;
        _dobController.text = _formatDob(picked);
      });
    }
  }

  String _docLabel(_DocType type) =>
      _docs.firstWhere((d) => d.type == type).label;

  _PendingDoc _doc(_DocType t) => _docs.firstWhere((d) => d.type == t);

  String? _normalizeGender(String raw) {
    switch (raw.trim().toLowerCase()) {
      case 'male':
      case 'm':
        return 'Male';
      case 'female':
      case 'f':
        return 'Female';
      case 'transgender':
        return 'Transgender';
      case 'other':
        return 'Other';
    }
    return null;
  }

  // ------------------------------------------------------------
  // AADHAAR: CAPTURE + OCR (all on this page)
  // ------------------------------------------------------------

  Future<ImageSource?> _chooseSource() {
    return showModalBottomSheet<ImageSource>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(
                Icons.camera_alt_outlined,
                color: AppColors.primaryBlue,
              ),
              title: const Text('Camera'),
              onTap: () => Navigator.pop(ctx, ImageSource.camera),
            ),
            ListTile(
              leading: const Icon(
                Icons.photo_library_outlined,
                color: AppColors.primaryBlue,
              ),
              title: const Text('Gallery'),
              onTap: () => Navigator.pop(ctx, ImageSource.gallery),
            ),
          ],
        ),
      ),
    );
  }

  /// Picks one side of the Aadhaar card, attaches it, then reads it with OCR.
  Future<void> _captureAadhaarSide({required bool front}) async {
    if (!mounted) return;

    try {
      final XFile? file = await _picker.pickImage(
        source: ImageSource.camera,
        imageQuality: 85,
        maxWidth: 1600,
        maxHeight: 1600,
      );

      if (file == null || !mounted) return;

      final bytes = await file.readAsBytes();

      if (!mounted) return;

      setState(() {
        final doc = _doc(front ? _DocType.aadhaar : _DocType.aadhaarBack);

        doc.base64 = base64Encode(bytes);
        doc.name = front ? 'aadhaar_front.jpg' : 'aadhaar_back.jpg';

        if (front) {
          _ocrBusyFront = true;
        } else {
          _ocrBusyBack = true;
        }
      });

      await _readAadhaarSide(file.path, front: front);
    } catch (e) {
      if (!mounted) return;

      setState(() {
        _ocrBusyFront = false;
        _ocrBusyBack = false;
      });

      showAppSnackbar(
        context,
        'Could not capture Aadhaar image: $e',
        error: true,
      );
    }
  }

  Future<void> _readAadhaarSide(String path, {required bool front}) async {
    final recognizer = TextRecognizer(script: TextRecognitionScript.latin);
    try {
      final result = await recognizer.processImage(
        InputImage.fromFilePath(path),
      );
      final text = result.text;
      if (!mounted) return;

      if (front) {
        final aadhaar = _extractAadhaar(text);
        final dobText = _extractDob(text);
        final gender = _extractGender(text);
        final name = _extractName(text);

        setState(() {
          _ocrBusyFront = false;
          if (name != null && name.isNotEmpty) {
            _fullNameController.text = name;
          }
          if (dobText != null) {
            final parsed = _parseOcrDob(dobText);
            if (parsed != null) {
              _dob = parsed;
              _dobController.text = _formatDob(parsed);
            }
          }
          if (gender != null) {
            final g = _normalizeGender(gender);
            if (g != null) _gender = g;
          }
          if (aadhaar != null) {
            _aadhaarController.text = aadhaar;
          }
        });
        showAppSnackbar(
          context,
          'Front side read. Please verify the details.',
          success: true,
        );
      } else {
        final address = _extractAddress(text);
        final pin = RegExp(r'\b\d{6}\b').firstMatch(text)?.group(0);

        setState(() {
          _ocrBusyBack = false;
          if (address != null && address.isNotEmpty) {
            _locationController.text = address;
          }
          if (pin != null && _pincodeController.text.trim().isEmpty) {
            _pincodeController.text = pin;
          }
        });
        showAppSnackbar(
          context,
          'Back side read. Please verify the address.',
          success: true,
        );
      }
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _ocrBusyFront = false;
        _ocrBusyBack = false;
      });
      showAppSnackbar(
        context,
        'Image attached, but details could not be read. Fill them manually.',
        warning: true,
      );
    } finally {
      await recognizer.close();
    }
  }

  // ---------------- OCR text parsing ----------------

  List<String> _lines(String text) =>
      text.split('\n').map((e) => e.trim()).where((e) => e.isNotEmpty).toList();

  /// 12-digit Aadhaar number, returned as digits only.
  String? _extractAadhaar(String text) {
    final formatted = RegExp(r'\b\d{4}[\s-]+\d{4}[\s-]+\d{4}\b');
    for (final match in formatted.allMatches(text)) {
      final number = match.group(0)!.replaceAll(RegExp(r'\D'), '');
      if (number.length == 12) return number;
    }
    final continuous = RegExp(r'\b\d{12}\b').firstMatch(text);
    return continuous?.group(0);
  }

  String? _extractDob(String text) {
    final lines = _lines(text);

    final dateRegex = RegExp(
      r'\b(0?[1-9]|[12]\d|3[01])[\/\-.](0?[1-9]|1[0-2])[\/\-.](19|20)\d{2}\b',
    );
    final dobLabel = RegExp(
      r'\b(date\s*of\s*birth|dob|d\.o\.b|birth)\b',
      caseSensitive: false,
    );
    // Dates near these labels are NOT the date of birth.
    final excludeLabel = RegExp(
      r'(issue\s*date|date\s*of\s*issue|issued\s*on|'
      r'enrolment\s*date|enrollment\s*date|'
      r'update\s*date|updated\s*on|'
      r'valid\s*from|date\s*of\s*enrolment)',
      caseSensitive: false,
    );

    // 1. A line carrying the DOB label (same line or the next two lines).
    for (int i = 0; i < lines.length; i++) {
      if (!dobLabel.hasMatch(lines[i])) continue;

      final sameLine = dateRegex.firstMatch(lines[i]);
      if (sameLine != null) return sameLine.group(0);

      for (int j = i + 1; j <= i + 2 && j < lines.length; j++) {
        if (excludeLabel.hasMatch(lines[j])) continue;
        final match = dateRegex.firstMatch(lines[j]);
        if (match != null) return match.group(0);
      }
    }

    // 2. No usable label: accept a date only if it is the single safe one.
    final possible = <String>{};
    for (int i = 0; i < lines.length; i++) {
      for (final match in dateRegex.allMatches(lines[i])) {
        final start = i - 1 < 0 ? 0 : i - 1;
        final end = i + 1 >= lines.length ? lines.length - 1 : i + 1;
        final nearby = lines.sublist(start, end + 1).join(' ');
        if (excludeLabel.hasMatch(nearby)) continue;
        possible.add(match.group(0)!);
      }
    }
    return possible.length == 1 ? possible.first : null;
  }

  String? _extractGender(String text) {
    final lower = text.toLowerCase();
    if (lower.contains('transgender')) return 'Transgender';
    if (lower.contains('female')) return 'Female';
    if (lower.contains('male')) return 'Male';
    return null;
  }

  String _titleCase(String s) => s
      .split(RegExp(r'\s+'))
      .map(
        (w) =>
            w.isEmpty ? w : w[0].toUpperCase() + w.substring(1).toLowerCase(),
      )
      .join(' ');

  /// Name sits just above the DOB / gender line on the Aadhaar front, so we
  /// look upwards from there instead of grabbing the first text-like line
  /// (which used to pick up "Aam Aadmi Ka Adhikar" etc.).
  String? _extractName(String text) {
    final lines = _lines(text);

    final ignored = RegExp(
      r'\b(government|india|unique|identification|authority|aadhaar|aadhar|'
      r'uidai|male|female|transgender|dob|birth|year|aam|aadmi|adhikar|mera|'
      r'meri|pehchaan|help|www|vid|enrolment|enrollment|download|address|'
      r'signature|issue|issued|father|mother|husband)\b',
      caseSensitive: false,
    );
    final relation = RegExp(r'^\s*[sdwc]\s*[\/.]\s*o\b', caseSensitive: false);
    final wordOk = RegExp(r"^[A-Za-z][A-Za-z.'-]*$");

    bool looksLikeName(String line, {int minWords = 1}) {
      if (line.length < 3) return false;
      if (RegExp(r'\d').hasMatch(line)) return false;
      if (ignored.hasMatch(line) || relation.hasMatch(line)) return false;
      final words = line.split(RegExp(r'\s+'));
      if (words.length < minWords || words.length > 6) return false;
      return words.every(wordOk.hasMatch);
    }

    String tidy(String s) => s == s.toUpperCase() ? _titleCase(s) : s;

    // 1. Anchor on the DOB line, else the gender line.
    var anchor = lines.indexWhere(
      (l) => RegExp(
        r'(date\s*of\s*birth|dob|d\.o\.b|year\s*of\s*birth)',
        caseSensitive: false,
      ).hasMatch(l),
    );
    if (anchor == -1) {
      anchor = lines.indexWhere(
        (l) => RegExp(
          r'\b(male|female|transgender)\b',
          caseSensitive: false,
        ).hasMatch(l),
      );
    }
    if (anchor > 0) {
      for (var i = anchor - 1; i >= 0 && i >= anchor - 3; i--) {
        if (looksLikeName(lines[i])) return tidy(lines[i]);
      }
    }

    // 2. Fallback: first clean line with at least two words.
    for (final line in lines) {
      if (looksLikeName(line, minWords: 2)) return tidy(line);
    }
    return null;
  }

  String _cleanAddress(String raw) {
    var s = raw.replaceAll(RegExp(r'\s+'), ' ').trim();

    s = s.replaceFirst(
      RegExp(r'^address\s*[:\-]?\s*', caseSensitive: false),
      '',
    );
    final withoutRelation = s.replaceFirst(
      RegExp(
        r'^[sdwc]\s*[\/\\|Il.]\s*[o0]\b\.?\s*[:\-]?\s*[^,]{0,40},\s*',
        caseSensitive: false,
      ),
      '',
    );
    // Keep the stripped version only if enough address is left.
    if (withoutRelation.length >= 10) s = withoutRelation;

    return s.replaceAll(RegExp(r'^[,\s]+|[,\s]+$'), '');
  }

  String? _extractAddress(String text) {
    // Footer junk printed on the card back.
    final junk = RegExp(
      r'uidai|www\.|help@|\bvid\b|\d{4}\s\d{4}\s\d{4}|toll\s*free|\b1947\b',
      caseSensitive: false,
    );
    final lines = _lines(text).where((l) => !junk.hasMatch(l)).toList();
    if (lines.isEmpty) return null;

    const keywords = [
      's/o',
      'd/o',
      'w/o',
      'c/o',
      'house',
      'road',
      'street',
      'village',
      'taluka',
      'district',
      'state',
      'pincode',
      'maharashtra',
      'gujarat',
      'rajasthan',
      'madhya pradesh',
      'uttar pradesh',
      'delhi',
      'karnataka',
    ];

    // Start: the "Address" label, else the first address-looking line.
    var start = lines.indexWhere((l) => l.toLowerCase().contains('address'));
    if (start == -1) {
      start = lines.indexWhere((l) {
        final lw = l.toLowerCase();
        return keywords.any((k) => lw.contains(k));
      });
    }
    if (start == -1) start = 0;

    // End: the first line with a 6-digit pincode, else 8 lines max.
    var end = -1;
    for (var i = start; i < lines.length; i++) {
      if (RegExp(r'\b\d{6}\b').hasMatch(lines[i])) {
        end = i;
        break;
      }
    }
    if (end == -1) {
      end = (start + 7 < lines.length) ? start + 7 : lines.length - 1;
    }

    final raw = lines.sublist(start, end + 1).join(' ');
    final cleaned = _cleanAddress(raw);
    return cleaned.isNotEmpty ? cleaned : raw.trim();
  }

  /// Certificate / UDID number: by label first, then by the UDID pattern.
  String? _extractCertNo(String text) {
    // Keeps the first token plus any following digit-only groups
    // ("MH12 3456 7890" -> "MH1234567890"), drops trailing words.
    String idToken(String v) {
      final parts = v.trim().split(RegExp(r'\s+'));
      final out = <String>[parts.first];
      for (final p in parts.skip(1)) {
        if (RegExp(r'^\d+$').hasMatch(p)) {
          out.add(p);
        } else {
          break;
        }
      }
      return out.join('');
    }

    final labelled = RegExp(
      r'(?:udid\s*(?:card\s*)?(?:no|number|#)|'
      r'unique\s*disability\s*id(?:\s*(?:no|number))?|'
      r'certificate\s*(?:no|number|#)|cert\.?\s*(?:no|number)|'
      r'registration\s*(?:no|number)|reg\.?\s*no|serial\s*no|ref\.?\s*no)'
      r'\s*\.?\s*[:\-#]?\s*([A-Za-z0-9][A-Za-z0-9\/\- ]{4,30})',
      caseSensitive: false,
    );
    for (final m in labelled.allMatches(text)) {
      final v = idToken(m.group(1)!);
      if (v.length >= 5 && RegExp(r'\d').hasMatch(v)) return v;
    }

    // UDID format: 2 letters + 14-18 digits (spaces allowed between digits).
    final udid = RegExp(r'\b[A-Z]{2}(?:\s?\d){14,18}\b').firstMatch(text);
    if (udid != null) return udid.group(0)!.replaceAll(RegExp(r'\s'), '');

    return null;
  }

  /// Disability percentage (1-100). Prefers a number written with "%".
  int? _extractDisabilityPercent(String text) {
    bool ok(int? n) => n != null && n >= 1 && n <= 100;

    final withSign = RegExp(
      r'\b(\d{1,3})(?:\.\d+)?\s*(?:%|per\s*cent|percent)',
      caseSensitive: false,
    );
    for (final m in withSign.allMatches(text)) {
      final n = int.tryParse(m.group(1)!);
      if (ok(n)) return n;
    }

    final labelled = RegExp(
      r'(?:disability|impairment|percentage)[^\d\n]{0,40}\b(\d{1,3})\b',
      caseSensitive: false,
    ).firstMatch(text);
    final n = int.tryParse(labelled?.group(1) ?? '');
    return ok(n) ? n : null;
  }

  /// Maps certificate wording to one of the dropdown values.
  String? _extractDisabilityType(String text) {
    final lower = text.toLowerCase();
    bool has(List<String> words) => words.any((w) => lower.contains(w));

    // Specific types win over the general ones.
    if (has(['multiple disabilit'])) return 'Multiple Disabilities';
    if (has(['cerebral palsy'])) return 'Cerebral Palsy';
    if (has(['autism'])) return 'Autism Spectrum Disorder';
    if (has(['dwarf'])) return 'Dwarfism';
    if (has(['leprosy'])) return 'Leprosy Cured';

    final hits = <String>[
      if (has(['mental illness', 'psychosocial'])) 'Mental Illness',
      if (has(['intellectual', 'mental retardation', 'learning disab']))
        'Intellectual Disability',
      if (has(['hearing', 'deaf'])) 'Hearing Impairment',
      if (has(['speech'])) 'Speech & Language',
      if (has(['visual', 'blind', 'low vision'])) 'Visual Impairment',
      if (has(['locomotor', 'orthop', 'amputat', 'limb', 'physical']))
        'Locomotor / Orthopedic',
    ];
    return hits.length == 1 ? hits.first : null;
  }

  /// Reads the attached UDID card / disability certificate and fills
  Future<void> _readProofDoc(Uint8List bytes) async {
    setState(() => _ocrBusyProof = true);
    final recognizer = TextRecognizer(script: TextRecognitionScript.latin);
    File? tmp;
    try {
      // ML Kit reads from a file, so write the image to a temp file first.
      tmp = File(
        '${Directory.systemTemp.path}/proof_${DateTime.now().millisecondsSinceEpoch}.jpg',
      );
      await tmp.writeAsBytes(bytes, flush: true);

      final result = await recognizer.processImage(
        InputImage.fromFilePath(tmp.path),
      );
      final text = result.text;
      debugPrint('PROOF OCR TEXT:\n$text');
      if (!mounted) return;

      final certNo = _extractCertNo(text);
      final pct = _extractDisabilityPercent(text);
      final type = _extractDisabilityType(text);

      setState(() {
        _ocrBusyProof = false;
        if (certNo != null) _certNoController.text = certNo;
        if (pct != null) _disabilityPctController.text = pct.toString();
        if (type != null) _disabilityType = type;
      });

      final found = <String>[
        if (certNo != null) 'certificate no.',
        if (type != null) 'type',
        if (pct != null) '$pct%',
      ];
      if (found.isEmpty) {
        showAppSnackbar(
          context,
          'Document attached, but details could not be read. Please fill them in.',
          warning: true,
        );
      } else {
        showAppSnackbar(
          context,
          'Read ${found.join(', ')}. Please verify.',
          success: true,
        );
      }
    } catch (_) {
      if (!mounted) return;
      setState(() => _ocrBusyProof = false);
      showAppSnackbar(
        context,
        'Document attached, but details could not be read. Please fill them in.',
        warning: true,
      );
    } finally {
      await recognizer.close();
      try {
        await tmp?.delete();
      } catch (_) {}
    }
  }

  // ------------------------------------------------------------
  // UDID / DISABILITY CERTIFICATE (document scanner page)
  // ------------------------------------------------------------

  Future<void> _uploadDocument(_DocType selected) async {
    final Map<String, dynamic>? result =
        await Navigator.push<Map<String, dynamic>>(
          context,
          MaterialPageRoute(builder: (_) => const DocumentCapturePage()),
        );
    if (result == null || !mounted) return;

    final b64 = result['base64']?.toString();
    setState(() {
      final doc = _doc(selected);
      doc.base64 = b64;
      doc.name = result['name']?.toString() ?? 'scanned_document.jpg';
    });
    showAppSnackbar(
      context,
      '${_docLabel(selected)} copy attached.',
      success: true,
    );

    // Read the document and fill the disability fields.
    if (b64 != null && b64.isNotEmpty) {
      try {
        await _readProofDoc(base64Decode(b64));
      } catch (_) {}
    }
  }

  // -----------------------------------------------------------
  // DOCUMENTS UI
  // ------------------------------------------------------------

  /// Small square preview of the scanned image.
  Widget _thumb(_PendingDoc doc) {
    final bytes = doc.bytes;
    return ClipRRect(
      borderRadius: BorderRadius.circular(10),
      child: SizedBox(
        width: 52,
        height: 52,
        child: bytes == null
            ? Container(
                color: AppColors.primaryBlueSoft,
                child: const Icon(
                  Icons.description_outlined,
                  color: AppColors.primaryBlue,
                ),
              )
            : Image.memory(
                bytes,
                fit: BoxFit.cover,
                cacheWidth: 160,
                gaplessPlayback: true,
              ),
      ),
    );
  }

  /// Dotted, tappable tile shown while a document is still missing.
  Widget _emptyTile({
    required IconData icon,
    required String title,
    required String subtitle,
    required VoidCallback? onTap,
    String? badge,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: CustomPaint(
        foregroundPainter: const _DottedRoundedRectPainter(
          color: AppColors.dashedBorder,
        ),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(16),
          ),
          child: Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: AppColors.primaryBlueSoft,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, color: AppColors.primaryBlue),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            title,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 14.5,
                              fontWeight: FontWeight.w700,
                              color: AppColors.textPrimary,
                            ),
                          ),
                        ),
                        if (badge != null) ...[
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 7,
                              vertical: 2,
                            ),
                            decoration: BoxDecoration(
                              color: AppColors.primaryBlueSoft,
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: Text(
                              badge,
                              style: const TextStyle(
                                fontSize: 10.5,
                                fontWeight: FontWeight.w700,
                                color: AppColors.primaryBlue,
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 3),
                    Text(
                      subtitle,
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppColors.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 6),
              const Icon(
                Icons.upload_rounded,
                size: 22,
                color: AppColors.primaryBlue,
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// Green card shown once a document is attached: preview, name, replace, delete.
  Widget _attachedCard({
    required _PendingDoc doc,
    required String title,
    required String subtitle,
    required bool locked,
    required VoidCallback onReplace,
    required VoidCallback onRemove,
  }) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.successGreen, width: 1.5),
      ),
      child: Row(
        children: [
          _thumb(doc),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 14.5,
                    fontWeight: FontWeight.w700,
                    color: AppColors.textPrimary,
                  ),
                ),
                const SizedBox(height: 3),
                Row(
                  children: [
                    const Icon(
                      Icons.check_circle,
                      size: 14,
                      color: AppColors.successGreen,
                    ),
                    const SizedBox(width: 4),
                    Flexible(
                      child: Text(
                        subtitle,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: AppColors.successGreen,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          IconButton(
            onPressed: locked ? null : onReplace,
            tooltip: 'Replace',
            visualDensity: VisualDensity.compact,
            icon: const Icon(
              Icons.refresh_rounded,
              size: 22,
              color: AppColors.primaryBlue,
            ),
          ),
          IconButton(
            onPressed: locked ? null : onRemove,
            tooltip: 'Remove',
            visualDensity: VisualDensity.compact,
            icon: const Icon(
              Icons.delete_outline,
              size: 22,
              color: AppColors.textTertiary,
            ),
          ),
        ],
      ),
    );
  }

  /// Header line with "x/2 uploaded" counter and a progress bar.
  Widget _docsProgress() {
    final aadhaarDone = _doc(_DocType.aadhaar).base64 != null;
    final proofDone =
        _doc(_DocType.udid).base64 != null ||
        _doc(_DocType.disability).base64 != null;
    final done = (aadhaarDone ? 1 : 0) + (proofDone ? 1 : 0);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Expanded(
              child: Text(
                'Upload 2 documents to continue',
                style: TextStyle(
                  fontSize: 12.5,
                  color: AppColors.textSecondary,
                ),
              ),
            ),
            Text(
              '$done/2 uploaded',
              style: TextStyle(
                fontSize: 12.5,
                fontWeight: FontWeight.w700,
                color: done == 2
                    ? AppColors.successGreen
                    : AppColors.primaryBlue,
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        ClipRRect(
          borderRadius: BorderRadius.circular(6),
          child: LinearProgressIndicator(
            value: done / 2,
            minHeight: 6,
            backgroundColor: AppColors.primaryBlueSoft,
            color: done == 2 ? AppColors.successGreen : AppColors.primaryBlue,
          ),
        ),
      ],
    );
  }

  /// One side (front or back) of the Aadhaar card.
  Widget _aadhaarSideTile({required bool front, required bool locked}) {
    final doc = _doc(front ? _DocType.aadhaar : _DocType.aadhaarBack);
    final busy = front ? _ocrBusyFront : _ocrBusyBack;
    final title = front ? 'Front side' : 'Back side';
    final hint = front ? 'Name, DOB, number' : 'Address';
    final bytes = doc.bytes;
    final disabled = locked || busy;

    // Nothing attached yet: dotted "scan" tile.
    if (bytes == null) {
      return InkWell(
        onTap: disabled ? null : () => _captureAadhaarSide(front: front),
        borderRadius: BorderRadius.circular(16),
        child: CustomPaint(
          foregroundPainter: const _DottedRoundedRectPainter(
            color: AppColors.dashedBorder,
          ),
          child: Container(
            height: 140,
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(16),
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: AppColors.primaryBlueSoft,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(
                    Icons.camera_alt_outlined,
                    color: AppColors.primaryBlue,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: AppColors.textPrimary,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  hint,
                  style: const TextStyle(
                    fontSize: 11.5,
                    color: AppColors.textSecondary,
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    }

    // Image attached: preview with check badge and small action buttons.
    Widget action(IconData icon, String tip, VoidCallback onTap) {
      return Tooltip(
        message: tip,
        child: InkWell(
          onTap: disabled ? null : onTap,
          customBorder: const CircleBorder(),
          child: Container(
            width: 30,
            height: 30,
            decoration: const BoxDecoration(
              color: Colors.white,
              shape: BoxShape.circle,
            ),
            child: Icon(icon, size: 17, color: AppColors.primaryBlue),
          ),
        ),
      );
    }

    return Container(
      height: 140,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.successGreen, width: 1.5),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(14.5),
        child: Stack(
          fit: StackFit.expand,
          children: [
            Image.memory(
              bytes,
              fit: BoxFit.cover,
              cacheWidth: 500,
              gaplessPlayback: true,
            ),
            // Bottom label bar
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 6,
                ),
                color: Colors.black54,
                child: Row(
                  children: [
                    const Icon(
                      Icons.check_circle,
                      size: 14,
                      color: Colors.white,
                    ),
                    const SizedBox(width: 5),
                    Text(
                      title,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            // Replace + remove
            Positioned(
              top: 6,
              right: 6,
              child: Row(
                children: [
                  action(
                    Icons.refresh_rounded,
                    'Replace',
                    () => _captureAadhaarSide(front: front),
                  ),
                  const SizedBox(width: 6),
                  action(Icons.delete_outline, 'Remove', () {
                    setState(() {
                      doc.base64 = null;
                      doc.name = null;
                    });
                  }),
                ],
              ),
            ),
            // OCR in progress
            if (busy)
              Container(
                color: Colors.black45,
                alignment: Alignment.center,
                child: const Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(
                        strokeWidth: 2.5,
                        color: Colors.white,
                      ),
                    ),
                    SizedBox(height: 8),
                    Text(
                      'Reading...',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
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

  /// Document 1: Aadhaar card, front and back, captured right here.
  Widget _aadhaarSlot(bool locked) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(child: _aadhaarSideTile(front: true, locked: locked)),
        const SizedBox(width: 12),
        Expanded(child: _aadhaarSideTile(front: false, locked: locked)),
      ],
    );
  }

  /// Document 2: UDID card OR Disability certificate (any one).
  Future<_DocType?> _chooseProofType() {
    return showModalBottomSheet<_DocType>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(
                LucideIcons.camera,
                color: AppColors.primaryBlue,
              ),
              title: const Text('UDID Card'),
              onTap: () => Navigator.pop(ctx, _DocType.udid),
            ),
            ListTile(
              leading: const Icon(
                LucideIcons.camera,
                color: AppColors.primaryBlue,
              ),
              title: const Text('Disability Certificate'),
              onTap: () => Navigator.pop(ctx, _DocType.disability),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _pickDisabilityProof() async {
    final type = await _chooseProofType();
    if (type == null || !mounted) return;
    await _uploadDocument(type);
  }

  /// Document 2: one upload section for UDID card OR Disability certificate.
  Widget _disabilityProofSlot(bool locked) {
    final udid = _doc(_DocType.udid);
    final cert = _doc(_DocType.disability);
    final attached = udid.base64 != null
        ? udid
        : (cert.base64 != null ? cert : null);

    if (attached != null) {
      return _attachedCard(
        doc: attached,
        title: attached.label,
        subtitle: _ocrBusyProof ? 'Reading details...' : 'Attached',
        locked: locked,
        onReplace: () => _uploadDocument(attached.type),
        onRemove: () => setState(() {
          attached.base64 = null;
          attached.name = null;
        }),
      );
    }

    return _emptyTile(
      icon: LucideIcons.camera,
      title: 'Disability Proof',
      badge: 'Required',
      subtitle: 'Upload UDID Card or Disability Certificate (any one)',
      onTap: locked ? null : _pickDisabilityProof,
    );
  }

  String? _requiredText(String? value, String fieldName) {
    final v = (value ?? '').trim();

    if (v.isEmpty) {
      return '$fieldName is required';
    }

    if (v.length < 2) {
      return 'Enter a valid $fieldName';
    }

    return null;
  }

  String? _validateMobile(String? value) {
    final v = (value ?? '').trim();

    if (v.isEmpty) {
      return 'Mobile number is required';
    }

    if (!RegExp(r'^[6-9][0-9]{9}$').hasMatch(v)) {
      return 'Enter a valid 10-digit mobile number';
    }

    return null;
  }

  String? _validatePincode(String? value) {
    final v = (value ?? '').trim();

    if (v.isEmpty) {
      return 'Pincode is required';
    }

    if (!RegExp(r'^\d{6}$').hasMatch(v)) {
      return 'Enter a valid 6-digit pincode';
    }

    return null;
  }

  String? _validateAadhaar(String? value) {
    final v = (value ?? '').replaceAll(RegExp(r'\D'), '');

    if (v.isEmpty) {
      return 'Aadhaar number is required';
    }

    if (v.length != 12) {
      return 'Aadhaar number must be 12 digits';
    }

    return null;
  }

  String? _validatePercentage(String? value) {
    final v = (value ?? '').trim();

    if (v.isEmpty) {
      return 'Disability percentage is required';
    }

    final n = int.tryParse(v);

    if (n == null || n < 1 || n > 100) {
      return 'Enter percentage between 1-100';
    }

    return null;
  }

  String? _validateDob(String? value) {
    if ((value ?? '').trim().isEmpty) {
      return 'Date of birth is required';
    }

    return null;
  }
  // ------------------------------------------------------------
  // SUBMIT
  // ------------------------------------------------------------

  Future<void> _submit() async {
    // ------------------------------------------------------------
    // DOCUMENT VALIDATION
    // ------------------------------------------------------------

    final aadhaar = _doc(_DocType.aadhaar);
    final aadhaarBack = _doc(_DocType.aadhaarBack);
    final udid = _doc(_DocType.udid);
    final disability = _doc(_DocType.disability);
    final certNo = _certNoController.text.trim();

    if (_mobileController.text.trim().isEmpty) {
      showAppSnackbar(context, 'Mobile number is required', error: true);
      return;
    }

    if (_occupationController.text.trim().isEmpty) {
      showAppSnackbar(context, 'Occupation is required', error: true);
      return;
    }

    if (_neededController.text.trim().isEmpty) {
      showAppSnackbar(context, 'Needed is required', error: true);
      return;
    }
    if (certNo.isEmpty) {
      showAppSnackbar(
        context,
        'Certificate / UDID No. is required.',
        warning: true,
      );
      return;
    }
    final disabilityPercentage = int.tryParse(
      _disabilityPctController.text.trim(),
    );

    if (_disabilityType == null || _disabilityType!.isEmpty) {
      showAppSnackbar(context, 'Disability type is required.', warning: true);
      return;
    }

    if (disabilityPercentage == null ||
        disabilityPercentage < 1 ||
        disabilityPercentage > 100) {
      showAppSnackbar(
        context,
        'Enter valid disability percentage between 1-100.',
        warning: true,
      );
      return;
    }
    if (aadhaar.base64 == null || aadhaar.base64!.isEmpty) {
      showAppSnackbar(
        context,
        'Aadhaar Card Front is required.',
        warning: true,
      );
      return;
    }

    final hasProof =
        (udid.base64 != null && udid.base64!.isNotEmpty) ||
        (disability.base64 != null && disability.base64!.isNotEmpty);

    if (!hasProof) {
      showAppSnackbar(
        context,
        'UDID Card or Disability Certificate is required.',
        warning: true,
      );
      return;
    }

    // ------------------------------------------------------------
    // FORM VALIDATION
    // ------------------------------------------------------------

    if (!_formKey.currentState!.validate()) {
      showAppSnackbar(
        context,
        'Please correct the highlighted fields.',
        warning: true,
      );
      return;
    }

    // ------------------------------------------------------------
    // NGO VALIDATION
    // ------------------------------------------------------------

    if (_selectedNgoId == null || _selectedNgoId!.trim().isEmpty) {
      showAppSnackbar(context, 'Please select an NGO.', warning: true);
      return;
    }

    // ------------------------------------------------------------
    // FINGERPRINT VALIDATION
    // ------------------------------------------------------------

    if (!_fingersReady || _captured.length < requiredFingers) {
      showAppSnackbar(
        context,
        'Please scan all 3 fingerprints before registering.',
        warning: true,
      );
      return;
    }

    setState(() {
      _loading = true;
      _created = null;
    });

    try {
      final fullName = _fullNameController.text.trim();
      final mobile = _mobileController.text.trim();
      final occupation = _occupationController.text.trim();
      final needed = _neededController.text.trim();
      final address = _locationController.text.trim();
      final city = _cityController.text.trim();
      final state = _stateController.text.trim();
      final pincode = _pincodeController.text.trim();
      final aadhaarNumber = _aadhaarController.text.replaceAll(
        RegExp(r'\D'),
        '',
      );
      final certNo = _certNoController.text.trim();
      final disabilityPercentage = int.tryParse(
        _disabilityPctController.text.trim(),
      );

      // ------------------------------------------------------------
      // API BODY
      // ------------------------------------------------------------

      final body = <String, dynamic>{
        'full_name': fullName,
        'ngo_id': _selectedNgoId,

        if (mobile.isNotEmpty) 'mobile': mobile,

        if (_dob != null)
          'date_of_birth':
              '${_dob!.year.toString().padLeft(4, '0')}-'
              '${_dob!.month.toString().padLeft(2, '0')}-'
              '${_dob!.day.toString().padLeft(2, '0')}',

        if (_gender != null && _gender!.isNotEmpty) 'gender': _gender,

        if (occupation.isNotEmpty) 'occupation': occupation,

        if (address.isNotEmpty) 'address_line_1': address,

        if (city.isNotEmpty) 'city': city,

        if (state.isNotEmpty) 'state': state,

        if (pincode.isNotEmpty) 'pincode': pincode,

        if (aadhaarNumber.isNotEmpty) 'aadhaar_number': aadhaarNumber,

        if (needed.isNotEmpty) 'needed': needed,

        if (_photo != null && _photo!.isNotEmpty) 'photo': _photo,

        // Disability API parameters
        'disabilities': [
          {
            'disability_type': _disabilityType!,
            'disability_percentage': disabilityPercentage!,
            'certificate_available': true,
            'certificate_number': certNo,
          },
        ],
      };

      debugPrint('BENEFICIARY API BODY: ${jsonEncode(body)}');

      // ------------------------------------------------------------
      // CREATE BENEFICIARY
      // ------------------------------------------------------------

      final result = await ApiService.post('/beneficiaries', body: body);

      final created = Map<String, dynamic>.from(result['beneficiary'] ?? {});

      final code = created['beneficiary_code']?.toString();
      final id = created['id'];

      // ------------------------------------------------------------
      // FINGERPRINT ENROLLMENT
      // ------------------------------------------------------------

      if (code != null && code.isNotEmpty) {
        for (final fingerprint in _captured) {
          await ApiService.post(
            '/biometrics/enroll',
            body: {'beneficiary_code': code, ...fingerprint.toEnrollBody()},
            timeout: const Duration(minutes: 1),
          );
        }
      }

      // ------------------------------------------------------------
      // DOCUMENT UPLOAD
      // ------------------------------------------------------------

      final serverWarnings =
          (result['warnings'] as List?)?.cast<String>() ?? const <String>[];

      final failedDocs = <String>[];

      if (id != null) {
        for (final doc in _docs.where(
          (d) => d.base64 != null && d.base64!.isNotEmpty,
        )) {
          var uploaded = false;

          for (var attempt = 1; attempt <= 3 && !uploaded; attempt++) {
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

              uploaded = true;
            } catch (_) {
              if (attempt < 3) {
                await Future<void>.delayed(
                  Duration(milliseconds: 800 * attempt),
                );
              }
            }
          }

          if (!uploaded) {
            failedDocs.add(_docLabel(doc.type));
          }
        }
      }

      if (!mounted) return;

      setState(() {
        _loading = false;
        _created = created;
      });

      final headline = code != null && code.isNotEmpty
          ? 'Beneficiary registered: $code'
          : 'Beneficiary registered successfully';

      final problems = <String>[
        ...failedDocs.map((d) => 'Could not upload $d'),
        ...serverWarnings,
      ];

      if (problems.isEmpty) {
        showAppSnackbar(context, headline, success: true);
      } else {
        showAppSnackbar(
          context,
          '$headline. ${problems.join('. ')}',
          warning: true,
        );
      }

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
      case _DocType.aadhaarBack:
        return 'aadhaar_card';
      case _DocType.udid:
        return 'udid_card';
      case _DocType.disability:
        return 'handicap_certificate';
    }
  }

  // ------------------------------------------------------------
  // BUILD
  // ------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    final created = _created;

    return Scaffold(
      appBar: AppBar(title: const Text('Add Beneficiary')),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(24, 8, 24, 32),
          children: [
            // ============================================================
            // DOCUMENTS
            // ============================================================
            const SectionHeader(title: 'Documents'),
            const SizedBox(height: 8),

            _docsProgress(),
            const SizedBox(height: 16),

            const Text(
              '1. Aadhaar Card (Front & Back)',
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: AppColors.textPrimary,
              ),
            ),

            const SizedBox(height: 4),

            const Text(
              'Capture both sides here. Details are filled in automatically.',
              style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
            ),

            const SizedBox(height: 10),

            _aadhaarSlot(_loading || created != null),

            const SizedBox(height: 18),

            const Text(
              '2. Disability Proof (UDID or Certificate)',
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: AppColors.textPrimary,
              ),
            ),

            const SizedBox(height: 8),

            _disabilityProofSlot(_loading || created != null),

            const SizedBox(height: 24),

            // ============================================================
            // PERSONAL INFORMATION
            // ============================================================
            const SectionHeader(title: 'Personal Information'),
            const SizedBox(height: 16),

            // ------------------------------------------------------------
            // NGO
            // ------------------------------------------------------------
            DropdownButtonFormField2<String>(
              valueListenable: ValueNotifier<String?>(
                _ngoIdSet().contains(_selectedNgoId) ? _selectedNgoId : null,
              ),
              decoration: InputDecoration(
                label: Text.rich(
                  TextSpan(
                    children: [
                      const TextSpan(
                        text: 'NGO',
                        style: TextStyle(
                          fontSize: 12.5,
                          color: AppColors.textSecondary,
                        ),
                      ),
                      const TextSpan(
                        text: ' *',
                        style: TextStyle(
                          fontSize: 12.5,
                          color: Colors.red,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              hint: const Text(
                'Select NGO',
                style: TextStyle(
                  fontSize: 12.5,
                  color: AppColors.textSecondary,
                ),
              ),
              items: _ngoItems()
                  .map(
                    (item) => DropdownItem<String>(
                      value: item.value,
                      child: Text(
                        item.child is Text
                            ? ((item.child as Text).data ?? 'NGO')
                            : 'NGO',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 12.5,
                          color: AppColors.textPrimary,
                        ),
                      ),
                    ),
                  )
                  .toList(),
              isExpanded: true,
              onChanged: (_loading || created != null)
                  ? null
                  : (value) {
                      setState(() {
                        _selectedNgoId = value;
                      });
                    },
              validator: (value) {
                if (value == null || value.isEmpty) {
                  return 'Please select an NGO';
                }
                return null;
              },
              buttonStyleData: const FormFieldButtonStyleData(
                height: 20,
                padding: EdgeInsets.only(left: 12, right: 8),
              ),
              iconStyleData: const IconStyleData(iconSize: 18),
              dropdownStyleData: const DropdownStyleData(
                maxHeight: 240,
                padding: EdgeInsets.symmetric(vertical: 4),
              ),
              menuItemStyleData: const MenuItemStyleData(
                padding: EdgeInsets.symmetric(horizontal: 12),
              ),
            ),

            const SizedBox(height: 16),

            // ------------------------------------------------------------
            // FULL NAME
            // ------------------------------------------------------------
            TextFormField(
              controller: _fullNameController,
              style: const TextStyle(
                fontSize: 13,
                color: AppColors.textPrimary,
              ),
              decoration: InputDecoration(
                label: Text.rich(
                  TextSpan(
                    children: [
                      const TextSpan(
                        text: 'Full Name',
                        style: TextStyle(
                          fontSize: 12.5,
                          color: AppColors.textSecondary,
                        ),
                      ),
                      const TextSpan(
                        text: ' *',
                        style: TextStyle(
                          fontSize: 12.5,
                          color: Colors.red,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              textCapitalization: TextCapitalization.words,
              validator: (v) {
                if (v == null || v.trim().isEmpty) {
                  return 'Full name is required';
                }

                if (v.trim().length < 2) {
                  return 'Enter a valid full name';
                }

                return null;
              },
              enabled: !_loading && created == null,
            ),

            const SizedBox(height: 16),

            // ------------------------------------------------------------
            // MOBILE NUMBER
            // ------------------------------------------------------------
            TextFormField(
              controller: _mobileController,
              style: const TextStyle(
                fontSize: 13,
                color: AppColors.textPrimary,
              ),
              keyboardType: TextInputType.phone,
              maxLength: 10,
              decoration: InputDecoration(
                label: Text.rich(
                  TextSpan(
                    children: [
                      const TextSpan(
                        text: 'Mobile Number',
                        style: TextStyle(
                          fontSize: 12.5,
                          color: AppColors.textSecondary,
                        ),
                      ),
                      const TextSpan(
                        text: ' *',
                        style: TextStyle(
                          fontSize: 12.5,
                          color: Colors.red,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
                counterText: '',
              ),
              validator: _validateMobile,
              enabled: !_loading && created == null,
            ),

            const SizedBox(height: 16),

            // ------------------------------------------------------------
            // GENDER + DATE OF BIRTH
            // ------------------------------------------------------------
            LayoutBuilder(
              builder: (context, box) {
                final genderField = DropdownButtonFormField2<String>(
                  valueListenable: ValueNotifier<String?>(_gender),
                  decoration: InputDecoration(
                    label: Text.rich(
                      TextSpan(
                        children: [
                          const TextSpan(
                            text: 'Gender',
                            style: TextStyle(
                              fontSize: 12.5,
                              color: AppColors.textSecondary,
                            ),
                          ),
                          const TextSpan(
                            text: ' *',
                            style: TextStyle(
                              fontSize: 12.5,
                              color: Colors.red,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  isExpanded: true,
                  items: ['Male', 'Female', 'Other', 'Transgender']
                      .map(
                        (g) => DropdownItem<String>(
                          value: g,
                          child: Text(
                            g,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 12.5),
                          ),
                        ),
                      )
                      .toList(),
                  onChanged: created == null
                      ? (v) => setState(() => _gender = v)
                      : null,
                  validator: (v) {
                    if (v == null || v.isEmpty) {
                      return 'Gender is required';
                    }
                    return null;
                  },
                  buttonStyleData: const FormFieldButtonStyleData(
                    height: 30,
                    padding: EdgeInsets.only(left: 16, right: 8),
                  ),
                  iconStyleData: const IconStyleData(iconSize: 20),
                  dropdownStyleData: const DropdownStyleData(
                    maxHeight: 220,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.all(Radius.circular(12)),
                    ),
                  ),
                  menuItemStyleData: const MenuItemStyleData(
                    padding: EdgeInsets.symmetric(horizontal: 12),
                  ),
                );

                final dobField = GestureDetector(
                  onTap: created == null ? _pickDob : null,
                  child: AbsorbPointer(
                    child: TextFormField(
                      controller: _dobController,
                      readOnly: true,
                      decoration: InputDecoration(
                        label: Text.rich(
                          TextSpan(
                            children: [
                              const TextSpan(
                                text: 'Date of Birth',
                                style: TextStyle(
                                  fontSize: 12.5,
                                  color: AppColors.textSecondary,
                                ),
                              ),
                              const TextSpan(
                                text: ' *',
                                style: TextStyle(
                                  fontSize: 12.5,
                                  color: Colors.red,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ],
                          ),
                        ),
                        hintText: 'Select date',
                        suffixIcon: const Icon(LucideIcons.calendar, size: 18),
                      ),
                      validator: _validateDob,
                    ),
                  ),
                );

                if (box.maxWidth < 320) {
                  return Column(
                    children: [
                      genderField,
                      const SizedBox(height: 16),
                      dobField,
                    ],
                  );
                }

                return Row(
                  children: [
                    Expanded(child: genderField),
                    const SizedBox(width: 12),
                    Expanded(child: dobField),
                  ],
                );
              },
            ),

            const SizedBox(height: 16),

            // ------------------------------------------------------------
            // OCCUPATION
            // ------------------------------------------------------------
            TextFormField(
              controller: _occupationController,
              decoration: InputDecoration(
                label: Text.rich(
                  TextSpan(
                    children: [
                      const TextSpan(
                        text: 'Occupation',
                        style: TextStyle(
                          fontSize: 12.5,
                          color: AppColors.textSecondary,
                        ),
                      ),
                      const TextSpan(
                        text: ' *',
                        style: TextStyle(
                          fontSize: 12.5,
                          color: Colors.red,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              textCapitalization: TextCapitalization.words,
              validator: (v) {
                final value = (v ?? '').trim();

                if (value.isEmpty) {
                  return 'Occupation is required';
                }

                if (value.length < 2) {
                  return 'Enter a valid occupation';
                }

                return null;
              },
              enabled: !_loading && created == null,
            ),

            const SizedBox(height: 16),

            // ------------------------------------------------------------
            // NEEDED
            // ------------------------------------------------------------
            TextFormField(
              controller: _neededController,
              decoration: InputDecoration(
                label: Text.rich(
                  TextSpan(
                    children: [
                      const TextSpan(
                        text: 'Needed',
                        style: TextStyle(
                          fontSize: 12.5,
                          color: AppColors.textSecondary,
                        ),
                      ),
                      const TextSpan(
                        text: ' *',
                        style: TextStyle(
                          fontSize: 12.5,
                          color: Colors.red,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
                hintText: 'What does the beneficiary need?',
              ),
              textCapitalization: TextCapitalization.sentences,
              maxLines: 2,
              validator: (v) {
                final value = (v ?? '').trim();

                if (value.isEmpty) {
                  return 'Needed is required';
                }

                if (value.length < 2) {
                  return 'Enter valid requirement';
                }

                return null;
              },
              enabled: !_loading && created == null,
            ),

            const SizedBox(height: 16),

            // ------------------------------------------------------------
            // LOCATION
            // ------------------------------------------------------------
            TextFormField(
              controller: _locationController,
              decoration: InputDecoration(
                label: Text.rich(
                  TextSpan(
                    children: [
                      const TextSpan(
                        text: 'Location',
                        style: TextStyle(
                          fontSize: 12.5,
                          color: AppColors.textSecondary,
                        ),
                      ),
                      const TextSpan(
                        text: ' *',
                        style: TextStyle(
                          fontSize: 12.5,
                          color: Colors.red,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              textCapitalization: TextCapitalization.words,
              maxLines: 3,
              validator: (v) => _requiredText(v, 'Location'),
              enabled: !_loading && created == null,
            ),

            const SizedBox(height: 16),

            // ------------------------------------------------------------
            // CITY + STATE
            // ------------------------------------------------------------
            Row(
              children: [
                Expanded(
                  child: TextFormField(
                    controller: _cityController,
                    decoration: InputDecoration(
                      label: Text.rich(
                        TextSpan(
                          children: [
                            const TextSpan(
                              text: 'City',
                              style: TextStyle(
                                fontSize: 12.5,
                                color: AppColors.textSecondary,
                              ),
                            ),
                            const TextSpan(
                              text: ' *',
                              style: TextStyle(
                                fontSize: 12.5,
                                color: Colors.red,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    textCapitalization: TextCapitalization.words,
                    validator: (v) => _requiredText(v, 'City'),
                    enabled: !_loading && created == null,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: TextFormField(
                    controller: _stateController,
                    decoration: InputDecoration(
                      label: Text.rich(
                        TextSpan(
                          children: [
                            const TextSpan(
                              text: 'State',
                              style: TextStyle(
                                fontSize: 12.5,
                                color: AppColors.textSecondary,
                              ),
                            ),
                            const TextSpan(
                              text: ' *',
                              style: TextStyle(
                                fontSize: 12.5,
                                color: Colors.red,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    textCapitalization: TextCapitalization.words,
                    validator: (v) => _requiredText(v, 'State'),
                    enabled: !_loading && created == null,
                  ),
                ),
              ],
            ),

            const SizedBox(height: 16),

            // ------------------------------------------------------------
            // PINCODE
            // ------------------------------------------------------------
            TextFormField(
              controller: _pincodeController,
              style: const TextStyle(fontSize: 13),
              decoration: InputDecoration(
                label: Text.rich(
                  TextSpan(
                    children: [
                      const TextSpan(
                        text: 'Pincode',
                        style: TextStyle(
                          fontSize: 12.5,
                          color: AppColors.textSecondary,
                        ),
                      ),
                      const TextSpan(
                        text: ' *',
                        style: TextStyle(
                          fontSize: 12.5,
                          color: Colors.red,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
                counterText: '',
              ),
              keyboardType: TextInputType.number,
              maxLength: 6,
              validator: _validatePincode,
              enabled: !_loading && created == null,
            ),

            const SizedBox(height: 16),

            // ------------------------------------------------------------
            // AADHAAR NUMBER
            // ------------------------------------------------------------
            TextFormField(
              controller: _aadhaarController,
              style: const TextStyle(fontSize: 13),
              decoration: InputDecoration(
                label: Text.rich(
                  TextSpan(
                    children: [
                      const TextSpan(
                        text: 'Aadhaar Number',
                        style: TextStyle(
                          fontSize: 12.5,
                          color: AppColors.textSecondary,
                        ),
                      ),
                      const TextSpan(
                        text: ' *',
                        style: TextStyle(
                          fontSize: 12.5,
                          color: Colors.red,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
                counterText: '',
              ),
              keyboardType: TextInputType.number,
              maxLength: 12,
              validator: _validateAadhaar,
              enabled: !_loading && created == null,
            ),

            const SizedBox(height: 16),

            // ------------------------------------------------------------
            // CERTIFICATE / UDID NUMBER
            // ------------------------------------------------------------
            TextFormField(
              controller: _certNoController,
              style: const TextStyle(fontSize: 13),
              decoration: InputDecoration(
                label: Text.rich(
                  TextSpan(
                    children: [
                      const TextSpan(
                        text: 'Certificate / UDID No.',
                        style: TextStyle(
                          fontSize: 12.5,
                          color: AppColors.textSecondary,
                        ),
                      ),
                      const TextSpan(
                        text: ' *',
                        style: TextStyle(
                          fontSize: 12.5,
                          color: Colors.red,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              textCapitalization: TextCapitalization.characters,
              validator: (v) => _requiredText(v, 'Certificate / UDID No.'),
              enabled: !_loading && created == null,
            ),

            const SizedBox(height: 24),
            // ============================================================
            // DISABILITY DETAILS
            // ============================================================
            const SectionHeader(title: 'Disability Details'),
            const SizedBox(height: 16),

            // ------------------------------------------------------------
            // DISABILITY TYPE
            // ------------------------------------------------------------
            DropdownButtonFormField2<String>(
              valueListenable: ValueNotifier<String?>(_disabilityType),
              decoration: InputDecoration(
                label: Text.rich(
                  TextSpan(
                    children: [
                      const TextSpan(
                        text: 'Disability Type',
                        style: TextStyle(
                          fontSize: 12.5,
                          color: AppColors.textSecondary,
                        ),
                      ),
                      const TextSpan(
                        text: ' *',
                        style: TextStyle(
                          fontSize: 12.5,
                          color: Colors.red,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              hint: const Text('Select disability type'),
              items: _disabilityTypes
                  .map(
                    (t) => DropdownItem<String>(
                      value: t,
                      child: Text(
                        t,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 12.5,
                          color: AppColors.textPrimary,
                        ),
                      ),
                    ),
                  )
                  .toList(),
              isExpanded: true,
              onChanged: (_loading || created != null)
                  ? null
                  : (v) => setState(() => _disabilityType = v),
              validator: (v) => v == null ? 'Select disability type' : null,
              buttonStyleData: const FormFieldButtonStyleData(height: 20),
              iconStyleData: const IconStyleData(iconSize: 20),
              dropdownStyleData: const DropdownStyleData(
                maxHeight: 260,
                padding: EdgeInsets.symmetric(vertical: 4),
              ),
              menuItemStyleData: const MenuItemStyleData(
                padding: EdgeInsets.symmetric(horizontal: 12),
              ),
            ),

            const SizedBox(height: 16),

            // ------------------------------------------------------------
            // DISABILITY PERCENTAGE
            // ------------------------------------------------------------
            TextFormField(
              controller: _disabilityPctController,
              style: const TextStyle(fontSize: 13),
              decoration: InputDecoration(
                label: Text.rich(
                  TextSpan(
                    children: [
                      const TextSpan(
                        text: 'Disability Percentage (%)',
                        style: TextStyle(
                          fontSize: 12.5,
                          color: AppColors.textSecondary,
                        ),
                      ),
                      const TextSpan(
                        text: ' *',
                        style: TextStyle(
                          fontSize: 12.5,
                          color: Colors.red,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
                counterText: '',
              ),
              keyboardType: TextInputType.number,
              maxLength: 3,
              validator: _validatePercentage,
              enabled: !_loading && created == null,
            ),

            const SizedBox(height: 12),
            // ============================================================
            // PHOTO
            // ============================================================
            const SectionHeader(title: 'Photo'),
            const SizedBox(height: 16),

            _photoSection(),

            const SizedBox(height: 28),

            // ============================================================
            // FINGERPRINTS
            // ============================================================
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

            // ------------------------------------------------------------
            // REGISTER BUTTON
            // ------------------------------------------------------------
            SizedBox(
              child: ElevatedButton.icon(
                onPressed: (_fingersReady && !_loading) ? _submit : null,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primaryBlueSoft,
                  foregroundColor: AppColors.addBeneficiaryText,
                  disabledBackgroundColor: AppColors.primaryBlueSoft.withValues(
                    alpha: 0.5,
                  ),
                  disabledForegroundColor: AppColors.addBeneficiaryText
                      .withValues(alpha: 0.5),
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
}

class _DottedRoundedRectPainter extends CustomPainter {
  final Color color;

  const _DottedRoundedRectPainter({required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    const dotRadius = 2.2;
    const gap = 5.0;
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.fill;
    final path = Path()
      ..addRRect(
        RRect.fromRectAndRadius(Offset.zero & size, const Radius.circular(16)),
      );
    for (final metric in path.computeMetrics()) {
      var dist = 0.0;
      while (dist < metric.length) {
        final tangent = metric.getTangentForOffset(dist);
        if (tangent != null) {
          canvas.drawCircle(tangent.position, dotRadius, paint);
        }
        dist += dotRadius * 2 + gap;
      }
    }
  }

  @override
  bool shouldRepaint(covariant _DottedRoundedRectPainter oldDelegate) =>
      oldDelegate.color != color;
}
