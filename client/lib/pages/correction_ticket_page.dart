import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:intl/intl.dart';
import 'package:google_fonts/google_fonts.dart';
import '../services/api_service.dart';
import '../services/realtime_service.dart';
import '../main.dart';
import '../widgets/skeleton_loader.dart';
import '../utils/responsive.dart';

class CorrectionTicketPage extends StatefulWidget {
  final ScrollController? scrollController;
  const CorrectionTicketPage({super.key, this.scrollController});

  @override
  State<CorrectionTicketPage> createState() => _CorrectionTicketPageState();
}

class _CorrectionTicketPageState extends State<CorrectionTicketPage> {
  final _formKey = GlobalKey<FormState>();
  List<dynamic> _history = [];
  bool _loadingHistory = true;
  bool _submitting = false;
  String? _error;

  dynamic _selectedRecord;
  String _field = 'punch_in';
  TimeOfDay _correctedTime = TimeOfDay.now();
  final _reasonController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _loadHistory();
    RealtimeService.instance.addListener(_onRealtimeChange);
  }

  @override
  void dispose() {
    RealtimeService.instance.removeListener(_onRealtimeChange);
    _reasonController.dispose();
    super.dispose();
  }

  void _onRealtimeChange() {
    final event = RealtimeService.instance.lastEvent;
    if (event == RealtimeEvent.attendance || event == RealtimeEvent.corrections) {
      _loadHistory();
    }
  }

  Future<void> _loadHistory() async {
    try {
      final history = await ApiService.getHistory();
      if (mounted) setState(() { _history = history; _loadingHistory = false; });
    } catch (e) {
      if (mounted) setState(() { _error = e.toString(); _loadingHistory = false; });
    }
  }

  Future<void> _submit() async {
    if (_selectedRecord == null) return;
    if (_reasonController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please provide a reason')),
      );
      return;
    }
    setState(() => _submitting = true);
    try {
      final now = DateTime.now();
      final dateStr = _selectedRecord!['date'] as String;
      final correctedDateTime = DateTime(
        int.parse(dateStr.split('-')[0]),
        int.parse(dateStr.split('-')[1]),
        int.parse(dateStr.split('-')[2]),
        _correctedTime.hour,
        _correctedTime.minute,
      );
      await ApiService.raiseCorrectionTicket({
        'attendance_id': _selectedRecord!['id'],
        'date': dateStr,
        'field': _field,
        'requested_time': correctedDateTime.toUtc().toIso8601String(),
        'reason': _reasonController.text.trim(),
      });
      if (mounted) {
        Navigator.of(context).pop(true);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Ticket raised successfully')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))),
        );
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Widget _label(String text) {
    final colors = Theme.of(context).extension<AppColors>()!;
    return Text(text, style: Theme.of(context).textTheme.labelMedium?.copyWith(color: colors.outline));
  }

  @override
  Widget build(BuildContext context) {
    final sc = Theme.of(context).colorScheme;
    final colors = Theme.of(context).extension<AppColors>()!;
    return Scaffold(
      body: SafeArea(child: Column(
        children: [
          Padding(
            padding: EdgeInsets.symmetric(horizontal: Responsive.pad(context, 16), vertical: Responsive.pad(context, 8)),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Raise a Ticket', style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w700, color: sc.primary,
                )),
              ],
            ),
          ),
          Expanded(
            child: ListView(
              padding: EdgeInsets.fromLTRB(Responsive.pad(context, 16), Responsive.pad(context, 8), Responsive.pad(context, 16), Responsive.pad(context, 80)),
              children: [
                Container(
                  padding: EdgeInsets.all(Responsive.pad(context, 20)),
                  decoration: BoxDecoration(
                    color: colors.surfaceContainerLowest,
                    borderRadius: BorderRadius.circular(12),
                    boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 8, offset: const Offset(0, 2))],
                  ),
                  child: _loadingHistory
                      ? SkeletonLoader(
                          child: Padding(
                            padding: EdgeInsets.all(Responsive.pad(context, 20)),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                _label('Select Date'),
                                SizedBox(height: Responsive.pad(context, 8)),
                                SkeletonBlock(height: Responsive.pad(context, 48)),
                                SizedBox(height: Responsive.pad(context, 20)),
                                _label('Field'),
                                SizedBox(height: Responsive.pad(context, 8)),
                                SkeletonBlock(height: Responsive.pad(context, 48)),
                                SizedBox(height: Responsive.pad(context, 20)),
                                _label('Corrected Time'),
                                SizedBox(height: Responsive.pad(context, 8)),
                                SkeletonBlock(height: Responsive.pad(context, 48)),
                                SizedBox(height: Responsive.pad(context, 20)),
                                _label('Reason'),
                                SizedBox(height: Responsive.pad(context, 8)),
                                SkeletonBlock(height: Responsive.pad(context, 80)),
                              ],
                            ),
                          ),
                        )
                      : _error != null
                          ? Padding(
                              padding: EdgeInsets.symmetric(vertical: Responsive.pad(context, 40)),
                              child: Center(child: Text(_error!, style: const TextStyle(color: Colors.red))),
                            )
                          : _history.isEmpty
                              ? Padding(
                                  padding: EdgeInsets.symmetric(vertical: Responsive.pad(context, 40)),
                                  child: const Center(child: Text('No attendance records found')),
                                )
                              : _buildFormContent(colors, sc),
                ),
              ],
            ),
          ),
        ],
      )),
    );
  }

  Widget _buildFormContent(AppColors colors, ColorScheme sc) {
    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _label('Select Date'),
          SizedBox(height: Responsive.pad(context, 8)),
          DropdownButtonFormField<dynamic>(
            value: _selectedRecord,
            decoration: InputDecoration(
              hintText: 'Choose a date',
              hintStyle: TextStyle(fontSize: Responsive.sp(context, 14), color: sc.onSurfaceVariant),
              filled: true,
              fillColor: colors.surfaceContainerLowest,
              contentPadding: EdgeInsets.symmetric(horizontal: Responsive.pad(context, 16), vertical: Responsive.pad(context, 14)),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
                borderSide: const BorderSide(color: Color(0xFFDDDDDD)),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
                borderSide: const BorderSide(color: Color(0xFFDDDDDD)),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
                borderSide: BorderSide(color: sc.primary, width: 1.5),
              ),
              suffixIcon: Icon(LucideIcons.chevronDown, size: Responsive.sp(context, 18), color: sc.onSurfaceVariant),
            ),
            items: _history.map((r) {
              final date = r['date'] ?? '';
              final status = r['status'] ?? '';
              return DropdownMenuItem(
                value: r,
                child: Text('$date  \u2022  ${status.toUpperCase()}', style: TextStyle(fontSize: Responsive.sp(context, 14), color: sc.onSurface)),
              );
            }).toList(),
            onChanged: (v) {
              setState(() {
                _selectedRecord = v;
                if (v != null) {
                  final pi = v['punch_in_time'] as String?;
                  if (pi != null) {
                    final dt = DateTime.parse(pi).toLocal();
                    _correctedTime = TimeOfDay.fromDateTime(dt);
                  }
                  if (v['status'] == 'absent') {
                    _field = 'punch_in';
                  }
                }
              });
            },
          ),
          if (_selectedRecord != null) ...[
            SizedBox(height: Responsive.pad(context, 16)),
            _label('Field to Correct'),
            SizedBox(height: Responsive.pad(context, 8)),
            DropdownButtonFormField<String>(
              value: _field,
              decoration: InputDecoration(
                filled: true,
                fillColor: colors.surfaceContainerLowest,
                contentPadding: EdgeInsets.symmetric(horizontal: Responsive.pad(context, 16), vertical: Responsive.pad(context, 14)),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10),
                  borderSide: const BorderSide(color: Color(0xFFDDDDDD)),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10),
                  borderSide: const BorderSide(color: Color(0xFFDDDDDD)),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10),
                  borderSide: BorderSide(color: sc.primary, width: 1.5),
                ),
                suffixIcon: Icon(LucideIcons.chevronDown, size: Responsive.sp(context, 18), color: sc.onSurfaceVariant),
              ),
              items: _selectedRecord?['status'] == 'absent'
                  ? const [
                      DropdownMenuItem(value: 'punch_in', child: Text('Punch In')),
                    ]
                  : const [
                      DropdownMenuItem(value: 'punch_in', child: Text('Punch In')),
                      DropdownMenuItem(value: 'punch_out', child: Text('Punch Out')),
                    ],
              onChanged: (v) {
                setState(() => _field = v!);
                if (_selectedRecord != null) {
                  final key = v == 'punch_in' ? 'punch_in_time' : 'punch_out_time';
                  final time = _selectedRecord![key] as String?;
                  if (time != null) {
                    final dt = DateTime.parse(time).toLocal();
                    _correctedTime = TimeOfDay.fromDateTime(dt);
                  }
                }
              },
            ),
            SizedBox(height: Responsive.pad(context, 16)),
            _label('Corrected Time'),
            SizedBox(height: Responsive.pad(context, 8)),
            GestureDetector(
              onTap: () async {
                final picked = await showTimePicker(
                  context: context,
                  initialTime: _correctedTime,
                );
                if (picked != null) setState(() => _correctedTime = picked);
              },
              child: Container(
                height: Responsive.pad(context, 48),
                padding: EdgeInsets.symmetric(horizontal: Responsive.pad(context, 16)),
                decoration: BoxDecoration(
                  color: colors.surfaceContainerLowest,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: const Color(0xFFDDDDDD)),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(_correctedTime.format(context), style: TextStyle(fontSize: Responsive.sp(context, 14), color: sc.onSurface)),
                    Icon(LucideIcons.clock, size: Responsive.sp(context, 18), color: sc.onSurfaceVariant),
                  ],
                ),
              ),
            ),
            SizedBox(height: Responsive.pad(context, 16)),
            _label('Reason'),
            SizedBox(height: Responsive.pad(context, 8)),
            TextField(
              controller: _reasonController,
              maxLines: 4,
              decoration: InputDecoration(
                hintText: 'Explain why the time needs correction...',
                hintStyle: TextStyle(fontSize: Responsive.sp(context, 14), color: sc.onSurfaceVariant.withValues(alpha: 0.6)),
                filled: true,
                fillColor: colors.surfaceContainerLowest,
                contentPadding: EdgeInsets.all(Responsive.pad(context, 16)),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10),
                  borderSide: const BorderSide(color: Color(0xFFDDDDDD)),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10),
                  borderSide: const BorderSide(color: Color(0xFFDDDDDD)),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10),
                  borderSide: BorderSide(color: sc.primary, width: 1.5),
                ),
              ),
            ),
            SizedBox(height: Responsive.pad(context, 24)),
            SizedBox(
              width: double.infinity,
              height: Responsive.pad(context, 48),
              child: ElevatedButton(
                onPressed: _submitting ? null : _submit,
                style: ElevatedButton.styleFrom(
                  backgroundColor: sc.primaryContainer,
                  foregroundColor: sc.onPrimary,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  elevation: 1,
                ),
                child: _submitting
                    ? const ButtonSkeleton()
                    : Text('Submit Ticket', style: TextStyle(fontSize: Responsive.sp(context, 14), fontWeight: FontWeight.w600, color: Colors.white)),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
