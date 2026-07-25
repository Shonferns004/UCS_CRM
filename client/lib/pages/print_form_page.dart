import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:printing/printing.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import '../services/api_service.dart';

class PrintFormPage extends StatefulWidget {
  const PrintFormPage({super.key});

  @override
  State<PrintFormPage> createState() => _PrintFormPageState();
}

class _PrintFormPageState extends State<PrintFormPage> {
  bool _loading = true;
  Map<String, dynamic>? _data;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    try {
      final result = await ApiService.getPrintProfile();
      setState(() {
        _data = result;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
        _loading = false;
      });
    }
  }

  Future<Uint8List> _buildPdf(PdfPageFormat format) async {
    if (_data == null) return Uint8List(0);

    final profile = _data!['profile'] as Map<String, dynamic>? ?? {};
    final policies = _data!['policies'] as List<dynamic>? ?? [];
    final education = profile['education'] as List<dynamic>? ?? [];
    final family = profile['family'] as List<dynamic>? ?? [];
    final references = profile['references'] as List<dynamic>? ?? [];

    final darkBlue = PdfColor.fromInt(0xFF00152a);
    final gray = PdfColor.fromInt(0xFF74777e);
    final borderGray = PdfColor.fromInt(0xFFcccccc);
    final headerBg = PdfColor.fromInt(0xFFf0f4f8);

    final doc = pw.Document();

    doc.addPage(
      pw.MultiPage(
        pageFormat: format,
        margin: const pw.EdgeInsets.all(40),
        header: (context) => pw.Column(
          children: [
            pw.Text('Employee Onboarding Form',
              style: pw.TextStyle(fontSize: 22, fontWeight: pw.FontWeight.bold, color: darkBlue)),
            if (profile['name'] != null)
              pw.Text('${profile['name']}${profile['login_id'] != null ? ' · ${profile['login_id']}' : ''}',
                style: pw.TextStyle(fontSize: 12, color: gray)),
          ],
        ),
        footer: (context) => pw.Text('Generated on ${DateTime.now().toLocal().toString().split('.')[0]}',
          style: pw.TextStyle(fontSize: 9, color: gray)),
        build: (context) => [
          _section('1. Personal Details', darkBlue),
          _infoRow('Full Name', profile['name'] ?? '', gray),
          _infoRow('Email', profile['email'] ?? '', gray),
          _infoRow('Phone', profile['phone'] ?? '-', gray),
          _infoRow('Alt Phone', profile['alternate_phone'] ?? '-', gray),
          _infoRow('Gender', profile['gender'] ?? '-', gray),
          _infoRow('DOB', profile['dob']?.toString() ?? '-', gray),
          _infoRow('Address', profile['address'] ?? '-', gray),
          _infoRow('City', profile['city'] ?? '-', gray),
          _infoRow('State', profile['state'] ?? '-', gray),
          _infoRow('Pincode', profile['pincode'] ?? '-', gray),
          _section('2. Educational Qualifications', darkBlue),
          if (education.isNotEmpty)
            pw.Table(
              border: pw.TableBorder.all(color: borderGray),
              children: [
                _tableHeader(['#', 'Degree', 'Institution', 'University', 'Year', '% / Grade'], headerBg),
                ...education.asMap().entries.map((e) {
                  final ed = e.value as Map<String, dynamic>;
                  return _tableRow([
                    '${e.key + 1}',
                    ed['degree'] ?? '',
                    ed['institution'] ?? '',
                    ed['university'] ?? '-',
                    ed['year_of_passing']?.toString() ?? '-',
                    ed['percentage'] ?? '-',
                  ]);
                }),
              ],
            )
          else
            _empty('No education details provided.', gray),
          _section('3. Family Details', darkBlue),
          if (family.isNotEmpty)
            pw.Table(
              border: pw.TableBorder.all(color: borderGray),
              children: [
                _tableHeader(['#', 'Name', 'Relationship', 'Occupation', 'Phone', 'DOB'], headerBg),
                ...family.asMap().entries.map((e) {
                  final f = e.value as Map<String, dynamic>;
                  return _tableRow([
                    '${e.key + 1}',
                    f['name'] ?? '',
                    f['relationship'] ?? '',
                    f['occupation'] ?? '-',
                    f['phone'] ?? '-',
                    f['dob'] ?? '-',
                  ]);
                }),
              ],
            )
          else
            _empty('No family details provided.', gray),
          _section('4. Professional References', darkBlue),
          if (references.isNotEmpty)
            pw.Table(
              border: pw.TableBorder.all(color: borderGray),
              children: [
                _tableHeader(['#', 'Name', 'Designation', 'Organization', 'Phone'], headerBg),
                ...references.asMap().entries.map((e) {
                  final r = e.value as Map<String, dynamic>;
                  return _tableRow([
                    '${e.key + 1}',
                    r['name'] ?? '',
                    r['designation'] ?? '-',
                    r['organization'] ?? '-',
                    r['phone'] ?? '-',
                  ]);
                }),
              ],
            )
          else
            _empty('No references provided.', gray),
          _section('5. Documents & Bank', darkBlue),
          _infoRow('Aadhaar Front', profile['aadhar_front_url'] != null ? 'Uploaded' : 'Not uploaded', gray),
          _infoRow('Aadhaar Back', profile['aadhar_back_url'] != null ? 'Uploaded' : 'Not uploaded', gray),
          _infoRow('PAN Card', profile['pan_card_url'] != null ? 'Uploaded' : 'Not uploaded', gray),
          _infoRow('Bank Proof', profile['bank_proof_url'] != null ? 'Uploaded' : 'Not uploaded', gray),
          _infoRow('Light Bill', profile['light_bill_url'] != null ? 'Uploaded' : 'Not uploaded', gray),
          _infoRow('Bank Name', profile['bank_name'] ?? '-', gray),
          _infoRow('Bank Account', profile['account_holder_name'] ?? '-', gray),
          _infoRow('IFSC', profile['ifsc_code'] ?? '-', gray),
          _infoRow('Account No', profile['account_number'] ?? '-', gray),
          _section('6. Declaration', darkBlue),
          pw.SizedBox(height: 8),
          pw.Text('Contact No: ${profile['phone'] ?? '________'}',
            style: pw.TextStyle(fontSize: 11, color: darkBlue)),
          pw.SizedBox(height: 8),
          pw.Text(
            'I hereby declare that the above statements made in my application form are true, complete and correct to the best of my knowledge and belief. In the event of any information being found false or incorrect at any stage, my services are liable to be terminated without notice.',
            style: pw.TextStyle(fontSize: 10, lineSpacing: 1.6, color: darkBlue)),
          pw.SizedBox(height: 8),
          _infoRow('Date', profile['declaration_date'] ?? '-', gray),
          _infoRow('Place', profile['declaration_place'] ?? '-', gray),
          _section('7. Company Policies & Norms', darkBlue),
          ...policies.asMap().entries.map((e) {
            final p = e.value as Map<String, dynamic>;
            return pw.Column(
              crossAxisAlignment: pw.CrossAxisAlignment.start,
              children: [
                pw.SizedBox(height: 12),
                pw.Text('${e.key + 1}. ${p['title'] ?? ''}',
                  style: pw.TextStyle(fontSize: 13, fontWeight: pw.FontWeight.bold, color: darkBlue)),
                pw.SizedBox(height: 4),
                pw.Text(p['content'] ?? '',
                  style: pw.TextStyle(fontSize: 10, lineSpacing: 1.5)),
              ],
            );
          }),
        ],
      ),
    );

    return doc.save();
  }

  pw.Widget _section(String title, PdfColor color) {
    return pw.Column(
      children: [
        pw.SizedBox(height: 20),
        pw.Container(
          padding: const pw.EdgeInsets.only(bottom: 4),
          decoration: pw.BoxDecoration(
            border: pw.Border(bottom: pw.BorderSide(color: PdfColor.fromInt(0xFFdddddd))),
          ),
          child: pw.Text(title,
            style: pw.TextStyle(fontSize: 15, fontWeight: pw.FontWeight.bold, color: color)),
        ),
        pw.SizedBox(height: 8),
      ],
    );
  }

  pw.Widget _infoRow(String label, String value, PdfColor labelColor) {
    return pw.Padding(
      padding: const pw.EdgeInsets.symmetric(vertical: 2),
      child: pw.Row(
        children: [
          pw.SizedBox(
            width: 120,
            child: pw.Text(label,
              style: pw.TextStyle(fontSize: 10, fontWeight: pw.FontWeight.bold, color: labelColor)),
          ),
          pw.Text(value.isEmpty ? '-' : value,
            style: pw.TextStyle(fontSize: 10)),
        ],
      ),
    );
  }

  pw.TableRow _tableHeader(List<String> headers, PdfColor bgColor) {
    return pw.TableRow(
      decoration: pw.BoxDecoration(color: bgColor),
      children: headers.map((h) => _cell(h, bold: true)).toList(),
    );
  }

  pw.TableRow _tableRow(List<String> cells) {
    return pw.TableRow(
      children: cells.map((c) => _cell(c)).toList(),
    );
  }

  pw.Widget _cell(String text, {bool bold = false}) {
    return pw.Padding(
      padding: const pw.EdgeInsets.all(6),
      child: pw.Text(text,
        style: pw.TextStyle(fontSize: 9, fontWeight: bold ? pw.FontWeight.bold : pw.FontWeight.normal)),
    );
  }

  pw.Widget _empty(String msg, PdfColor gray) {
    return pw.Padding(
      padding: const pw.EdgeInsets.symmetric(vertical: 8),
      child: pw.Text(msg,
        style: pw.TextStyle(fontSize: 10, color: gray, fontStyle: pw.FontStyle.italic)),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFf6fafe),
      appBar: AppBar(
        backgroundColor: const Color(0xFF00152a),
        foregroundColor: Colors.white,
        title: Text('Print Form', style: GoogleFonts.hankenGrotesk(fontSize: 18, fontWeight: FontWeight.w700)),
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(LucideIcons.circleAlert, size: 48, color: Colors.red.shade300),
              const SizedBox(height: 16),
              Text('Failed to load data', style: GoogleFonts.hankenGrotesk(fontSize: 18, fontWeight: FontWeight.w600)),
              const SizedBox(height: 8),
              Text(_error!, textAlign: TextAlign.center, style: TextStyle(fontSize: 14, color: const Color(0xFF74777e))),
              const SizedBox(height: 24),
              ElevatedButton(
                onPressed: () { setState(() => _loading = true); _loadData(); },
                style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF00152a), foregroundColor: Colors.white),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
      );
    }

    return PdfPreview(
      build: (format) => _buildPdf(format),
      pdfFileName: 'onboarding_form_${_data!['profile']?['name'] ?? 'employee'}',
      loadingWidget: const Center(child: CircularProgressIndicator()),
      canChangeOrientation: true,
      canDebug: false,
      initialPageFormat: PdfPageFormat.a4,
      padding: const EdgeInsets.all(8),
    );
  }
}
