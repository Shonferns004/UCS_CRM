import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/lucide_icons.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_skeleton.dart';
import '../../core/widgets/app_snackbar.dart';
import '../../core/widgets/empty_state.dart';
import '../../core/utils/photo_utils.dart';
import '../../services/api_service.dart';
import 'edit_beneficiary_page.dart';

/// Full member list reached from the Kits "Total" card. Lists name + mobile
/// number, searchable by either, and opens the registration-style form for the
/// chosen member so any field the import left blank can be filled in.
class BeneficiaryListPage extends StatefulWidget {
  final String title;

  const BeneficiaryListPage({super.key, this.title = 'Beneficiaries'});

  @override
  State<BeneficiaryListPage> createState() => _BeneficiaryListPageState();
}

class _BeneficiaryListPageState extends State<BeneficiaryListPage> {
  static const int _pageSize = 50;

  final _searchController = TextEditingController();
  final _scrollController = ScrollController();

  final List<Map<String, dynamic>> _members = [];
  Timer? _debounce;
  int _page = 1;
  int _total = 0;
  bool _loading = true;
  bool _loadingMore = false;
  String _query = '';
  String? _error;

  bool get _hasMore => _members.length < _total;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
    _load();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _searchController.dispose();
    _scrollController.removeListener(_onScroll);
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scrollController.position.pixels >=
        _scrollController.position.maxScrollExtent - 320) {
      _loadMore();
    }
  }

  void _onSearchChanged(String value) {
    // Debounce so a 10-digit number typed one key at a time is one request.
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      if (!mounted) return;
      setState(() => _query = value.trim());
      _load();
    });
  }

  void _clearSearch() {
    _debounce?.cancel();
    _searchController.clear();
    setState(() => _query = '');
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
      _page = 1;
      _members.clear();
    });
    await _fetch();
  }

  Future<void> _loadMore() async {
    if (_loading || _loadingMore || !_hasMore) return;
    setState(() => _loadingMore = true);
    _page += 1;
    await _fetch(append: true);
  }

  Future<void> _fetch({bool append = false}) async {
    try {
      final result = await ApiService.get(
        '/beneficiaries',
        queryParams: {
          'page': '$_page',
          'pageSize': '$_pageSize',
          if (_query.isNotEmpty) 'search': _query,
        },
      );
      if (!mounted) return;
      final rows = (result['data'] as List?) ?? const [];
      setState(() {
        _total = (result['total'] as num?)?.toInt() ?? 0;
        if (append) {
          _members.addAll(rows.map((e) => Map<String, dynamic>.from(e)));
        } else {
          _members
            ..clear()
            ..addAll(rows.map((e) => Map<String, dynamic>.from(e)));
        }
        _loading = false;
        _loadingMore = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
        _loading = false;
        _loadingMore = false;
      });
    }
  }

  Future<void> _open(Map<String, dynamic> member) async {
    // The list only carries summary columns, so pull the full record first —
    // the form needs every field the import captured, including the ones the
    // list does not show.
    final id = member['id'];
    if (id == null) return;
    showAppSnackbar(context, 'Loading ${member['full_name'] ?? 'member'}…');
    Map<String, dynamic> full;
    try {
      full = await ApiService.get('/beneficiaries/$id');
    } catch (e) {
      if (!mounted) return;
      showAppSnackbar(
        context,
        e.toString().replaceFirst('Exception: ', ''),
        error: true,
      );
      return;
    }
    if (!mounted) return;
    final updated = await Navigator.of(context).push<Map<String, dynamic>>(
      MaterialPageRoute(
        builder: (_) => EditBeneficiaryPage(beneficiary: full),
      ),
    );
    if (!mounted) return;
    if (updated != null) {
      // Reflect the edit without a full reload.
      final i = _members.indexWhere((m) => m['id'] == updated['id']);
      if (i != -1) {
        setState(() => _members[i] = {..._members[i], ...updated});
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(title: Text(widget.title)),
      body: Column(
        children: [
          _searchField(),
          _resultBar(),
          Expanded(
            child: RefreshIndicator(
              onRefresh: _load,
              child: _body(),
            ),
          ),
        ],
      ),
    );
  }

  Widget _searchField() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 12, 24, 8),
      child: TextField(
        controller: _searchController,
        onChanged: _onSearchChanged,
        textInputAction: TextInputAction.search,
        keyboardType: TextInputType.text,
        decoration: InputDecoration(
          hintText: 'Search by name or number',
          prefixIcon: const Icon(LucideIcons.search, size: 20),
          suffixIcon: _searchController.text.isEmpty
              ? null
              : IconButton(
                  onPressed: _clearSearch,
                  icon: const Icon(LucideIcons.x, size: 18),
                  tooltip: 'Clear',
                ),
          isDense: true,
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
        ),
      ),
    );
  }

  Widget _resultBar() {
    if (_loading) return const SizedBox(height: 8);
    final label = _query.isEmpty
        ? '$_total member${_total == 1 ? '' : 's'}'
        : '$_total match${_total == 1 ? '' : 'es'} for "$_query"';
    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 0, 24, 8),
      child: Align(
        alignment: Alignment.centerLeft,
        child: Text(
          label,
          style: const TextStyle(
            fontSize: 12.5,
            fontWeight: FontWeight.w600,
            color: AppColors.textSecondary,
          ),
        ),
      ),
    );
  }

  Widget _body() {
    if (_loading) {
      return ListView(
        padding: const EdgeInsets.fromLTRB(24, 4, 24, 24),
        physics: const AlwaysScrollableScrollPhysics(),
        children: const [
          SkeletonCardRows(rows: 8),
        ],
      );
    }

    if (_error != null) {
      return ListView(
        padding: const EdgeInsets.all(24),
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          const SizedBox(height: 40),
          _errorTile(),
        ],
      );
    }

    if (_members.isEmpty) {
      return ListView(
        padding: const EdgeInsets.all(24),
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          const SizedBox(height: 40),
          EmptyState(
            icon: LucideIcons.userCircle,
            title: _query.isEmpty ? 'No members yet' : 'No matches',
            message: _query.isEmpty
                ? 'Imported members will appear here.'
                : 'Nothing matches "$_query". Try a different name or number.',
            dashed: true,
          ),
        ],
      );
    }

    return ListView.separated(
      controller: _scrollController,
      padding: const EdgeInsets.fromLTRB(24, 4, 24, 24),
      itemCount: _members.length + (_hasMore ? 1 : 0),
      separatorBuilder: (_, _) => const SizedBox(height: 10),
      itemBuilder: (context, i) {
        if (i >= _members.length) {
          return const Padding(
            padding: EdgeInsets.symmetric(vertical: 18),
            child: Center(
              child: SkeletonBox(
                width: 120,
                height: 12,
                borderRadius: 6,
              ),
            ),
          );
        }
        return _memberCard(_members[i]);
      },
    );
  }

  Widget _errorTile() {
    return Column(
      children: [
        const Icon(LucideIcons.alertCircle, color: AppColors.error, size: 22),
        const SizedBox(height: 10),
        Text(
          _error!,
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 13, color: AppColors.textSecondary),
        ),
        const SizedBox(height: 12),
        OutlinedButton.icon(
          onPressed: _load,
          icon: const Icon(LucideIcons.refreshCw, size: 18),
          label: const Text('Retry'),
        ),
      ],
    );
  }

  Widget _memberCard(Map<String, dynamic> m) {
    final name = m['full_name']?.toString().trim();
    final displayName = (name == null || name.isEmpty) ? 'Name not filled' : name;
    final mobile = m['mobile']?.toString().trim();
    final code = m['beneficiary_code']?.toString().trim();
    final ngo = m['ngos'] is Map ? (m['ngos']['name']?.toString() ?? '') : '';
    final photo = m['photo']?.toString();

    // Photos are either an inline data URL (captured in the app) or a remote
    // URL (imported records).
    final ImageProvider? avatar = isInlinePhoto(photo)
        ? MemoryImage(dataUrlBytes(photo!))
        : isRemotePhoto(photo)
            ? NetworkImage(photo!)
            : null;

    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: AppTheme.radiusCard,
        boxShadow: AppTheme.cardShadow,
      ),
      child: InkWell(
        onTap: () => _open(m),
        borderRadius: AppTheme.radiusCard,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              CircleAvatar(
                radius: 22,
                backgroundColor: AppColors.primaryBlueSoft,
                backgroundImage: avatar,
                child: avatar != null
                    ? null
                    : Text(
                        displayName.isNotEmpty
                            ? displayName[0].toUpperCase()
                            : '?',
                        style: const TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.w700,
                          color: AppColors.primaryBlue,
                        ),
                      ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      displayName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 14.5,
                        fontWeight: FontWeight.w600,
                        color: AppColors.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 3),
                    // The number the operator searches by, and the record code.
                    Text(
                      [
                        if (mobile != null && mobile.isNotEmpty) mobile,
                        if (code != null && code.isNotEmpty) code,
                      ].join(' · '),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 12.5,
                        color: AppColors.textSecondary,
                      ),
                    ),
                    if (ngo.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(
                        ngo,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w500,
                          color: AppColors.primaryBlue,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              const Icon(
                LucideIcons.chevronRight,
                size: 18,
                color: AppColors.textTertiary,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
