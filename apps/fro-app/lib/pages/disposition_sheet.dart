import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../data/dispositions.dart';
import '../services/call_service.dart';
import '../services/fro_api.dart';
import '../theme.dart';

class DispositionSheet extends StatefulWidget {
  final dynamic donorId;
  final String? ngoId;
  final String? donorName;
  final String? donorMobile;

  const DispositionSheet({
    super.key,
    required this.donorId,
    this.ngoId,
    this.donorName,
    this.donorMobile,
  });

  @override
  State<DispositionSheet> createState() => _DispositionSheetState();
}

class _DispositionSheetState extends State<DispositionSheet> {
  String? _selected;
  bool _saving = false;
  String? _message;
  bool _msgIsError = false;

  final _notesCtrl = TextEditingController();
  final _amountCtrl = TextEditingController();

  DateTime? _scheduleDate;
  TimeOfDay? _scheduleTime;

  @override
  void dispose() {
    _notesCtrl.dispose();
    _amountCtrl.dispose();
    super.dispose();
  }

  bool get _needsScheduleDate =>
      _selected != null && scheduleDateTypes.contains(_selected);
  bool get _needsScheduleTime =>
      _selected != null && scheduleTimeTypes.contains(_selected);
  bool get _needsAmount =>
      _selected == 'lead_done' || _selected == 'done';
  bool get _isLeadDone => _selected == 'lead_done';

  String? _validate() {
    if (_selected == null) return 'Select a disposition';
    if (_needsScheduleDate && (_scheduleDate == null || _scheduleTime == null)) {
      return 'Select date & time';
    }
    if (_needsScheduleTime && _scheduleTime == null) {
      return 'Select time for callback';
    }
    if (_needsAmount) {
      final amt = double.tryParse(_amountCtrl.text.trim());
      if (amt == null || amt <= 0) return 'Enter a valid payment amount';
    }
    return null;
  }

  Future<void> _save() async {
    final err = _validate();
    if (err != null) {
      setState(() {
        _message = err;
        _msgIsError = true;
      });
      return;
    }
    if (_saving) return;
    setState(() {
      _saving = true;
      _message = null;
    });

    final call = context.read<CallService>();
    call.adoptOptimisticDisposition();

    try {
      final selected = _selected!;
      final payload = <String, dynamic>{
        'action': 'disposition',
        'disposition_category': isConnected(selected) ? 'connected' : 'not_connected',
        'disposition_detail': selected,
        'notes': _notesCtrl.text.trim().isEmpty ? null : _notesCtrl.text.trim(),
        'ngo_id': widget.ngoId,
      };
      if (_needsScheduleDate && _scheduleDate != null && _scheduleTime != null) {
        payload['scheduled_at'] = _toIso(_scheduleDate!, _scheduleTime!);
      }
      if (_needsScheduleTime && _scheduleTime != null) {
        final now = DateTime.now();
        payload['scheduled_at'] = _toIso(now, _scheduleTime!);
      }
      if (selected == 'lead_done') {
        payload['amount_collected'] = double.tryParse(_amountCtrl.text.trim());
      }
      if (selected == 'done') {
        payload['amount_collected'] = double.tryParse(_amountCtrl.text.trim());
      }
      await FroApi.addDonorLog(widget.donorId, payload);
      call.endCall();
      if (!mounted) return;
      final disp = findDisp(selected);
      final msg = selected == 'lead_done'
          ? 'Lead sent to Accounts for verification'
          : selected == 'done'
              ? 'Collection recorded'
              : (scheduleTypes.contains(selected)
                  ? 'Follow-up scheduled'
                  : 'Disposition: ${disp?.label ?? selected}');
      Navigator.pop(context);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(msg), backgroundColor: AppColors.success),
      );
    } catch (e) {
      final m = e.toString().toLowerCase();
      final offline = m.contains('timeout') ||
          m.contains('network') ||
          m.contains('failed') ||
          m.contains('socket');
      setState(() {
        _message = offline
            ? 'Could not reach the server — this disposition was NOT saved. Check your connection and try again.'
            : e.toString();
        _msgIsError = true;
      });
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  String _toIso(DateTime d, TimeOfDay t) {
    final ist = DateTime(d.year, d.month, d.day, t.hour, t.minute);
    return ist.toUtc().add(const Duration(hours: 5, minutes: 30)).toIso8601String();
  }

  @override
  Widget build(BuildContext context) {
    final selected = _selected;
    final connectedDisp = selected != null && isConnected(selected);

    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      child: DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.75,
        minChildSize: 0.4,
        maxChildSize: 0.95,
        builder: (context, scrollCtrl) => Column(
          children: [
            Container(
              margin: const EdgeInsets.only(top: 10),
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: AppColors.line,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 8, 0),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Record Disposition',
                          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
                        ),
                        Text(
                          [widget.donorName, widget.donorMobile].where((e) => e != null && e.isNotEmpty).join(' · '),
                          style: const TextStyle(fontSize: 12, color: AppColors.inkSoft),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close),
                    onPressed: () => Navigator.pop(context),
                  ),
                ],
              ),
            ),
            const Divider(height: 20),
            Expanded(
              child: ListView(
                controller: scrollCtrl,
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                children: [
                  const _SectionLabel('Connected'),
                  _groupWrap(connectedGroups, connected: true),
                  const SizedBox(height: 16),
                  const _SectionLabel('Not Connected'),
                  _groupWrap(notConnectedGroups, connected: false),
                  const SizedBox(height: 16),
                  if (_needsScheduleDate) ...[
                    const _SectionLabel('Scheduled Date & Time'),
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton.icon(
                            icon: const Icon(Icons.calendar_today, size: 16),
                            label: Text(
                              _scheduleDate == null
                                  ? 'Pick date'
                                  : '${_scheduleDate!.day.toString().padLeft(2, '0')}/${_scheduleDate!.month.toString().padLeft(2, '0')}/${_scheduleDate!.year}',
                            ),
                            onPressed: () async {
                              final d = await showDatePicker(
                                context: context,
                                initialDate: _scheduleDate ?? DateTime.now().add(const Duration(days: 1)),
                                firstDate: DateTime.now(),
                                lastDate: DateTime.now().add(const Duration(days: 365)),
                              );
                              if (d != null) setState(() => _scheduleDate = d);
                            },
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: OutlinedButton.icon(
                            icon: const Icon(Icons.access_time, size: 16),
                            label: Text(_scheduleTime?.format(context) ?? 'Pick time'),
                            onPressed: () async {
                              final t = await showTimePicker(
                                context: context,
                                initialTime: _scheduleTime ?? TimeOfDay.now(),
                              );
                              if (t != null) setState(() => _scheduleTime = t);
                            },
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                  ],
                  if (_needsScheduleTime) ...[
                    const _SectionLabel('Callback Time (today)'),
                    OutlinedButton.icon(
                      icon: const Icon(Icons.access_time, size: 16),
                      label: Text(_scheduleTime?.format(context) ?? 'Pick time'),
                      onPressed: () async {
                        final t = await showTimePicker(
                          context: context,
                          initialTime: _scheduleTime ?? TimeOfDay.now(),
                        );
                        if (t != null) setState(() => _scheduleTime = t);
                      },
                    ),
                    const SizedBox(height: 16),
                  ],
                  if (_needsAmount) ...[
                    const _SectionLabel('Amount Collected (₹)'),
                    TextField(
                      controller: _amountCtrl,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      decoration: const InputDecoration(hintText: 'Enter amount'),
                    ),
                    const SizedBox(height: 16),
                  ],
                  if (_isLeadDone) ...[
                    const _SectionLabel('Project (optional)'),
                    const TextField(
                      decoration: InputDecoration(hintText: 'Project name'),
                    ),
                    const SizedBox(height: 16),
                  ],
                  const _SectionLabel('Notes'),
                  TextField(
                    controller: _notesCtrl,
                    maxLines: 3,
                    decoration: const InputDecoration(hintText: 'Optional notes'),
                  ),
                  if (selected == othersId) ...[
                    const SizedBox(height: 8),
                    const Text(
                      'A note is required for Others.',
                      style: TextStyle(fontSize: 11.5, color: AppColors.warning, fontWeight: FontWeight.w600),
                    ),
                  ],
                  if (_message != null) ...[
                    const SizedBox(height: 12),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: _msgIsError ? AppColors.pillRedBg : AppColors.pillGreenBg,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Text(
                        _message!,
                        style: TextStyle(
                          fontSize: 12.5,
                          fontWeight: FontWeight.w600,
                          color: _msgIsError ? AppColors.pillRedText : AppColors.pillGreenText,
                        ),
                      ),
                    ),
                  ],
                  const SizedBox(height: 16),
                  ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: connectedDisp ? AppColors.sage : AppColors.danger,
                    ),
                    onPressed: _saving ? null : _save,
                    child: _saving
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                          )
                        : Text(_saving ? 'Saving…' : 'Save Disposition'),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _groupWrap(List<DispositionGroup> groups, {required bool connected}) {
    return Container(
      decoration: BoxDecoration(
        border: Border.all(color: AppColors.line),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        children: [
          for (var i = 0; i < groups.length; i++) ...[
            if (i > 0) const Divider(height: 1),
            _GroupTile(
              group: groups[i],
              selected: _selected,
              onSelect: (id) {
                setState(() {
                  _selected = id;
                  _message = null;
                });
                if (scheduleDateTypes.contains(id)) {
                  _scheduleDate ??= DateTime.now().add(const Duration(days: 1));
                }
                if (scheduleTimeTypes.contains(id)) {
                  final now = TimeOfDay.now();
                  _scheduleTime ??= now;
                }
              },
            ),
          ],
        ],
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  final String text;
  const _SectionLabel(this.text);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(
        text.toUpperCase(),
        style: const TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.w800,
          color: AppColors.inkSoft,
          letterSpacing: 0.6,
        ),
      ),
    );
  }
}

class _GroupTile extends StatelessWidget {
  final DispositionGroup group;
  final String? selected;
  final ValueChanged<String> onSelect;

  const _GroupTile({
    required this.group,
    required this.selected,
    required this.onSelect,
  });

  @override
  Widget build(BuildContext context) {
    if (group.items.length == 1) {
      final item = group.items.first;
      final isSelected = selected == item.id;
      return InkWell(
        onTap: () => onSelect(item.id),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          color: isSelected ? AppColors.activeBg : null,
          child: Row(
            children: [
              Icon(
                isSelected ? Icons.radio_button_checked : Icons.circle,
                size: 18,
                color: isSelected ? AppColors.sage : AppColors.inkSoft,
              ),
              const SizedBox(width: 10),
              Text(
                item.label,
                style: TextStyle(
                  fontSize: 13.5,
                  fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                ),
              ),
            ],
          ),
        ),
      );
    }
    final anySelected = group.items.any((i) => i.id == selected);
    return ExpansionTile(
      tilePadding: const EdgeInsets.symmetric(horizontal: 14),
      childrenPadding: const EdgeInsets.only(left: 42, right: 14, bottom: 8),
      initiallyExpanded: anySelected,
      leading: Icon(
        anySelected ? Icons.radio_button_checked : Icons.circle,
        size: 18,
        color: anySelected ? AppColors.sage : AppColors.inkSoft,
      ),
      title: Text(
        group.label,
        style: TextStyle(
          fontSize: 13.5,
          fontWeight: anySelected ? FontWeight.w700 : FontWeight.w500,
        ),
      ),
      children: [
        for (final item in group.items)
          InkWell(
            onTap: () => onSelect(item.id),
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(vertical: 10),
              color: selected == item.id ? AppColors.activeBg : null,
              child: Row(
                children: [
                  Icon(
                    selected == item.id ? Icons.check_circle : Icons.circle,
                    size: 16,
                    color: selected == item.id ? AppColors.sage : AppColors.inkSoft,
                  ),
                  const SizedBox(width: 8),
                  Text(item.label, style: const TextStyle(fontSize: 13)),
                ],
              ),
            ),
          ),
      ],
    );
  }
}
