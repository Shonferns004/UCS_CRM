class UserSession {
  final String? id;
  final String? name;
  final String? role;
  final String? department;
  final String? workerId;
  final Map<String, dynamic> raw;

  UserSession({
    this.id,
    this.name,
    this.role,
    this.department,
    this.workerId,
    required this.raw,
  });

  factory UserSession.fromJson(Map<String, dynamic> json) {
    final user = (json['user'] as Map<String, dynamic>?) ?? json;
    return UserSession(
      id: (user['id'] ?? user['worker_id'] ?? '').toString(),
      name: (user['name'] ?? user['full_name'] ?? '').toString(),
      role: (json['role'] ?? user['role'] ?? '').toString().toLowerCase(),
      department: (user['department'] ?? '').toString(),
      workerId: (user['worker_id'] ?? user['id'] ?? '').toString(),
      raw: user,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'role': role,
        'department': department,
        'worker_id': workerId,
        'raw': raw,
      };

  factory UserSession.fromJsonMap(Map<String, dynamic> json) =>
      UserSession.fromJson(json);
}
