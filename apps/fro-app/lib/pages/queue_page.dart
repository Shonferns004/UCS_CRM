import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/models.dart';
import '../services/call_service.dart';
import '../services/fro_api.dart';
import '../theme.dart';
import '../widgets/donor_card.dart';
import 'disposition_sheet.dart';
import 'donor_detail_page.dart';

class QueuePane extends StatefulWidget {
  const QueuePane({super.key});

  @override
  State<QueuePane> createState() => _QueuePaneState();
}

class _QueuePaneState extends State<QueuePane> {
  final List<String> _tabs = ['New', 'Old'];
  String _tab = 'New';
  List<dynamic> _stations = [];
  String? _station;
  String? _ngoId;

  Donor? _current;
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _boot();
  }

  Future<void> _boot() async {
    setState(() => _loading = true);
    try {
      final stationsRes = await FroApi.myStations();
      final list = (stationsRes['stations'] as List?)?.whereType<Map>().toList() ?? [];
      final stationNames = <String>[];
      String? firstNgo;
      String? firstStation;
      for (final s in list) {
        final st = s['station']?.toString();
        if (st != null && st.isNotEmpty && !stationNames.contains(st)) {
          stationNames.add(st);
          firstNgo ??= s['ngo_id']?.toString();
          firstStation ??= st;
        }
      }
      setState(() {
        _stations = stationNames;
        _station = stationNames.isNotEmpty ? null : null;
        _ngoId = firstNgo;
      });
      await _loadQueue();
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      setState(() => _loading = false);
    }
  }

  Future<void> _loadQueue() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final r = await FroApi.queueCurrent(
        station: _station,
        ngoId: _ngoId,
        newOnly: _tab == 'New',
        oldOnly: _tab == 'Old',
      );
      final donorMap = r['donor'] is Map ? r['donor'] as Map<String, dynamic> : null;
      setState(() {
        _current = donorMap != null ? Donor.fromJson(donorMap) : null;
      });
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      setState(() => _loading = false);
    }
  }

  void _startCall(Donor donor) {
    final call = context.read<CallService>();
    call.startCall(donor);
    setState(() {});
  }

  Future<void> _endCall(Donor donor) async {
    final call = context.read<CallService>();
    if (call.isOnCall) {
      call.endCall();
    }
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (_) => DispositionSheet(
        donorId: donor.id,
        ngoId: donor.ngoId,
        donorName: donor.donorName,
        donorMobile: donor.donorMobile,
      ),
    );
    await _loadQueue();
  }

  @override
  Widget build(BuildContext context) {
    final call = context.watch<CallService>();
    final current = _current;
    final onCall = call.isOnCall;
    final activeDonor = onCall
        ? Donor(
            id: call.activeCall!.donorId,
            donorName: call.activeCall!.donorName,
            donorMobile: call.activeCall!.donorMobile,
            ngoId: current?.ngoId,
            raw: const {},
          )
        : current;

    return RefreshIndicator(
      onRefresh: _loadQueue,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Row(
            children: [
              SegmentedButton<String>(
                segments: [
                  for (final t in _tabs)
                    ButtonSegment(value: t, label: Text(t)),
                ],
                selected: {_tab},
                onSelectionChanged: (s) {
                  setState(() => _tab = s.first);
                  _loadQueue();
                },
                style: SegmentedButton.styleFrom(
                  visualDensity: VisualDensity.compact,
                  textStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
                ),
              ),
              const Spacer(),
              if (_stations.isNotEmpty)
                DropdownButton<String>(
                  value: _station,
                  hint: const Text('All stations', style: TextStyle(fontSize: 12)),
                  isDense: true,
                  underline: const SizedBox.shrink(),
                  items: [
                    const DropdownMenuItem(value: null, child: Text('All', style: TextStyle(fontSize: 12))),
                    for (final s in _stations)
                      DropdownMenuItem(value: s, child: Text(s, style: const TextStyle(fontSize: 12))),
                  ],
                  onChanged: (v) {
                    setState(() => _station = v);
                    _loadQueue();
                  },
                ),
            ],
          ),
          const SizedBox(height: 12),
          if (_loading && current == null && !onCall)
            const Center(
              child: Padding(
                padding: EdgeInsets.all(32),
                child: CircularProgressIndicator(),
              ),
            )
          else if (_error != null)
            _errorBox(_error!, retry: _loadQueue)
          else if (activeDonor == null)
            _emptyBox()
          else
            DonorCard(
              donor: activeDonor,
              onCall: onCall,
              elapsed: call.elapsed,
              onStartCall: onCall ? null : () => _startCall(activeDonor),
              onEndCall: onCall ? () => _endCall(activeDonor) : null,
              onOpenDetail: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => DonorDetailPage(
                      donorId: activeDonor.id,
                      ngoId: activeDonor.ngoId,
                      donor: activeDonor,
                    ),
                  ),
                );
              },
            ),
          if (onCall && current != null) ...[
            const SizedBox(height: 12),
            DonorCard(
              donor: current,
              onCall: false,
              dimmed: true,
              onStartCall: null,
              onEndCall: null,
              onOpenDetail: null,
            ),
          ],
        ],
      ),
    );
  }

  Widget _emptyBox() {
    return Container(
      padding: const EdgeInsets.all(32),
      alignment: Alignment.center,
      child: Column(
        children: [
          Icon(Icons.inbox, size: 48, color: AppColors.inkSoft.withValues(alpha: 0.4)),
          const SizedBox(height: 12),
          const Text(
            'No donor in queue',
            style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 6),
          const Text(
            'You are all caught up. New leads will appear here.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 12.5, color: AppColors.inkSoft),
          ),
          const SizedBox(height: 16),
          OutlinedButton.icon(
            onPressed: _loadQueue,
            icon: const Icon(Icons.refresh, size: 16),
            label: const Text('Refresh'),
          ),
        ],
      ),
    );
  }

  Widget _errorBox(String msg, {VoidCallback? retry}) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.pillRedBg,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.idleBorder),
      ),
      child: Column(
        children: [
          Text(
            msg,
            style: const TextStyle(color: AppColors.pillRedText, fontSize: 13, fontWeight: FontWeight.w600),
          ),
          if (retry != null) ...[
            const SizedBox(height: 10),
            OutlinedButton(onPressed: retry, child: const Text('Retry')),
          ],
        ],
      ),
    );
  }
}
