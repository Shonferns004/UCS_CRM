class Reminder {
  final int? id;
  final String title;
  final String? description;
  final String? category;
  final String? owner;
  final String? dueDate;
  final String? renewalDate;
  final String? frequencyType;
  final int? frequencyInterval;
  final int? dayOfMonth;
  final int? monthOfYear;
  final String? displayFrequency;
  final String? priority;
  final String? status;
  final bool alarmEnabled;
  final bool reminderEnabled;
  final String? reminderTime;
  final bool notificationEnabled;
  final String? notes;
  final bool isDeleted;
  final bool isCompleted;
  final String? createdAt;
  final double? amount;
  final String? paidAt;
  final int? remindDaysBefore;

  // Derived meta from the API (computeDueMeta).
  final int? daysLeft;
  final int? daysOverdue;
  final String? derivedStatus;

  Reminder({
    this.id,
    required this.title,
    this.description,
    this.category,
    this.owner,
    this.dueDate,
    this.renewalDate,
    this.frequencyType,
    this.frequencyInterval,
    this.dayOfMonth,
    this.monthOfYear,
    this.displayFrequency,
    this.priority,
    this.status,
    this.alarmEnabled = false,
    this.reminderEnabled = false,
    this.reminderTime,
    this.notificationEnabled = false,
    this.notes,
    this.isDeleted = false,
    this.isCompleted = false,
    this.createdAt,
    this.amount,
    this.paidAt,
    this.remindDaysBefore,
    this.daysLeft,
    this.daysOverdue,
    this.derivedStatus,
  });

  factory Reminder.fromJson(Map<String, dynamic> json) {
    return Reminder(
      id: json['id'] != null ? int.tryParse('${json['id']}') : null,
      title: json['title']?.toString() ?? '',
      description: json['description']?.toString(),
      category: json['category']?.toString(),
      owner: json['owner']?.toString(),
      dueDate: json['due_date']?.toString(),
      renewalDate: json['renewal_date']?.toString(),
      frequencyType: json['frequency_type']?.toString(),
      frequencyInterval: json['frequency_interval'] != null ? int.tryParse('${json['frequency_interval']}') : null,
      dayOfMonth: json['day_of_month'] != null ? int.tryParse('${json['day_of_month']}') : null,
      monthOfYear: json['month_of_year'] != null ? int.tryParse('${json['month_of_year']}') : null,
      displayFrequency: json['display_frequency']?.toString(),
      priority: json['priority']?.toString(),
      status: json['status']?.toString(),
      alarmEnabled: json['alarm_enabled'] == true,
      reminderEnabled: json['reminder_enabled'] == true,
      reminderTime: json['reminder_time']?.toString(),
      notificationEnabled: json['notification_enabled'] == true,
      notes: json['notes']?.toString(),
      isDeleted: json['is_deleted'] == true,
      isCompleted: json['completed_at'] != null,
      createdAt: json['created_at']?.toString(),
      amount: json['amount'] != null ? double.tryParse('${json['amount']}') : null,
      paidAt: json['paid_at']?.toString(),
      remindDaysBefore: json['remind_days_before'] != null ? int.tryParse('${json['remind_days_before']}') : null,
      daysLeft: json['daysLeft'] != null ? int.tryParse('${json['daysLeft']}') : null,
      daysOverdue: json['daysOverdue'] != null ? int.tryParse('${json['daysOverdue']}') : null,
      derivedStatus: json['derivedStatus']?.toString(),
    );
  }

  bool get paid => isCompleted || status == 'Completed';

  String get statusLabel {
    if (paid) return 'Completed';
    if (derivedStatus != null) return derivedStatus!;
    return status ?? 'Upcoming';
  }

  /// The date the reminder should be shown against (due date, else renewal).
  String? get effectiveShowDate => (dueDate != null && dueDate!.isNotEmpty) ? dueDate : renewalDate;
}