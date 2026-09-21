class NotificationItem {
  final int? id;
  final int? reminderId;
  final String? message;
  final String? alertType;
  final bool read;
  final String? createdAt;

  NotificationItem({
    this.id,
    this.reminderId,
    this.message,
    this.alertType,
    this.read = false,
    this.createdAt,
  });

  factory NotificationItem.fromJson(Map<String, dynamic> json) {
    return NotificationItem(
      id: json['id'] != null ? int.tryParse('${json['id']}') : null,
      reminderId: json['reminder_id'] != null ? int.tryParse('${json['reminder_id']}') : null,
      message: (json['message'] ?? json['body'] ?? json['title'] ?? json['text'])?.toString(),
      alertType: json['alert_type']?.toString(),
      read: json['read'] == true || json['is_read'] == true,
      createdAt: json['created_at']?.toString(),
    );
  }
}