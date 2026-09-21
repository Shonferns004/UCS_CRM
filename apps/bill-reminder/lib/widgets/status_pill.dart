import 'package:flutter/material.dart';

import '../theme.dart';

class StatusPill extends StatelessWidget {
  final String status;
  final double fontSize;
  final bool dense;
  const StatusPill({super.key, required this.status, this.fontSize = 11, this.dense = false});

  @override
  Widget build(BuildContext context) {
    final meta = statusMeta(status);
    return Container(
      padding: EdgeInsets.symmetric(horizontal: dense ? 7 : 9, vertical: dense ? 2.5 : 4),
      decoration: BoxDecoration(
        color: meta.soft,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: dense ? 5 : 6,
            height: dense ? 5 : 6,
            decoration: BoxDecoration(color: meta.color, shape: BoxShape.circle),
          ),
          const SizedBox(width: 5),
          Text(status == 'Completed' ? 'Paid' : status,
            style: TextStyle(
              fontSize: fontSize,
              fontWeight: FontWeight.w700,
              color: meta.color,
            )),
        ],
      ),
    );
  }
}