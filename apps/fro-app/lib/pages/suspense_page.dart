import 'dart:async';

import 'package:flutter/material.dart';

import '../models/models.dart';
import '../services/fro_api.dart';
import '../theme.dart';
import '../widgets/skeleton.dart';

class SuspensePane extends StatefulWidget {
  const SuspensePane({super.key});

  @override
  State<SuspensePane> createState() => _SuspensePaneState();
}

class _SuspensePaneState extends State<SuspensePane> {
  List<SuspenseReceipt> _receipts = [];
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
      final list = await FroApi.suspenseReceipts();
      if (!mounted) return;
      setState(() {
        _receipts = list;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return ListView(
        padding: const EdgeInsets.all(16),
        children: const [
          SkeletonBlock(height: 80),
          SizedBox(height: 10),
          SkeletonBlock(height: 80),
        ],
      );
    }
    if (_error != null) {
      return Center(
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
      );
    }
    if (_receipts.isEmpty) {
      return const Center(
        child: Text('No suspense receipts', style: TextStyle(color: AppColors.inkSoft)),
      );
    }
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: _receipts.length,
        separatorBuilder: (_, __) => const SizedBox(height: 10),
        itemBuilder: (context, i) {
          final r = _receipts[i];
          return _receiptCard(r);
        },
      ),
    );
  }

  Widget _receiptCard(SuspenseReceipt r) {
    final claimed = r.claimedBy != null && r.claimedBy!.isNotEmpty;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  r.amount != null && r.amount!.isNotEmpty ? '₹${r.amount}' : '—',
                  style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: claimed ? AppColors.pillGrayBg : AppColors.pillYellowBg,
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  claimed ? 'Claimed' : 'Unclaimed',
                  style: TextStyle(
                    fontSize: 10.5,
                    fontWeight: FontWeight.w700,
                    color: claimed ? AppColors.pillGrayText : AppColors.pillYellowText,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          if (r.upiRef != null && r.upiRef!.isNotEmpty)
            Text('UPI: ${r.upiRef}', style: const TextStyle(fontSize: 12, color: AppColors.inkSoft)),
          if (r.date != null)
            Text(
              [r.date, r.time].where((e) => e != null && e.isNotEmpty).join(' '),
              style: const TextStyle(fontSize: 12, color: AppColors.inkSoft),
            ),
          if (r.donorName != null && r.donorName!.isNotEmpty)
            Text(r.donorName!, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
          if (!claimed) ...[
            const SizedBox(height: 10),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                icon: const Icon(Icons.link, size: 16),
                label: const Text('Claim to Donor'),
                onPressed: () => _openClaim(r),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Future<void> _openClaim(SuspenseReceipt r) async {
    final result = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (_) => _ClaimSheet(receipt: r),
    );
    if (result == true) _load();
  }
}

class _ClaimSheet extends StatefulWidget {
  final SuspenseReceipt receipt;
  const _ClaimSheet({required this.receipt});

  @override
  State<_ClaimSheet> createState() => _ClaimSheetState();
}

class _ClaimSheetState extends State<_ClaimSheet> {
  final _searchCtrl = TextEditingController();
  Timer? _debounce;
  List<Donor> _results = [];
  bool _searching = false;
  Donor? _picked;
  bool _claiming = false;
  String? _error;

  @override
  void dispose() {
    _debounce?.cancel();
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _search(String q) async {
    if (q.trim().length < 3) {
      setState(() => _results = []);
      return;
    }
    setState(() => _searching = true);
    try {
      final list = await FroApi.searchSuspenseDonors(q.trim());
      if (mounted) setState(() => _results = list);
    } catch (_) {
    } finally {
      if (mounted) setState(() => _searching = false);
    }
  }

  Future<void> _claim() async {
    if (_picked == null) {
      setState(() => _error = 'Select a donor first');
      return;
    }
    setState(() {
      _claiming = true;
      _error = null;
    });
    try {
      await FroApi.claimSuspense(widget.receipt.id, {
        'donor_id': _picked!.id,
        'ngo_id': _picked!.ngoId,
      });
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      setState(() {
        _error = e.toString();
        _claiming = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.7,
        minChildSize: 0.4,
        maxChildSize: 0.95,
        builder: (context, scrollCtrl) => Column(
          children: [
            Container(
              margin: const EdgeInsets.only(top: 10),
              width: 40,
              height: 4,
              decoration: BoxDecoration(color: AppColors.line, borderRadius: BorderRadius.circular(2)),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 8, 0),
              child: Row(
                children: [
                  const Expanded(
                    child: Text('Claim Suspense Receipt', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
                  ),
                  IconButton(icon: const Icon(Icons.close), onPressed: () => Navigator.pop(context)),
                ],
              ),
            ),
            const Divider(height: 20),
            Expanded(
              child: ListView(
                controller: scrollCtrl,
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                children: [
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AppColors.pillYellowBg,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(
                      'Amount: ₹${widget.receipt.amount ?? '—'}'
                      '${widget.receipt.upiRef != null ? '\nUPI: ${widget.receipt.upiRef}' : ''}',
                      style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.pillYellowText),
                    ),
                  ),
                  const SizedBox(height: 14),
                  const Text('Search Donor', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.inkSoft)),
                  const SizedBox(height: 6),
                  TextField(
                    controller: _searchCtrl,
                    keyboardType: TextInputType.phone,
                    decoration: const InputDecoration(hintText: 'Mobile number'),
                    onChanged: (v) {
                      _debounce?.cancel();
                      _debounce = Timer(const Duration(milliseconds: 600), () => _search(v));
                    },
                  ),
                  if (_searching) ...[
                    const SizedBox(height: 12),
                    const Center(child: CircularProgressIndicator()),
                  ],
                  for (final d in _results)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: const Icon(Icons.person, size: 20),
                      title: Text(d.donorName ?? 'Unknown', style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600)),
                      subtitle: Text(d.donorMobile ?? '', style: const TextStyle(fontSize: 12, color: AppColors.inkSoft)),
                      trailing: _picked?.id == d.id
                          ? const Icon(Icons.check_circle, color: AppColors.sage)
                          : null,
                      onTap: () => setState(() => _picked = d),
                    ),
                  if (_picked != null) ...[
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: AppColors.activeBg,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Text(
                        'Claiming to: ${_picked!.donorName ?? 'Unknown'} (${_picked!.donorMobile ?? ''})',
                        style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.activeText),
                      ),
                    ),
                  ],
                  if (_error != null) ...[
                    const SizedBox(height: 10),
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(color: AppColors.pillRedBg, borderRadius: BorderRadius.circular(8)),
                      child: Text(_error!, style: const TextStyle(fontSize: 12.5, color: AppColors.pillRedText)),
                    ),
                  ],
                  const SizedBox(height: 16),
                  ElevatedButton(
                    onPressed: _claiming ? null : _claim,
                    child: _claiming
                        ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : const Text('Claim Receipt'),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
