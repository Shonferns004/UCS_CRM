import 'package:flutter/material.dart';

import '../data/dispositions.dart';
import '../models/models.dart';
import '../theme.dart';

class DonorCard extends StatelessWidget {
  final Donor donor;
  final bool onCall;
  final int elapsed;
  final bool dimmed;
  final VoidCallback? onStartCall;
  final VoidCallback? onEndCall;
  final VoidCallback? onOpenDetail;

  const DonorCard({
    super.key,
    required this.donor,
    required this.onCall,
    this.elapsed = 0,
    this.dimmed = false,
    this.onStartCall,
    this.onEndCall,
    this.onOpenDetail,
  });

  String _fmt(int s) {
    final m = s ~/ 60;
    final sec = s % 60;
    return '$m:${sec.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    final name = donor.donorName ?? 'Unknown donor';
    final mobile = donor.donorMobile ?? '—';
    final status = donor.status ?? 'pending';

    return Opacity(
      opacity: dimmed ? 0.6 : 1,
      child: Container(
        width: double.infinity,
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: onCall ? AppColors.danger : AppColors.line,
            width: onCall ? 1.6 : 1,
          ),
          boxShadow: const [
            BoxShadow(color: Color(0x140F172A), blurRadius: 12, offset: Offset(0, 4)),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      name,
                      style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  StatusPillLabel(status: status),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 6, 16, 0),
              child: Row(
                children: [
                  const Icon(Icons.phone, size: 15, color: AppColors.inkSoft),
                  const SizedBox(width: 6),
                  Text(
                    mobile,
                    style: const TextStyle(fontSize: 14, color: AppColors.inkSoft, fontWeight: FontWeight.w600),
                  ),
                  if (donor.donorCity != null) ...[
                    const SizedBox(width: 12),
                    const Icon(Icons.location_on, size: 14, color: AppColors.inkSoft),
                    const SizedBox(width: 4),
                    Text(
                      donor.donorCity!,
                      style: const TextStyle(fontSize: 12.5, color: AppColors.inkSoft),
                    ),
                  ],
                ],
              ),
            ),
            if (donor.station != null || donor.donorType != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 6, 16, 0),
                child: Wrap(
                  spacing: 8,
                  runSpacing: 4,
                  children: [
                    if (donor.station != null)
                      _chip(donor.station!, AppColors.pillGrayBg, AppColors.pillGrayText),
                    if (donor.donorType != null)
                      _chip(donor.donorType!, AppColors.pillBlueBg, AppColors.pillBlueText),
                  ],
                ),
              ),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  Expanded(
                    child: onCall
                        ? Container(
                            padding: const EdgeInsets.symmetric(vertical: 8),
                            decoration: BoxDecoration(
                              color: AppColors.pillRedBg,
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Column(
                              children: [
                                const Text(
                                  'ON CALL',
                                  style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: AppColors.danger, letterSpacing: 1),
                                ),
                                Text(
                                  _fmt(elapsed),
                                  style: const TextStyle(
                                    fontSize: 20,
                                    fontWeight: FontWeight.w800,
                                    color: AppColors.danger,
                                    fontFeatures: [FontFeature.tabularFigures()],
                                  ),
                                ),
                              ],
                            ),
                          )
                        : ElevatedButton.icon(
                            style: ElevatedButton.styleFrom(
                              backgroundColor: AppColors.sage,
                              minimumSize: const Size.fromHeight(44),
                            ),
                            icon: const Icon(Icons.phone, size: 18, color: Colors.white),
                            label: const Text('Call'),
                            onPressed: onStartCall,
                          ),
                  ),
                  const SizedBox(width: 10),
                  if (onCall)
                    Expanded(
                      child: ElevatedButton.icon(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.danger,
                          minimumSize: const Size.fromHeight(44),
                        ),
                        icon: const Icon(Icons.phone_disabled, size: 18, color: Colors.white),
                        label: const Text('End & Dispose'),
                        onPressed: onEndCall,
                      ),
                    )
                  else
                    OutlinedButton(
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size(44, 44),
                        padding: const EdgeInsets.symmetric(horizontal: 14),
                      ),
                      onPressed: onOpenDetail,
                      child: const Icon(Icons.info_outline, size: 18),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _chip(String label, Color bg, Color fg) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(6)),
      child: Text(label, style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, color: fg)),
    );
  }
}

class StatusPillLabel extends StatelessWidget {
  final String status;
  const StatusPillLabel({super.key, required this.status});

  @override
  Widget build(BuildContext context) {
    final name = pillColorName(status) ?? 'gray';
    final (bg, fg) = switch (name) {
      'yellow' => (AppColors.pillYellowBg, AppColors.pillYellowText),
      'blue' => (AppColors.pillBlueBg, AppColors.pillBlueText),
      'purple' => (AppColors.pillPurpleBg, AppColors.pillPurpleText),
      'red' => (AppColors.pillRedBg, AppColors.pillRedText),
      'green' => (AppColors.pillGreenBg, AppColors.pillGreenText),
      _ => (AppColors.pillGrayBg, AppColors.pillGrayText),
    };
    final label = status.replaceAll('_', ' ');
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(6)),
      child: Text(
        label,
        style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, color: fg),
      ),
    );
  }
}
