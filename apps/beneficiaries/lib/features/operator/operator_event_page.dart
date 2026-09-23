import '../../core/lucide_icons.dart';
import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/app_text_styles.dart';
import '../../services/api_service.dart';

/// Event screen for operators: shows the programs attached to an event and
/// the beneficiaries whose kit was marked under that event.
class OperatorEventPage extends StatefulWidget {
  final int eventId;
  final String eventTitle;
  const OperatorEventPage({super.key, required this.eventId, required this.eventTitle});

  @override
  State<OperatorEventPage> createState() => _OperatorEventPageState();
}

class _OperatorEventPageState extends State<OperatorEventPage> {
  List<dynamic> _programs = [];
  List<dynamic> _beneficiaries = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final results = await Future.wait([
        ApiService.getList('/operator/events/${widget.eventId}/programs'),
        ApiService.getList('/operator/events/${widget.eventId}/beneficiaries'),
      ]);
      if (!mounted) return;
      setState(() {
        _programs = results[0];
        _beneficiaries = results[1];
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

  String _fmtDateTime(dynamic v) {
    if (v == null) return '';
    final dt = DateTime.tryParse(v.toString());
    if (dt == null) return v.toString();
    return '${dt.day}/${dt.month}/${dt.year} · ${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.eventTitle, overflow: TextOverflow.ellipsis),
      ),
      body: SafeArea(
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : _error != null
                ? Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 32),
                          child: Text(
                            _error!,
                            textAlign: TextAlign.center,
                            style: const TextStyle(fontSize: 13, color: AppTheme.error),
                          ),
                        ),
                        const SizedBox(height: 12),
                        OutlinedButton.icon(
                          onPressed: _load,
                          icon: const Icon(LucideIcons.refreshCw, size: 18),
                          label: const Text('Retry'),
                        ),
                      ],
                    ),
                  )
                : RefreshIndicator(
                    onRefresh: _load,
                    child: ListView(
                      padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
                      children: [
                        const Text('EVENT', style: AppTextStyles.pageLabel),
                        const SizedBox(height: 6),
                        Text(
                          widget.eventTitle,
                          style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: AppTheme.textPrimary),
                        ),
                        const SizedBox(height: 18),

                        _sectionHeader(
                          icon: LucideIcons.package,
                          title: 'Programs',
                          count: _programs.length,
                        ),
                        const SizedBox(height: 10),
                        if (_programs.isEmpty)
                          _emptyTile('No programs attached to this event yet.')
                        else
                          ..._programs.map((p) => _programTile(p)),

                        const SizedBox(height: 26),
                        _sectionHeader(
                          icon: LucideIcons.userCheck,
                          title: 'Beneficiaries marked here',
                          count: _beneficiaries.length,
                        ),
                        const SizedBox(height: 10),
                        if (_beneficiaries.isEmpty)
                          _emptyTile('No beneficiaries marked (kit given) at this event yet.')
                        else
                          ..._beneficiaries.map((b) => _beneficiaryTile(b)),
                      ],
                    ),
                  ),
      ),
    );
  }

  Widget _sectionHeader({required IconData icon, required String title, required int count}) {
    return Row(
      children: [
        Icon(icon, size: 18, color: AppTheme.primary),
        const SizedBox(width: 8),
        Text(
          title.toUpperCase(),
          style: TextStyle(
            fontSize: 11,
            letterSpacing: 1.5,
            fontWeight: FontWeight.w700,
            color: AppTheme.primary,
          ),
        ),
        const SizedBox(width: 8),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
          decoration: BoxDecoration(
            color: AppTheme.surfaceSoft,
            borderRadius: BorderRadius.circular(10),
          ),
          child: Text(
            '$count',
            style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppTheme.textSecondary),
          ),
        ),
      ],
    );
  }

  Widget _emptyTile(String message) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: AppTheme.radiusCard,
        border: Border.all(color: AppTheme.outline),
      ),
      child: Text(
        message,
        style: const TextStyle(fontSize: 13, color: AppTheme.textSecondary),
      ),
    );
  }

  Widget _programTile(dynamic p) {
    final map = Map<String, dynamic>.from(p as Map);
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: AppTheme.radiusCard,
        boxShadow: AppTheme.cardShadow,
      ),
      child: Row(
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: AppTheme.greenSoft,
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Icon(LucideIcons.box, color: AppTheme.success, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  map['title']?.toString() ?? 'Program',
                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppTheme.textPrimary),
                ),
                const SizedBox(height: 2),
                Text(
                  [
                    map['program_date']?.toString(),
                    map['location_name']?.toString(),
                  ].where((s) => s != null && s.isNotEmpty).join(' · '),
                  style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _beneficiaryTile(dynamic b) {
    final map = Map<String, dynamic>.from(b as Map);
    final name = map['full_name']?.toString() ?? 'Beneficiary';
    final code = map['beneficiary_code']?.toString() ?? '';
    final when = _fmtDateTime(map['performed_at']);
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: AppTheme.radiusCard,
        boxShadow: AppTheme.cardShadow,
      ),
      child: Row(
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: AppTheme.blueSoft,
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Icon(LucideIcons.userCheck, color: AppTheme.primary, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppTheme.textPrimary),
                ),
                const SizedBox(height: 2),
                Text(
                  [code, when].where((s) => s.isNotEmpty).join(' · '),
                  style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary),
                ),
              ],
            ),
          ),
          const Icon(LucideIcons.checkCircle, color: AppTheme.success, size: 20),
        ],
      ),
    );
  }
}