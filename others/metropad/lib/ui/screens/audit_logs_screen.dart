import 'package:flutter/material.dart';

import '../../core/formatters.dart';
import '../../models/dashboard.dart';
import '../../services/admin_service.dart';
import '../widgets/data_table.dart';
import '../widgets/filter_bar.dart';
import 'paged_list_screen.dart';

class AuditLogsScreen extends StatelessWidget {
  const AuditLogsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return PagedListScreen<AuditLog>(
      slug: 'audit-logs',
      title: 'Audit Logs',
      subtitle: 'All system activity',
      filters: [
        const FilterDef(key: 'search', label: 'Logs', type: FilterType.search),
      ],
      fetch: (page, limit, filters) async {
        final params = <String, dynamic>{'page': page, 'limit': limit};
        final search = filters['search'];
        if (search != null && search.isNotEmpty) params['search'] = search;
        return AuditService.getAll(params: params);
      },
      columns: () => [
        TableColumn<AuditLog>('Date', cell: (c, l) => cellText(formatDateTimeStr(l.createdAt))),
        TableColumn<AuditLog>('User', cell: (c, l) => cellText(l.userName, bold: true)),
        TableColumn<AuditLog>('Action', cell: (c, l) => cellText(l.action)),
        TableColumn<AuditLog>('Entity', cell: (c, l) => cellText('${l.entity} #${l.entityId}')),
      ],
    );
  }
}