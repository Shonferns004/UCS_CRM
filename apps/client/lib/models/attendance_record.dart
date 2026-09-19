class AttendanceRecord {
  final String status;
  final String? inTime;
  final String? outTime;
  final String? leaveType;

  AttendanceRecord({
    required this.status,
    this.inTime,
    this.outTime,
    this.leaveType,
  });
}
