import '../models/models.dart';
import 'api_service.dart';

class FroApi {
  static Future<Map<String, dynamic>> _map(dynamic r) =>
      Future.value(r is Map<String, dynamic> ? r : <String, dynamic>{});

  static Future<List<Donor>> _donorList(dynamic r) async {
    if (r is List) return r.whereType<Map>().map((e) => Donor.fromJson(e.cast<String, dynamic>())).toList();
    if (r is Map && r['donors'] is List) {
      return (r['donors'] as List).whereType<Map>().map((e) => Donor.fromJson(e.cast<String, dynamic>())).toList();
    }
    if (r is Map && r['data'] is List) {
      return (r['data'] as List).whereType<Map>().map((e) => Donor.fromJson(e.cast<String, dynamic>())).toList();
    }
    return [];
  }

  static Future<Map<String, dynamic>> myStations() async =>
      _map(await ApiService.get('/fro/my-stations'));

  static Future<Map<String, dynamic>> queueCurrent({
    String? station,
    String? ngoId,
    bool? newOnly,
    bool? oldOnly,
  }) async {
    final q = <String>[];
    if (newOnly == true) q.add('new_only=true');
    if (oldOnly == true) q.add('old_only=true');
    if (station != null && station.isNotEmpty && station != 'all') q.add('station=$station');
    if (ngoId != null && ngoId.isNotEmpty) q.add('ngo_id=$ngoId');
    final qs = q.isEmpty ? '' : '?${q.join('&')}';
    return _map(await ApiService.get('/fro/queue/current$qs'));
  }

  static Future<List<Donor>> myDonors({
    String? status,
    String? statusGroup,
    String? station,
    String? ngoId,
    bool? newOnly,
    bool? oldOnly,
    bool verifiedOnly = false,
    int? limit,
    int? offset,
  }) async {
    final q = <String, String>{};
    if (statusGroup != null) q['status_group'] = statusGroup;
    else if (status != null) q['status'] = status;
    if (verifiedOnly) q['verified_only'] = 'true';
    if (newOnly == true) q['new_only'] = 'true';
    if (oldOnly == true) q['old_only'] = 'true';
    if (station != null && station.isNotEmpty && station != 'all') q['station'] = station;
    if (ngoId != null && ngoId.isNotEmpty) q['ngo_id'] = ngoId;
    if (limit != null) q['limit'] = '$limit';
    if (offset != null) q['offset'] = '$offset';
    final qs = q.isEmpty ? '' : '?${q.entries.map((e) => '${e.key}=${e.value}').join('&')}';
    return _donorList(await ApiService.get('/fro/donors$qs'));
  }

  // Full donor detail: the donor's CRM timeline plus the assignment's durable
  // totals — the web FRO panel's "detail" object.
  static Future<Map<String, dynamic>> donorDetail(dynamic donorId, {String? ngoId}) async {
    final q = ngoId != null && ngoId.isNotEmpty ? '?ngo_id=$ngoId' : '';
    return _map(await ApiService.get('/fro/donors/$donorId/logs$q'));
  }

  static Future<List<DonorLog>> donorLogs(dynamic donorId, {String? ngoId}) async {
    final map = await donorDetail(donorId, ngoId: ngoId);
    final r = map['logs'];
    if (r is List) return r.whereType<Map>().map((e) => DonorLog.fromJson(e.cast<String, dynamic>())).toList();
    return [];
  }

  static Future<Map<String, dynamic>> addDonorLog(dynamic donorId, Map<String, dynamic> data) async {
    final r = await ApiService.post('/fro/donors/$donorId/logs', body: data, timeout: const Duration(seconds: 20));
    return _map(r);
  }

  static Future<void> updateDonorStatus(dynamic donorId, Map<String, dynamic> data) =>
      ApiService.put('/fro/donors/$donorId/status', body: data);

  static Future<void> updateDonorType(dynamic donorId, String donorType) =>
      ApiService.put('/fro/donors/$donorId/donor-type', body: {'donor_type': donorType});

  static Future<void> markDonorSeen(dynamic donorId, {String? ngoId}) =>
      ApiService.put('/fro/donors/$donorId/mark-seen', body: ngoId != null ? {'ngo_id': ngoId} : {});

  static Future<List<dynamic>> donorDonations(dynamic donorId, {String? ngoId}) async {
    final q = <String>['limit=1000', 'page_size=1000'];
    if (ngoId != null && ngoId.isNotEmpty) q.add('ngo_id=$ngoId');
    final r = await ApiService.get('/fro/donors/$donorId/donations?${q.join('&')}');
    if (r is List) return r;
    if (r is Map && r['donations'] is List) return r['donations'] as List;
    return [];
  }

  static Future<List<dynamic>> donorReceipts(dynamic donorId, {String? ngoId}) async {
    final q = ngoId != null && ngoId.isNotEmpty ? '?ngo_id=$ngoId' : '';
    final r = await ApiService.get('/fro/donors/$donorId/receipts$q');
    if (r is List) return r;
    if (r is Map && r['receipts'] is List) return r['receipts'] as List;
    return [];
  }

  static Future<List<dynamic>> donorHistory(dynamic donorId, {String? period}) async {
    final q = period != null ? '?period=$period' : '';
    final r = await ApiService.get('/fro/donors/$donorId/history$q');
    if (r is List) return r;
    if (r is Map && r['history'] is List) return r['history'] as List;
    return [];
  }

  static Future<Map<String, dynamic>> myDashboard() =>
      ApiService.get('/fro/dashboard', timeout: const Duration(seconds: 20)).then(_map);

  static Future<Map<String, dynamic>> myTarget() =>
      ApiService.get('/fro/target').then(_map);

  static Future<Map<String, dynamic>> myPerformance() =>
      ApiService.get('/fro/my-performance').then(_map);

  static Future<Map<String, dynamic>> myCollections({String? ngoId, String? month}) async {
    final q = <String>[];
    if (ngoId != null && ngoId.isNotEmpty) q.add('ngo_id=$ngoId');
    if (month != null && month != 'current') q.add('month=$month');
    final qs = q.isEmpty ? '' : '?${q.join('&')}';
    return _map(await ApiService.get('/fro/dashboard/collections$qs'));
  }

  static Future<List<dynamic>> followUps() async {
    final r = await ApiService.get('/fro/follow-ups');
    if (r is List) return r;
    if (r is Map && r['follow_ups'] is List) return r['follow_ups'] as List;
    return [];
  }

  static Future<Map<String, dynamic>> leadStats({String? month}) async {
    final q = month != null ? '?month=$month' : '';
    return _map(await ApiService.get('/fro/lead-stats$q'));
  }

  static Future<List<dynamic>> monthlyDonors({String? month}) async {
    final q = month != null ? '?month=$month' : '';
    final r = await ApiService.get('/fro/monthly-donors$q');
    if (r is List) return r;
    if (r is Map && r['donors'] is List) return r['donors'] as List;
    return [];
  }

  static Future<List<dynamic>> reactivatedDonors({String period = 'today'}) async {
    final r = await ApiService.get('/fro/reactivated-donors?period=$period');
    if (r is List) return r;
    if (r is Map && r['donors'] is List) return r['donors'] as List;
    return [];
  }

  static Future<void> requestMoreData(String message) =>
      ApiService.post('/fro/request-data', body: {'message': message});

  static Future<List<dynamic>> scheduled() async {
    final r = await ApiService.get('/fro/scheduled');
    return r is List ? r : [];
  }

  static Future<List<dynamic>> callbacks() async {
    final r = await ApiService.get('/fro/callbacks');
    return r is List ? r : [];
  }

  static Future<List<dynamic>> promises() async {
    final r = await ApiService.get('/fro/promises');
    return r is List ? r : [];
  }

  static Future<List<dynamic>> overdue() async {
    final r = await ApiService.get('/fro/overdue');
    return r is List ? r : [];
  }

  static Future<List<Donor>> searchDonors(String q, {String? station, String? ngoId, bool disposed = false}) async {
    final params = ['q=${Uri.encodeComponent(q)}'];
    if (disposed) params.add('disposed=true');
    if (station != null && station.isNotEmpty) params.add('station=$station');
    if (ngoId != null && ngoId.isNotEmpty) params.add('ngo_id=$ngoId');
    return _donorList(await ApiService.get('/fro/search-donors?${params.join('&')}'));
  }

  static Future<List<Donor>> myDisposedLeads({String? station, String? ngoId}) async {
    final q = <String>[];
    if (station != null && station.isNotEmpty) q.add('station=$station');
    if (ngoId != null && ngoId.isNotEmpty) q.add('ngo_id=$ngoId');
    final qs = q.isEmpty ? '' : '?${q.join('&')}';
    return _donorList(await ApiService.get('/fro/my-disposed-leads$qs'));
  }

  static Future<List<SuspenseReceipt>> suspenseReceipts() async {
    final r = await ApiService.get('/fro/dashboard/suspense');
    final list = r is Map ? (r['receipts'] ?? r['entries'] ?? r['data']) : r;
    if (list is List) {
      return list.whereType<Map>().map((e) => SuspenseReceipt.fromJson(e.cast<String, dynamic>())).toList();
    }
    return [];
  }

  static Future<Map<String, dynamic>> claimSuspense(dynamic receiptId, Map<String, dynamic> data) =>
      ApiService.post('/fro/dashboard/suspense/$receiptId/claim', body: data).then(_map);

  static Future<List<Donor>> searchSuspenseDonors(String q) async {
    final r = await ApiService.get('/fro/suspense/donor-search?q=${Uri.encodeComponent(q)}');
    return _donorList(r);
  }

  static Future<Map<String, dynamic>> idleMe({required String from, required String to}) =>
      ApiService.get('/fro/reports/idle/me?from=$from&to=$to').then(_map);

  static Future<List<dynamic>> idleMeSessions(String date) async {
    final r = await ApiService.get('/fro/reports/idle/me/sessions?date=$date');
    if (r is List) return r;
    if (r is Map && r['sessions'] is List) return r['sessions'] as List;
    return [];
  }

  static Future<Map<String, dynamic>> leadIncentiveSummary(String date) =>
      ApiService.get('/incentive/lead/my-summary?date=$date').then(_map);

  static Future<List<Ticket>> myTickets() async {
    final r = await ApiService.get('/tickets/my');
    if (r is List) return r.whereType<Map>().map((e) => Ticket.fromJson(e.cast<String, dynamic>(), endpoint: '/tickets')).toList();
    return [];
  }

  static Future<List<Ticket>> myDeveloperTickets() async {
    final r = await ApiService.get('/developer-tickets/my');
    if (r is List) return r.whereType<Map>().map((e) => Ticket.fromJson(e.cast<String, dynamic>(), endpoint: '/developer-tickets')).toList();
    return [];
  }

  static Future<List<dynamic>> myAssets() async {
    try {
      final r = await ApiService.get('/assets/my-assigned');
      return r is List ? r : [];
    } catch (_) {
      return [];
    }
  }

  static Future<Ticket> raiseTicket(Map<String, dynamic> body, {bool developer = false}) async {
    final endpoint = developer ? '/developer-tickets' : '/tickets';
    final r = await ApiService.post(endpoint, body: body);
    final map = r is Map<String, dynamic> ? r : <String, dynamic>{};
    return Ticket.fromJson(map, endpoint: endpoint);
  }

  static Future<Ticket> ticketDetail(String endpoint, dynamic id) async {
    final r = await ApiService.get('$endpoint/$id');
    return Ticket.fromJson(r is Map ? r.cast<String, dynamic>() : <String, dynamic>{}, endpoint: endpoint);
  }

  static Future<void> replyTicket(String endpoint, dynamic id, String message) =>
      ApiService.post('$endpoint/$id/reply', body: {'message': message});

  static Future<List<dynamic>> ngoList() async {
    try {
      final r = await ApiService.get('/ngo-admin/ngos');
      if (r is List) return r;
      if (r is Map && r['ngos'] is List) return r['ngos'] as List;
      return [];
    } catch (_) {
      return [];
    }
  }
}
