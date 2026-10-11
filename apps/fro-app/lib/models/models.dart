class Donor {
  final dynamic id;
  final String? ngoId;
  final String? donorName;
  final String? donorMobile;
  final String? donorMobileAlt;
  final String? donorCity;
  final String? donorAddress;
  final String? donorPan;
  final String? donorEmail;
  final String? donorDob;
  final String? status;
  final String? donorType;
  final String? station;
  final num? amountCollected;
  final String? lastDisposition;
  final String? lastDispositionAt;
  final String? suppressReason;
  final bool isPending;
  final Map<String, dynamic> raw;

  Donor({
    required this.id,
    this.ngoId,
    this.donorName,
    this.donorMobile,
    this.donorMobileAlt,
    this.donorCity,
    this.donorAddress,
    this.donorPan,
    this.donorEmail,
    this.donorDob,
    this.status,
    this.donorType,
    this.station,
    this.amountCollected,
    this.lastDisposition,
    this.lastDispositionAt,
    this.suppressReason,
    this.isPending = false,
    required this.raw,
  });

  factory Donor.fromJson(Map<String, dynamic> json) {
    String pick(String a, [String? b]) {
      final v = json[a] ?? (b != null ? json[b] : null);
      return v?.toString() ?? '';
    }

    final status = pick('status');
    final pendingSet = {
      'pending', 'new', '', 'scheduled', 'callback', 'promise_to_pay',
      'payment_pending', 'follow_up',
    };
    return Donor(
      id: json['id'] ?? json['donor_id'] ?? json['donorId'],
      ngoId: pick('ngo_id').isEmpty ? null : pick('ngo_id'),
      donorName: pick('donor_name', 'name').isEmpty ? null : pick('donor_name', 'name'),
      donorMobile: pick('donor_mobile', 'mobile').isEmpty ? null : pick('donor_mobile', 'mobile'),
      donorMobileAlt: pick('donor_mobile_alt', 'mobile_alt').isEmpty ? null : pick('donor_mobile_alt', 'mobile_alt'),
      donorCity: pick('donor_city', 'city').isEmpty ? null : pick('donor_city', 'city'),
      donorAddress: pick('donor_address', 'address').isEmpty ? null : pick('donor_address', 'address'),
      donorPan: pick('donor_pan', 'pan').isEmpty ? null : pick('donor_pan', 'pan'),
      donorEmail: pick('donor_email', 'email').isEmpty ? null : pick('donor_email', 'email'),
      donorDob: pick('donor_dob', 'dob').isEmpty ? null : pick('donor_dob', 'dob'),
      status: status.isEmpty ? null : status,
      donorType: pick('donor_type').isEmpty ? null : pick('donor_type'),
      station: pick('station').isEmpty ? null : pick('station'),
      amountCollected: json['amount_collected'] is num
          ? json['amount_collected'] as num
          : (json['amount'] is num ? json['amount'] as num : null),
      lastDisposition: pick('last_disposition').isEmpty ? null : pick('last_disposition'),
      lastDispositionAt: pick('last_disposition_at').isEmpty ? null : pick('last_disposition_at'),
      suppressReason: pick('suppress_reason').isEmpty ? null : pick('suppress_reason'),
      isPending: pendingSet.contains(status),
      raw: json,
    );
  }
}

class DonorLog {
  final dynamic id;
  final String? action;
  final String? dispositionCategory;
  final String? dispositionDetail;
  final String? notes;
  final num? amountCollected;
  final String? scheduledAt;
  final String? createdAt;
  final String? accountsStatus;
  final Map<String, dynamic> raw;

  DonorLog({
    this.id,
    this.action,
    this.dispositionCategory,
    this.dispositionDetail,
    this.notes,
    this.amountCollected,
    this.scheduledAt,
    this.createdAt,
    this.accountsStatus,
    required this.raw,
  });

  factory DonorLog.fromJson(Map<String, dynamic> json) => DonorLog(
        id: json['id'],
        action: json['action']?.toString(),
        dispositionCategory: json['disposition_category']?.toString(),
        dispositionDetail: json['disposition_detail']?.toString(),
        notes: json['notes']?.toString(),
        amountCollected: json['amount_collected'] is num
            ? json['amount_collected'] as num
            : null,
        scheduledAt: json['scheduled_at']?.toString(),
        createdAt: (json['created_at'] ?? json['createdAt'])?.toString(),
        accountsStatus: json['accounts_status']?.toString(),
        raw: json,
      );
}

class Performance {
  final int? rank;
  final int? workedSeconds;
  final int? todayCalls;
  final int? idleSeconds;
  final num? performance;
  final bool? isIdle;
  final String? level;
  final String? workerName;

  Performance({
    this.rank,
    this.workedSeconds,
    this.todayCalls,
    this.idleSeconds,
    this.performance,
    this.isIdle,
    this.level,
    this.workerName,
  });

  factory Performance.fromJson(Map<String, dynamic> json) => Performance(
        rank: json['rank'] is num ? (json['rank'] as num).toInt() : null,
        workedSeconds: json['worked_seconds'] is num
            ? (json['worked_seconds'] as num).toInt()
            : null,
        todayCalls: json['today_calls'] is num
            ? (json['today_calls'] as num).toInt()
            : null,
        idleSeconds: json['idle_seconds'] is num
            ? (json['idle_seconds'] as num).toInt()
            : null,
        performance: json['performance'] is num ? json['performance'] as num : null,
        isIdle: json['is_idle'] is bool ? json['is_idle'] as bool : null,
        level: json['level']?.toString(),
        workerName: (json['worker'] is Map ? json['worker']['name'] : null)?.toString(),
      );
}

class SuspenseReceipt {
  final dynamic id;
  final String? entryId;
  final String? amount;
  final String? date;
  final String? time;
  final String? upiRef;
  final String? donorName;
  final String? donorMobile;
  final String? notes;
  final String? claimedBy;
  final Map<String, dynamic> raw;

  SuspenseReceipt({
    this.id,
    this.entryId,
    this.amount,
    this.date,
    this.time,
    this.upiRef,
    this.donorName,
    this.donorMobile,
    this.notes,
    this.claimedBy,
    required this.raw,
  });

  factory SuspenseReceipt.fromJson(Map<String, dynamic> json) {
    String pick(String a, [String? b]) =>
        (json[a] ?? (b != null ? json[b] : null))?.toString() ?? '';
    return SuspenseReceipt(
      id: json['id'] ?? json['entry_id'],
      entryId: pick('entry_id').isEmpty ? null : pick('entry_id'),
      amount: pick('amount'),
      date: pick('date', 'txn_date'),
      time: pick('time', 'txn_time'),
      upiRef: pick('upi_ref', 'upi_transaction_id'),
      donorName: pick('donor_name'),
      donorMobile: pick('donor_mobile'),
      notes: pick('notes'),
      claimedBy: pick('claimed_by'),
      raw: json,
    );
  }
}

class Ticket {
  final dynamic id;
  final String? subject;
  final String? description;
  final String? category;
  final String? status;
  final String? priority;
  final String? department;
  final String? createdAt;
  final String? endpoint;
  final Map<String, dynamic> raw;

  Ticket({
    this.id,
    this.subject,
    this.description,
    this.category,
    this.status,
    this.priority,
    this.department,
    this.createdAt,
    this.endpoint,
    required this.raw,
  });

  factory Ticket.fromJson(Map<String, dynamic> json, {String? endpoint}) =>
      Ticket(
        id: json['id'],
        subject: json['subject']?.toString(),
        description: json['description']?.toString(),
        category: json['category']?.toString(),
        status: json['status']?.toString(),
        priority: json['priority']?.toString(),
        department: json['department']?.toString(),
        createdAt: (json['created_at'] ?? json['createdAt'])?.toString(),
        endpoint: endpoint,
        raw: json,
      );
}

class IdleDay {
  final String? date;
  final int? idleSeconds;
  final int? workedSeconds;
  final Map<String, dynamic> raw;

  IdleDay({this.date, this.idleSeconds, this.workedSeconds, required this.raw});

  factory IdleDay.fromJson(Map<String, dynamic> json) => IdleDay(
        date: (json['date'] ?? json['day'] ?? '').toString(),
        idleSeconds: json['idle_seconds'] is num
            ? (json['idle_seconds'] as num).toInt()
            : null,
        workedSeconds: json['worked_seconds'] is num
            ? (json['worked_seconds'] as num).toInt()
            : null,
        raw: json,
      );
}

class LeadIncentiveSummary {
  final num? total;
  final int? leads;
  final Map<String, dynamic> raw;

  LeadIncentiveSummary({this.total, this.leads, required this.raw});

  factory LeadIncentiveSummary.fromJson(Map<String, dynamic> json) =>
      LeadIncentiveSummary(
        total: json['total'] is num
            ? json['total'] as num
            : (json['incentive'] is num ? json['incentive'] as num : null),
        leads: json['leads'] is num ? (json['leads'] as num).toInt() : null,
        raw: json,
      );
}
