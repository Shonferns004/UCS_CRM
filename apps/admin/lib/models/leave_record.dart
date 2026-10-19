class LeaveRecord {
  final String type;
  final String from;
  final String to;
  final int days;
  final String status;
  final String reason;

  LeaveRecord({
    required this.type,
    required this.from,
    required this.to,
    required this.days,
    required this.status,
    required this.reason,
  });
}
