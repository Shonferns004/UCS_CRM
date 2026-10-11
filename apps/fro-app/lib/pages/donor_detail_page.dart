import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../data/dispositions.dart';
import '../models/models.dart';
import '../services/call_service.dart';
import '../services/fro_api.dart';
import '../theme.dart';
import '../widgets/donor_card.dart';
import '../widgets/skeleton.dart';
import 'disposition_sheet.dart';

const Map<String, String> _donorTypeOptions = {
  'monthly': 'Monthly',
  'quarterly': 'Quarterly',
  'half_yearly': 'Half-Yearly',
  'yearly': 'Yearly',
  'one_time': 'One Time',
};

const List<String> _monthNames = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

class DonorDetailPage extends StatefulWidget {
  final dynamic donorId;
  final String? ngoId;
  final Donor? donor;

  const DonorDetailPage({
    super.key,
    required this.donorId,
    this.ngoId,
    this.donor,
  });

  @override
  State<DonorDetailPage> createState() => _DonorDetailPageState();
}

class _DonorDetailPageState extends State<DonorDetailPage> {
  int _tab = 0;
  Map<String, dynamic> _detail = {};
  List<DonorLog> _logs = [];
  List<dynamic> _donations = [];
  List<dynamic> _receipts = [];
  bool _loading = true;
  bool _receiptsLoaded = false;
  String? _error;
  String? _donorType;
  bool _typeSaving = false;

  @override
  void initState() {
    super.initState();
    _donorType = widget.donor?.donorType;
    _load();
    _loadDonations();
    final donor = widget.donor;
    if (donor != null && donor.raw['is_new'] == true) {
      FroApi.markDonorSeen(donor.id, ngoId: donor.ngoId).catchError((_) {});
    }
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final map = await FroApi.donorDetail(widget.donorId, ngoId: widget.ngoId);
      if (!mounted) return;
      final rawLogs = map['logs'];
      setState(() {
        _detail = map;
        _logs = rawLogs is List
            ? rawLogs
                .whereType<Map>()
                .map((e) => DonorLog.fromJson(e.cast<String, dynamic>()))
                .toList()
            : <DonorLog>[];
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _loadDonations() async {
    try {
      final d = await FroApi.donorDonations(widget.donorId, ngoId: widget.ngoId);
      if (mounted) setState(() => _donations = d);
    } catch (_) {}
  }

  Future<void> _loadReceipts() async {
    try {
      final r = await FroApi.donorReceipts(widget.donorId, ngoId: widget.ngoId);
      if (mounted) {
        setState(() {
          _receipts = r;
          _receiptsLoaded = true;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _receiptsLoaded = true);
    }
  }

  Future<void> _changeDonorType(String value) async {
    setState(() => _typeSaving = true);
    try {
      await FroApi.updateDonorType(widget.donorId, value);
      if (!mounted) return;
      setState(() => _donorType = value.isEmpty ? null : value);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Could not update donor type'),
          backgroundColor: AppColors.danger,
        ));
      }
    } finally {
      if (mounted) setState(() => _typeSaving = false);
    }
  }

  void _startCall(Donor donor) {
    context.read<CallService>().startCall(donor);
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text('Calling ${donor.donorMobile ?? donor.donorName ?? ''}'),
      backgroundColor: AppColors.success,
    ));
  }

  Future<void> _openDisposition(Donor donor) async {
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (_) => DispositionSheet(
        donorId: widget.donorId,
        ngoId: widget.ngoId,
        donorName: donor.donorName,
        donorMobile: donor.donorMobile,
      ),
    );
    _load();
  }

  Future<void> _endCall(Donor donor) async {
    final call = context.read<CallService>();
    if (call.isOnCall) call.endCall();
    await _openDisposition(donor);
  }

  @override
  Widget build(BuildContext context) {
    final donor = widget.donor;
    final call = context.watch<CallService>();

    return Scaffold(
      appBar: AppBar(title: Text(donor?.donorName ?? 'Donor Detail')),
      body: Column(
        children: [
          Expanded(
            child: _loading
                ? ListView(
                    padding: const EdgeInsets.all(16),
                    children: const [
                      SkeletonBlock(height: 140),
                      SizedBox(height: 10),
                      SkeletonBlock(height: 60),
                      SizedBox(height: 10),
                      SkeletonBlock(height: 200),
                    ],
                  )
                : _error != null
                    ? Center(
                        child: Padding(
                          padding: const EdgeInsets.all(24),
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Text(_error!, textAlign: TextAlign.center, style: const TextStyle(fontSize: 13, color: AppColors.inkSoft)),
                              const SizedBox(height: 12),
                              ElevatedButton(onPressed: _load, child: const Text('Retry')),
                            ],
                          ),
                        ),
                      )
                    : RefreshIndicator(
                        onRefresh: _load,
                        child: ListView(
                          padding: const EdgeInsets.all(16),
                          children: [
                            if (donor != null) ...[
                              _profileCard(donor, call),
                              const SizedBox(height: 10),
                              _actionBar(donor, call),
                              const SizedBox(height: 10),
                              ..._scheduleBanner(),
                              _detailsCard(),
                              const SizedBox(height: 10),
                              _collectionCard(),
                              const SizedBox(height: 10),
                              _donationsPreview(),
                              const SizedBox(height: 12),
                            ],
                            _tabBar(),
                            const SizedBox(height: 8),
                            _tabContent(),
                            const SizedBox(height: 8),
                          ],
                        ),
                      ),
          ),
          _dispositionBar(donor),
        ],
      ),
    );
  }

  Widget _dispositionBar(Donor? donor) {
    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(top: BorderSide(color: AppColors.line)),
      ),
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
      child: SafeArea(
        top: false,
        child: SizedBox(
          width: double.infinity,
          child: ElevatedButton.icon(
            icon: const Icon(Icons.assignment, size: 18),
            label: const Text('Record Disposition'),
            onPressed: donor == null ? null : () => _openDisposition(donor),
          ),
        ),
      ),
    );
  }

  Widget _card(Widget child, {EdgeInsetsGeometry padding = const EdgeInsets.all(16)}) {
    return Container(
      width: double.infinity,
      padding: padding,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.line),
        boxShadow: const [BoxShadow(color: Color(0x0F0F172A), blurRadius: 12, offset: Offset(0, 4))],
      ),
      child: child,
    );
  }

  Widget _chip(String label, Color bg, Color fg) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
      child: Text(label, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: fg)),
    );
  }

  Widget _profileCard(Donor donor, CallService call) {
    final name = donor.donorName ?? 'Unknown donor';
    final words = name.trim().split(RegExp(r'\s+'));
    final initials = words.isEmpty
        ? '?'
        : words.take(2).map((w) => w.isEmpty ? '' : w[0]).join().toUpperCase();
    final raw = donor.raw;
    final ngoName = raw['ngo_name']?.toString().isNotEmpty == true
        ? raw['ngo_name'].toString()
        : (raw['ngo_names'] is List && (raw['ngo_names'] as List).isNotEmpty
            ? (raw['ngo_names'] as List).join(', ')
            : null);
    final rollover = raw['rollover_from_status']?.toString();
    final onThisCall = call.isOnCall && call.activeCall?.donorId == donor.id;

    return _card(
      Column(
        children: [
          CircleAvatar(
            radius: 28,
            backgroundColor: AppColors.activeBg,
            child: Text(
              initials,
              style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: AppColors.sage),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            name,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 4),
          Text(
            donor.donorMobile ?? 'No number',
            style: const TextStyle(fontSize: 13, color: AppColors.inkSoft, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 6,
            runSpacing: 5,
            alignment: WrapAlignment.center,
            children: [
              StatusPillLabel(status: donor.status ?? 'pending'),
              if (raw['is_new'] == true)
                _chip('NEW', AppColors.pillGreenBg, AppColors.pillGreenText),
              if (onThisCall)
                _chip('ON CALL', AppColors.pillRedBg, AppColors.pillRedText),
              if (rollover != null && rollover.isNotEmpty)
                _chip('↺ was ${rollover.replaceAll('_', ' ')}', const Color(0xFFEDE9FE), const Color(0xFF4338CA)),
              if (ngoName != null) _chip(ngoName, const Color(0xFFE0E7FF), const Color(0xFF4338CA)),
              if (donor.station != null)
                _chip(donor.station!, AppColors.pillBlueBg, AppColors.pillBlueText),
              if (_donorType != null && _donorType!.isNotEmpty)
                _chip(_donorTypeOptions[_donorType] ?? _donorType!, AppColors.pillGrayBg, AppColors.pillGrayText),
            ],
          ),
        ],
      ),
    );
  }

  Widget _actionBar(Donor donor, CallService call) {
    final onThisCall = call.isOnCall && call.activeCall?.donorId == donor.id;

    if (onThisCall) {
      return _card(
        Row(
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              decoration: BoxDecoration(
                color: AppColors.pillRedBg,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text(
                    'ON CALL',
                    style: TextStyle(fontSize: 9.5, fontWeight: FontWeight.w800, color: AppColors.danger, letterSpacing: .8),
                  ),
                  Text(
                    formatDuration(call.elapsed),
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                      color: AppColors.danger,
                      fontFeatures: [FontFeature.tabularFigures()],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: ElevatedButton.icon(
                style: ElevatedButton.styleFrom(backgroundColor: AppColors.danger),
                icon: const Icon(Icons.phone_disabled, size: 17),
                label: const Text('End & Dispose'),
                onPressed: () => _endCall(donor),
              ),
            ),
          ],
        ),
      );
    }

    return _card(
      Row(
        children: [
          Expanded(
            child: ElevatedButton.icon(
              icon: const Icon(Icons.phone, size: 17),
              label: Text(
                donor.donorMobile ?? 'Call',
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 13.5),
              ),
              onPressed: () => _startCall(donor),
            ),
          ),
          const SizedBox(width: 8),
          InkWell(
            onTap: () => ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('WhatsApp coming soon'), backgroundColor: AppColors.sage),
            ),
            borderRadius: BorderRadius.circular(10),
            child: Container(
              width: 52,
              height: 46,
              decoration: BoxDecoration(
                color: const Color(0xFF25D366),
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Icon(Icons.chat, size: 20, color: Colors.white),
            ),
          ),
        ],
      ),
    );
  }

  List<Widget> _scheduleBanner() {
    final s = _detail['next_schedule'];
    if (s is! Map || s['is_completed'] == true) return const [];
    final at = DateTime.tryParse(s['scheduled_at']?.toString() ?? '');
    if (at == null) return const [];
    final overdue = at.isBefore(DateTime.now());
    return [
      Container(
        width: double.infinity,
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
        decoration: BoxDecoration(
          color: overdue ? const Color(0xFFFFF1F2) : const Color(0xFFE0F2FE),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Row(
          children: [
            Icon(overdue ? Icons.warning : Icons.access_time,
                size: 15, color: overdue ? AppColors.danger : const Color(0xFF0369A1)),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                overdue
                    ? 'Overdue schedule — ${_fmtDate(at.toIso8601String())}'
                    : 'Next: ${_fmtDate(at.toIso8601String())}',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: overdue ? AppColors.danger : const Color(0xFF0369A1),
                ),
              ),
            ),
          ],
        ),
      ),
    ];
  }

  Widget _field(String label, String? value, {String empty = 'NA'}) {
    final has = value != null && value.isNotEmpty;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: AppColors.inkSoft, letterSpacing: .4),
          ),
          const SizedBox(height: 2),
          Text(
            has ? value : empty,
            style: TextStyle(
              fontSize: 13.5,
              fontWeight: FontWeight.w600,
              color: has ? AppColors.ink : AppColors.inkSoft,
              fontStyle: has ? FontStyle.normal : FontStyle.italic,
            ),
          ),
        ],
      ),
    );
  }

  Widget _detailsCard() {
    final donor = widget.donor;
    final lastDisp = donor?.lastDisposition?.replaceAll('_', ' ');
    return _card(
      Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Donor Details',
            style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 10),
          _field('City', donor?.donorCity),
          _field('Email', donor?.donorEmail, empty: 'No email'),
          _field('Address', donor?.donorAddress, empty: 'No address'),
          _field('PAN', donor?.donorPan),
          _field('DOB', donor?.donorDob),
          _field('Alternate Mobile', donor?.donorMobileAlt),
          if (lastDisp != null && lastDisp.isNotEmpty)
            _field('Last Disposition',
                '$lastDisp${donor?.lastDispositionAt != null ? ' · ${_fmtDate(donor!.lastDispositionAt!)}' : ''}'),
          const Text(
            'Donor Type',
            style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: AppColors.inkSoft, letterSpacing: .4),
          ),
          const SizedBox(height: 4),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: AppColors.line),
            ),
            child: DropdownButtonHideUnderline(
              child: DropdownButton<String>(
                value: _donorTypeOptions.containsKey(_donorType ?? '') ? _donorType : '',
                isExpanded: true,
                style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: AppColors.ink),
                items: [
                  const DropdownMenuItem(value: '', child: Text('— Select —')),
                  ..._donorTypeOptions.entries.map(
                    (e) => DropdownMenuItem(value: e.key, child: Text(e.value)),
                  ),
                ],
                onChanged: _typeSaving ? null : (v) => _changeDonorType(v ?? ''),
              ),
            ),
          ),
          if (_typeSaving)
            const Padding(
              padding: EdgeInsets.only(top: 6),
              child: Text('Saving…', style: TextStyle(fontSize: 11, color: AppColors.inkSoft)),
            ),
        ],
      ),
    );
  }

  Widget _collectionCard() {
    final total = _detail['total_collected'] is num
        ? _detail['total_collected'] as num
        : widget.donor?.amountCollected;
    return _card(
      Row(
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: AppColors.pillGreenBg,
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Icon(Icons.currency_rupee, size: 18, color: AppColors.success),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Total Collected',
                  style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: AppColors.inkSoft, letterSpacing: .4),
                ),
                Text(
                  formatCurrency(total),
                  style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: AppColors.success),
                ),
              ],
            ),
          ),
          if (_donations.isNotEmpty)
            Text(
              '${_donations.length} donation${_donations.length == 1 ? '' : 's'}',
              style: const TextStyle(fontSize: 11.5, color: AppColors.inkSoft, fontWeight: FontWeight.w600),
            ),
        ],
      ),
    );
  }

  Map<String, dynamic> _mapOf(dynamic d) => d is Map ? d.cast<String, dynamic>() : <String, dynamic>{};

  Widget _donationRow(dynamic d) {
    final map = _mapOf(d);
    final amt = map['amount'] ?? map['amount_collected'];
    final date = (map['date'] ?? map['created_at'] ?? map['receipt_date'] ?? '').toString();
    final status = map['status']?.toString();
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        children: [
          const Icon(Icons.currency_rupee, size: 15, color: AppColors.success),
          const SizedBox(width: 8),
          Text(_fmtDateShort(date), style: const TextStyle(fontSize: 11.5, color: AppColors.inkSoft)),
          const Spacer(),
          Text(
            formatCurrency(amt is num ? amt : num.tryParse('${amt ?? ''}')),
            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800),
          ),
          if (status != null && status.isNotEmpty) ...[
            const SizedBox(width: 8),
            _statusPill(status),
          ],
        ],
      ),
    );
  }

  Widget _statusPill(String status) {
    final name = pillColorName(status) ?? 'gray';
    final (bg, fg) = switch (name) {
      'green' => (AppColors.pillGreenBg, AppColors.pillGreenText),
      'red' => (AppColors.pillRedBg, AppColors.pillRedText),
      'yellow' => (AppColors.pillYellowBg, AppColors.pillYellowText),
      _ => (AppColors.pillGrayBg, AppColors.pillGrayText),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(5)),
      child: Text(status, style: TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: fg)),
    );
  }

  Widget _donationsPreview() {
    return _card(
      Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Text('Donations', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800)),
              const Spacer(),
              if (_donations.isNotEmpty)
                TextButton(
                  onPressed: () => setState(() => _tab = 1),
                  style: TextButton.styleFrom(
                    padding: const EdgeInsets.symmetric(horizontal: 10),
                    minimumSize: Size.zero,
                    foregroundColor: AppColors.sage,
                  ),
                  child: Text(
                    'View All (${_donations.length})',
                    style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700),
                  ),
                ),
            ],
          ),
          if (_donations.isEmpty)
            const Text(
              'No donations yet',
              style: TextStyle(fontSize: 12, color: AppColors.inkSoft, fontStyle: FontStyle.italic),
            )
          else
            ..._donations.take(6).map(_donationRow),
        ],
      ),
    );
  }

  Widget _tabBar() {
    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.only(topLeft: Radius.circular(14), topRight: Radius.circular(14)),
        border: Border(bottom: BorderSide(color: AppColors.line)),
      ),
      child: Row(
        children: [
          _tabBtn('History', 0),
          _tabBtn('Donations', 1),
          _tabBtn('Receipts', 2),
        ],
      ),
    );
  }

  Widget _tabBtn(String label, int idx) {
    final selected = _tab == idx;
    return Expanded(
      child: InkWell(
        onTap: () {
          setState(() => _tab = idx);
          if (idx == 1 && _donations.isEmpty) _loadDonations();
          if (idx == 2 && !_receiptsLoaded) _loadReceipts();
        },
        child: Container(
          height: 40,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            border: Border(
              bottom: BorderSide(color: selected ? AppColors.sage : Colors.transparent, width: 2),
            ),
          ),
          child: Text(
            label,
            style: TextStyle(
              fontSize: 12.5,
              fontWeight: selected ? FontWeight.w700 : FontWeight.w600,
              color: selected ? AppColors.ink : AppColors.inkSoft,
            ),
          ),
        ),
      ),
    );
  }

  Widget _tabContent() {
    if (_tab == 0) return _historyCard();
    if (_tab == 1) return _donationsCard();
    return _receiptsCard();
  }

  Widget _historyCard() {
    if (_logs.isEmpty) {
      return _card(const Padding(
        padding: EdgeInsets.symmetric(vertical: 18),
        child: Center(child: Text('No history yet', style: TextStyle(color: AppColors.inkSoft))),
      ));
    }
    return _card(
      Column(
        children: [
          for (var i = 0; i < _logs.length; i++) ...[
            if (i > 0) const Divider(height: 14),
            _logTile(_logs[i]),
          ],
        ],
      ),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
    );
  }

  Widget _logTile(DonorLog log) {
    final isDisp = log.action == 'disposition';
    final cat = log.dispositionCategory;
    final icon = isDisp
        ? (cat == 'connected' ? Icons.check_circle : Icons.cancel)
        : log.action == 'donation'
            ? Icons.currency_rupee
            : Icons.circle;
    final color = isDisp
        ? (cat == 'connected' ? AppColors.success : AppColors.danger)
        : log.action == 'donation'
            ? AppColors.sage
            : AppColors.inkSoft;
    final lbl = isDisp
        ? (log.dispositionDetail?.replaceAll('_', ' ') ?? '')
        : (log.action?.replaceAll('_', ' ') ?? '');
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 17, color: color),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(lbl, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
                if (log.notes != null && log.notes!.isNotEmpty)
                  Text(log.notes!, style: const TextStyle(fontSize: 12, color: AppColors.inkSoft)),
                if (log.amountCollected != null)
                  Text(
                    formatCurrency(log.amountCollected),
                    style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: AppColors.success),
                  ),
                Row(
                  children: [
                    if (log.createdAt != null)
                      Text(_fmtDate(log.createdAt!), style: const TextStyle(fontSize: 11, color: AppColors.inkSoft)),
                    if (log.scheduledAt != null) ...[
                      const SizedBox(width: 8),
                      Text('Follow-up: ${_fmtDate(log.scheduledAt!)}',
                          style: const TextStyle(fontSize: 11, color: AppColors.pillBlueText)),
                    ],
                    if (log.accountsStatus != null) ...[
                      const SizedBox(width: 8),
                      _statusPill(log.accountsStatus!),
                    ],
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _donationsCard() {
    if (_donations.isEmpty) {
      return _card(const Padding(
        padding: EdgeInsets.symmetric(vertical: 18),
        child: Center(child: Text('No donations', style: TextStyle(color: AppColors.inkSoft))),
      ));
    }
    return _card(
      Column(children: _donations.map(_donationRow).toList()),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
    );
  }

  Widget _receiptsCard() {
    if (!_receiptsLoaded) {
      return const _InlineSpinner();
    }
    if (_receipts.isEmpty) {
      return _card(const Padding(
        padding: EdgeInsets.symmetric(vertical: 18),
        child: Center(child: Text('No receipts', style: TextStyle(color: AppColors.inkSoft))),
      ));
    }
    return _card(
      Column(
        children: [
          for (var i = 0; i < _receipts.length; i++) ...[
            if (i > 0) const Divider(height: 14),
            _receiptRow(_receipts[i]),
          ],
        ],
      ),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
    );
  }

  Widget _receiptRow(dynamic r) {
    final map = _mapOf(r);
    final amt = map['amount'];
    final numAmt = amt is num ? amt : num.tryParse('${amt ?? ''}');
    final receiptNum = map['receipt_number'] ?? map['receipt_no'] ?? map['number'];
    final date = (map['receipt_date'] ?? map['created_at'] ?? map['date'] ?? '').toString();
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          const Icon(Icons.receipt, size: 17, color: AppColors.sage),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  receiptNum?.toString() ?? 'Receipt',
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700),
                ),
                if (date.isNotEmpty)
                  Text(_fmtDateShort(date), style: const TextStyle(fontSize: 11, color: AppColors.inkSoft)),
              ],
            ),
          ),
          Text(formatCurrency(numAmt), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800)),
        ],
      ),
    );
  }

  String _pad2(int v) => v.toString().padLeft(2, '0');

  String _fmtDate(String iso) {
    final d = DateTime.tryParse(iso);
    if (d == null) return iso;
    return '${_pad2(d.day)}/${_pad2(d.month)}/${d.year} ${_pad2(d.hour)}:${_pad2(d.minute)}';
  }

  String _fmtDateShort(String iso) {
    if (iso.isEmpty) return '—';
    final d = DateTime.tryParse(iso);
    if (d == null) return iso;
    return '${d.day} ${_monthNames[d.month - 1]} ${d.year}';
  }
}

class _InlineSpinner extends StatelessWidget {
  const _InlineSpinner();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 26),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.line),
      ),
      child: const Center(
        child: SizedBox(
          width: 22,
          height: 22,
          child: CircularProgressIndicator(strokeWidth: 2.4),
        ),
      ),
    );
  }
}
