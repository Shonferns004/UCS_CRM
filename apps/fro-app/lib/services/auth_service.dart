import 'package:flutter/material.dart';

import '../models/user.dart';
import 'api_service.dart';

const _roleAliases = <String, String>{
  'hr': 'hr',
  'hr-recruiter': 'recruiter',
  'fro': 'fro',
  'accounts': 'accounts',
  'accountant': 'accounts',
  'admin': 'admin',
  'ngo admin': 'admin',
  'ngo_admin': 'admin',
  'super_admin': 'super_admin',
  'superadmin': 'super_admin',
  'master': 'master',
  'recruiter': 'recruiter',
  'telecaller': 'telecaller',
  'worker': 'worker',
  'event_head': 'event_head',
  'event manager': 'event_manager',
  'event_manager': 'event_manager',
  'event head': 'event_head',
  'whatsapp_crm': 'whatsapp_crm',
  'digital': 'digital',
  'developer': 'developers',
  'developers': 'developers',
  'agent': 'agent',
  'viewer': 'viewer',
};

const _allowedFroRoles = {'fro', 'worker'};

String normalizeRole(String? role) {
  if (role == null) return '';
  final s = role.trim().toLowerCase();
  return _roleAliases[s] ?? s;
}

class AuthService extends ChangeNotifier {
  UserSession? user;
  bool get isLoggedIn => user != null;

  bool get hasAccess =>
      user != null && _allowedFroRoles.contains(normalizeRole(user!.role));

  static Future<AuthService> create() async {
    final svc = AuthService();
    await svc.restore();
    return svc;
  }

  Future<void> restore() async {
    final raw = await ApiService.getUser();
    final token = await ApiService.getToken();
    if (raw != null && token != null && token.isNotEmpty) {
      final role = normalizeRole(raw['role']?.toString());
      if (_allowedFroRoles.contains(role)) {
        user = UserSession.fromJsonMap({...raw, 'role': role});
      }
    }
    notifyListeners();
  }

  Future<UserSession> login(String identifier, String password) async {
    final data = await ApiService.login(identifier, password);
    final role = normalizeRole(
        (data['role'] ?? data['user']?['role'])?.toString());
    if (!_allowedFroRoles.contains(role)) {
      throw ApiException('Access denied. Invalid role.');
    }
    final userData =
        (data['user'] as Map<String, dynamic>?) ?? <String, dynamic>{...data};
    userData['role'] = role;
    await ApiService.setUser(userData);
    user = UserSession.fromJsonMap(userData);
    notifyListeners();
    return user!;
  }

  Future<void> logout() async {
    try {
      await ApiService.post('/auth/logout', body: {});
    } catch (_) {}
    await ApiService.clearSession();
    user = null;
    notifyListeners();
  }

  void clearLocal() {
    user = null;
    notifyListeners();
  }
}
