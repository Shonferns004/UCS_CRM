import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../models/models.dart';
import '../services/fro_api.dart';
import '../theme.dart';
import '../widgets/skeleton.dart';

class TicketsPage extends StatefulWidget {
  const TicketsPage({super.key});

  @override
  State<TicketsPage> createState() => _TicketsPageState();
}

class _TicketsPageState extends State<TicketsPage> {
  List<Ticket> _tickets = [];
  bool _loading = true;
  String? _error;
  Ticket? _detail;
  bool _detailLoading = false;
  final _replyCtrl = TextEditingController();
  final _subjectCtrl = TextEditingController();
  final _descCtrl = TextEditingController();
  String? _category;

  static const _categories = [
    'hardware',
    'software',
    'network',
    'internet',
    'phone',
    'other',
  ];

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _replyCtrl.dispose();
    _subjectCtrl.dispose();
    _descCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final results = await Future.wait([
        FroApi.myTickets(),
        FroApi.myDeveloperTickets(),
      ]);
      final all = [...results[0], ...results[1]];
      all.sort((a, b) => (b.createdAt ?? '').compareTo(a.createdAt ?? ''));
      if (!mounted) return;
      setState(() {
        _tickets = all;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _openDetail(Ticket t) async {
    setState(() => _detailLoading = true);
    try {
      final d = await FroApi.ticketDetail(t.endpoint ?? '/tickets', t.id);
      if (mounted) setState(() => _detail = d);
    } catch (_) {
      if (mounted) setState(() => _detail = t);
    } finally {
      if (mounted) setState(() => _detailLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_detail != null) {
      return _buildDetail();
    }
    return Scaffold(
      appBar: AppBar(
        title: const Text('Raise Ticket'),
        actions: [
          IconButton(icon: const Icon(Icons.add), onPressed: _openRaise),
        ],
      ),
      body: _loading
          ? ListView(
              padding: const EdgeInsets.all(16),
              children: const [
                SkeletonBlock(height: 70),
                SizedBox(height: 8),
                SkeletonBlock(height: 70),
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
                  child: _tickets.isEmpty
                      ? const Center(child: Text('No tickets', style: TextStyle(color: AppColors.inkSoft)))
                      : ListView.separated(
                          padding: const EdgeInsets.all(16),
                          itemCount: _tickets.length,
                          separatorBuilder: (_, __) => const SizedBox(height: 8),
                          itemBuilder: (context, i) {
                            final t = _tickets[i];
                            return _ticketTile(t);
                          },
                        ),
                ),
    );
  }

  Widget _ticketTile(Ticket t) {
    final statusColor = switch (t.status?.toLowerCase()) {
      'open' || 'pending' => AppColors.warning,
      'closed' || 'resolved' => AppColors.success,
      _ => AppColors.inkSoft,
    };
    return InkWell(
      onTap: () => _openDetail(t),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: AppColors.line),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    t.subject ?? 'Ticket #${t.id}',
                    style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(color: statusColor.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(6)),
                  child: Text(
                    t.status ?? '—',
                    style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, color: statusColor),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 4),
            if (t.category != null)
              Text(t.category!, style: const TextStyle(fontSize: 11.5, color: AppColors.inkSoft)),
            if (t.createdAt != null && t.createdAt!.isNotEmpty)
              Text(
                _fmtDate(t.createdAt!),
                style: const TextStyle(fontSize: 11, color: AppColors.inkSoft),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildDetail() {
    final t = _detail!;
    return Scaffold(
      appBar: AppBar(
        title: Text(t.subject ?? 'Ticket #${t.id}'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => setState(() => _detail = null),
        ),
      ),
      body: _detailLoading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                Expanded(
                  child: ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      Container(
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: AppColors.line),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(t.description ?? '', style: const TextStyle(fontSize: 13.5, height: 1.5)),
                            const SizedBox(height: 10),
                            Wrap(
                              spacing: 8,
                              children: [
                                if (t.category != null)
                                  _chip(t.category!, AppColors.pillBlueBg, AppColors.pillBlueText),
                                if (t.status != null)
                                  _chip(t.status!, AppColors.pillGrayBg, AppColors.pillGrayText),
                                if (t.priority != null)
                                  _chip(t.priority!, AppColors.pillYellowBg, AppColors.pillYellowText),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                SafeArea(
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: _replyCtrl,
                            decoration: const InputDecoration(hintText: 'Reply…', contentPadding: EdgeInsets.symmetric(horizontal: 14, vertical: 10)),
                          ),
                        ),
                        const SizedBox(width: 8),
                        IconButton.filled(
                          style: IconButton.styleFrom(backgroundColor: AppColors.sage),
                          icon: const Icon(Icons.send, size: 18, color: Colors.white),
                          onPressed: () async {
                            final msg = _replyCtrl.text.trim();
                            if (msg.isEmpty) return;
                            try {
                              await FroApi.replyTicket(t.endpoint ?? '/tickets', t.id, msg);
                              _replyCtrl.clear();
                              _openDetail(t);
                            } catch (e) {
                              if (mounted) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  SnackBar(content: Text(e.toString()), backgroundColor: AppColors.danger),
                                );
                              }
                            }
                          },
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
    );
  }

  void _openRaise() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text('Raise Ticket', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
              const SizedBox(height: 14),
              TextField(
                controller: _subjectCtrl,
                decoration: const InputDecoration(labelText: 'Subject'),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: _category,
                decoration: const InputDecoration(labelText: 'Category'),
                items: [
                  for (final c in _categories)
                    DropdownMenuItem(value: c, child: Text(c)),
                ],
                onChanged: (v) => setState(() => _category = v),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _descCtrl,
                maxLines: 3,
                decoration: const InputDecoration(labelText: 'Description'),
              ),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: () async {
                  if (_subjectCtrl.text.trim().isEmpty || _category == null) return;
                  try {
                    await FroApi.raiseTicket({
                      'subject': _subjectCtrl.text.trim(),
                      'category': _category,
                      'description': _descCtrl.text.trim(),
                    });
                    _subjectCtrl.clear();
                    _descCtrl.clear();
                    if (ctx.mounted) Navigator.pop(ctx);
                    _load();
                  } catch (e) {
                    if (mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: Text(e.toString()), backgroundColor: AppColors.danger),
                      );
                    }
                  }
                },
                child: const Text('Submit Ticket'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _chip(String label, Color bg, Color fg) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(6)),
      child: Text(label, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: fg)),
    );
  }

  String _fmtDate(String iso) {
    final d = DateTime.tryParse(iso);
    if (d == null) return iso;
    return DateFormat('dd MMM, hh:mm a').format(d);
  }
}
