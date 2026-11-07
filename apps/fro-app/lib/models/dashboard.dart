/// Typed models for the FRO dashboard / target payloads.
/// Mirrors the mapping in the web panel's `Dashboard.jsx`.
library;

num _num(dynamic v, [num fallback = 0]) => v is num ? v : fallback;
String? _str(dynamic v) => v?.toString();

class AkiDay {
  final String date;
  final num aki;
  final num collection;
  const AkiDay({required this.date, required this.aki, this.collection = 0});

  factory AkiDay.fromJson(Map<String, dynamic> j) => AkiDay(
        date: _str(j['date']) ?? '',
        aki: _num(j['aki']),
        collection: _num(j['collection']),
      );
}

class CollectedByNgo {
  final String? ngoId;
  final String? ngoName;
  final num amount;
  const CollectedByNgo({this.ngoId, this.ngoName, this.amount = 0});

  factory CollectedByNgo.fromJson(Map<String, dynamic> j) => CollectedByNgo(
        ngoId: _str(j['ngo_id']),
        ngoName: _str(j['ngo_name']),
        amount: _num(j['amount']),
      );
}

class AssignedByNgo {
  final String? ngoId;
  final String? ngoName;
  final num count;
  const AssignedByNgo({this.ngoId, this.ngoName, this.count = 0});

  factory AssignedByNgo.fromJson(Map<String, dynamic> j) => AssignedByNgo(
        ngoId: _str(j['ngo_id']),
        ngoName: _str(j['ngo_name']),
        count: _num(j['count']),
      );
}

class AssignedByStation {
  final String? station;
  final num count;
  const AssignedByStation({this.station, this.count = 0});

  factory AssignedByStation.fromJson(Map<String, dynamic> j) => AssignedByStation(
        station: _str(j['station']),
        count: _num(j['count']),
      );
}

class DashboardData {
  final bool? isActive;
  final bool? isPunchedIn;
  final num dataUsed;
  final num statsTotal;
  final num dailyConnected;
  final num monthlyConnected;
  final num statsContacted;
  final num dailyDonations;
  final num dailyDonorCount;
  final num monthlyDonorCount;
  final num activeDonors;
  final num inactiveDonors;
  final num verifiedTodayCount;
  final num verifiedTodayAmount;
  final num verifiedMonthCount;
  final List<AssignedByNgo> byNgo;
  final List<AssignedByStation> byStation;

  const DashboardData({
    this.isActive,
    this.isPunchedIn,
    this.dataUsed = 0,
    this.statsTotal = 0,
    this.dailyConnected = 0,
    this.monthlyConnected = 0,
    this.statsContacted = 0,
    this.dailyDonations = 0,
    this.dailyDonorCount = 0,
    this.monthlyDonorCount = 0,
    this.activeDonors = 0,
    this.inactiveDonors = 0,
    this.verifiedTodayCount = 0,
    this.verifiedTodayAmount = 0,
    this.verifiedMonthCount = 0,
    this.byNgo = const [],
    this.byStation = const [],
  });

  factory DashboardData.fromJson(Map<String, dynamic> raw) {
    Map<String, dynamic> m(dynamic v) =>
        v is Map<String, dynamic> ? v : <String, dynamic>{};
    final worker = m(raw['worker']);
    final connected = m(raw['connected']);
    final donations = m(raw['donations']);
    final data = m(raw['data']);
    final donors = m(raw['donors']);
    final verification = m(raw['verification']);
    final vToday = m(verification['today']);
    final vTodayVerified = m(vToday['verified']);
    final vMonth = m(verification['month']);
    final vMonthVerified = m(vMonth['verified']);
    final stats = m(raw['stats']);
    final assigned = m(raw['assignedData']);

    List<AssignedByNgo> byNgo = const [];
    final ngoRaw = assigned['byNgo'];
    if (ngoRaw is List) {
      byNgo = ngoRaw
          .whereType<Map>()
          .map((e) => AssignedByNgo.fromJson(e.cast<String, dynamic>()))
          .toList();
    }
    List<AssignedByStation> byStation = const [];
    final stRaw = assigned['byStation'];
    if (stRaw is List) {
      byStation = stRaw
          .whereType<Map>()
          .map((e) => AssignedByStation.fromJson(e.cast<String, dynamic>()))
          .toList();
    }

    return DashboardData(
      isActive: worker['is_active'] is bool ? worker['is_active'] as bool : null,
      isPunchedIn:
          worker['is_punched_in'] is bool ? worker['is_punched_in'] as bool : null,
      dataUsed: _num(data['used']),
      statsTotal: _num(stats['total']),
      dailyConnected: _num(connected['daily']),
      monthlyConnected: _num(connected['monthly']),
      statsContacted: _num(stats['contacted']),
      dailyDonations: _num(donations['daily']),
      dailyDonorCount: _num(donations['daily_donors']),
      monthlyDonorCount: _num(donations['monthly_donors']),
      activeDonors: _num(donors['active']),
      inactiveDonors: _num(donors['inactive']),
      verifiedTodayCount: _num(vTodayVerified['count']),
      verifiedTodayAmount: _num(vTodayVerified['amount']),
      verifiedMonthCount: _num(vMonthVerified['count']),
      byNgo: byNgo,
      byStation: byStation,
    );
  }
}

class TargetData {
  final num target;
  final num collected;
  final num remaining;
  final num collectedHighTier;
  final String? targetSource;
  final String? targetSourceMonth;
  final String? month;
  final num totalCollectionAki;
  final List<AkiDay> akiPerDay;
  final List<CollectedByNgo> collectedByNgo;
  final Map<String, dynamic> stats;

  const TargetData({
    this.target = 0,
    this.collected = 0,
    this.remaining = 0,
    this.collectedHighTier = 0,
    this.targetSource,
    this.targetSourceMonth,
    this.month,
    this.totalCollectionAki = 0,
    this.akiPerDay = const [],
    this.collectedByNgo = const [],
    this.stats = const {},
  });

  factory TargetData.fromJson(Map<String, dynamic> raw) {
    final incentive = raw['incentive'] is Map<String, dynamic>
        ? raw['incentive'] as Map<String, dynamic>
        : <String, dynamic>{};

    List<AkiDay> aki = const [];
    final akiRaw = incentive['akiPerDay'];
    if (akiRaw is List) {
      aki = akiRaw
          .whereType<Map>()
          .map((e) => AkiDay.fromJson(e.cast<String, dynamic>()))
          .toList();
    }

    List<CollectedByNgo> byNgo = const [];
    final ngoRaw = raw['collected_by_ngo'];
    if (ngoRaw is List) {
      byNgo = ngoRaw
          .whereType<Map>()
          .map((e) => CollectedByNgo.fromJson(e.cast<String, dynamic>()))
          .toList();
    }

    final stats = raw['stats'] is Map<String, dynamic>
        ? raw['stats'] as Map<String, dynamic>
        : <String, dynamic>{};

    return TargetData(
      target: _num(raw['target']),
      collected: _num(raw['collected']),
      remaining: _num(raw['remaining']),
      collectedHighTier: _num(raw['collected_high_tier']),
      targetSource: _str(raw['target_source']),
      targetSourceMonth: _str(raw['target_source_month']),
      month: _str(raw['month']),
      totalCollectionAki: _num(incentive['totalCollectionAKI']),
      akiPerDay: aki,
      collectedByNgo: byNgo,
      stats: stats,
    );
  }
}

/// A single donor row in the active/inactive/total split modal.
class FroDonorSplitItem {
  final dynamic donorId;
  final String? donorName;
  final String? donorMobile;
  const FroDonorSplitItem({this.donorId, this.donorName, this.donorMobile});

  factory FroDonorSplitItem.fromJson(Map<String, dynamic> j) => FroDonorSplitItem(
        donorId: j['donor_id'] ?? j['id'],
        donorName: _str(j['donor_name'] ?? j['name']),
        donorMobile: _str(j['donor_mobile'] ?? j['mobile']),
      );
}
