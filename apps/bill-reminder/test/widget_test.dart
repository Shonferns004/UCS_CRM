import 'package:bill_reminder/models/reminder.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('Reminder.fromJson maps API fields', () {
    final r = Reminder.fromJson({
      'id': 12,
      'title': 'AWS Renewal',
      'amount': 1499.50,
      'due_date': '2026-10-01',
      'renewal_date': '2026-09-21',
      'frequency_type': 'MONTH',
      'remind_days_before': 5,
      'reminder_enabled': true,
      'paid_at': null,
      'daysLeft': 10,
      'derivedStatus': 'Due Soon',
    });

    expect(r.id, 12);
    expect(r.title, 'AWS Renewal');
    expect(r.amount, 1499.50);
    expect(r.dueDate, '2026-10-01');
    expect(r.remindDaysBefore, 5);
    expect(r.reminderEnabled, true);
    expect(r.isCompleted, false);
    expect(r.daysLeft, 10);
    expect(r.statusLabel, 'Due Soon');
  });

  test('Reminder.isCompleted reflects completed_at', () {
    final done = Reminder.fromJson({'id': 1, 'title': 'Paid Bill', 'completed_at': '2026-09-01 10:00:00'});
    final pending = Reminder.fromJson({'id': 2, 'title': 'Pending Bill'});

    expect(done.isCompleted, true);
    expect(done.statusLabel, 'Completed');
    expect(done.paid, true);
    expect(pending.isCompleted, false);
    expect(pending.paid, false);
  });
}