import '../models/attendance_record.dart';
import '../models/leave_record.dart';
import '../models/monthly_breakdown.dart';
import '../models/employee.dart';

final Employee employee = Employee(
  name: 'Arjun Sharma',
  id: 'EMP-2024-0182',
  shift: '09:00',
  role: 'Software Engineer · Product Team',
  department: 'Engineering',
  joined: '14 Aug 2024',
  manager: 'Priya Mehta',
  email: 'arjun@company.com',
);

final Map<String, AttendanceRecord> attendanceData = {
  '2025-06-01': AttendanceRecord(status: 'present', inTime: '08:58', outTime: '18:10'),
  '2025-06-02': AttendanceRecord(status: 'present', inTime: '09:05', outTime: '18:02'),
  '2025-06-03': AttendanceRecord(status: 'present', inTime: '08:55', outTime: '18:15'),
  '2025-06-04': AttendanceRecord(status: 'absent'),
  '2025-06-05': AttendanceRecord(status: 'present', inTime: '09:00', outTime: '18:00'),
  '2025-06-06': AttendanceRecord(status: 'present', inTime: '09:12', outTime: '18:20'),
  '2025-06-07': AttendanceRecord(status: 'late', inTime: '09:48', outTime: '18:30'),
  '2025-06-08': AttendanceRecord(status: 'leave', leaveType: 'Casual'),
  '2025-06-09': AttendanceRecord(status: 'present', inTime: '08:58', outTime: null),
  '2025-06-10': AttendanceRecord(status: 'present', inTime: '09:03', outTime: '18:10'),
  '2025-06-11': AttendanceRecord(status: 'present', inTime: '08:59', outTime: '18:05'),
  '2025-06-12': AttendanceRecord(status: 'present', inTime: '09:01', outTime: '18:00'),
  '2025-06-13': AttendanceRecord(status: 'leave', leaveType: 'Earned'),
  '2025-06-14': AttendanceRecord(status: 'leave', leaveType: 'Earned'),
  '2025-06-15': AttendanceRecord(status: 'present', inTime: '09:00', outTime: '18:00'),
  '2025-06-16': AttendanceRecord(status: 'present', inTime: '08:55', outTime: '18:25'),
  '2025-06-17': AttendanceRecord(status: 'absent'),
  '2025-06-18': AttendanceRecord(status: 'present', inTime: '09:02', outTime: '18:08'),
  '2025-06-19': AttendanceRecord(status: 'present', inTime: '09:01', outTime: '18:01'),
  '2025-06-20': AttendanceRecord(status: 'present', inTime: '09:00', outTime: '18:00'),
};

final List<LeaveRecord> leaveHistory = [
  LeaveRecord(type: 'Earned Leave', from: '13 Jun 2025', to: '14 Jun 2025', days: 2, status: 'approved', reason: 'Personal travel'),
  LeaveRecord(type: 'Casual Leave', from: '8 Jun 2025', to: '8 Jun 2025', days: 1, status: 'approved', reason: 'Medical appointment'),
  LeaveRecord(type: 'Sick Leave', from: '22 Mar 2025', to: '22 Mar 2025', days: 1, status: 'approved', reason: 'Fever'),
  LeaveRecord(type: 'Casual Leave', from: '10 Jan 2025', to: '10 Jan 2025', days: 1, status: 'approved', reason: 'Family function'),
];

final List<MonthlyBreakdown> monthlyBreakdown = [
  MonthlyBreakdown(month: 'June', present: 18, absent: 2, late: 1, leave: 3, rate: 87),
  MonthlyBreakdown(month: 'May', present: 22, absent: 1, late: 0, leave: 1, rate: 95),
  MonthlyBreakdown(month: 'April', present: 20, absent: 0, late: 2, leave: 2, rate: 100),
  MonthlyBreakdown(month: 'March', present: 23, absent: 1, late: 1, leave: 1, rate: 95),
];
