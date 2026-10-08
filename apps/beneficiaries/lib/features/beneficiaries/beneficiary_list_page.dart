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
import 'package:flutter/services.dart';

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
  bool _loading = false;
  bool _loadingMore = false;
  String _query = '';
  String? _error;
  Map<String, int> _programCounts = {};
  bool get _hasMore => _members.length < _total;
  bool get _searched => _query.length == 10;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
    _loadProgramCounts();
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
    _debounce?.cancel();
    final q = value.trim();
    setState(() {
      _query = q;
      if (q.length != 10) {
        // 10 digit poore nahi -> list khali, koi request nahi
        _members.clear();
        _total = 0;
        _error = null;
        _loading = false;
      }
    });
    if (q.length == 10) {
      _debounce = Timer(const Duration(milliseconds: 250), () {
        if (!mounted) return;
        _load();
      });
    }
  }

  void _clearSearch() {
    _debounce?.cancel();
    _searchController.clear();
    setState(() {
      _query = '';
      _members.clear();
      _total = 0;
      _error = null;
      _loading = false;
    });
  }

  // Pull-to-refresh: sirf tab list reload jab number search kiya ho
  Future<void> _refresh() async {
    await _loadProgramCounts();
    if (_searched) await _load();
  }

  Future<void> _loadProgramCounts() async {
    try {
      final data = await ApiService.get('/operator/kits');
      final list = (data['programs'] as List?) ?? const [];
      final counts = <String, int>{};
      for (final p in list) {
        final code = (p['code']?.toString() ?? '').toUpperCase();
        final v = p['registered'];
        counts[code] = v is num ? v.toInt() : 0;
      }
      if (!mounted) return;
      setState(() => _programCounts = counts);
    } catch (_) {
      // Cards 0 dikhayenge, list phir bhi kaam karegi.
    }
  }

  Widget _programCards() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 12, 24, 0),
      child: Row(
        children: [
          Expanded(
            child: _programCard(
              'BSCT',
              AppColors.statMembersBg,
              AppColors.statMembersBorder,
              AppColors.primaryBlue,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: _programCard(
              'AFLF',
              AppColors.statDonationsBg,
              AppColors.statDonationsBorder,
              AppColors.successGreen,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: _programCard(
              'MANN',
              AppColors.statPinkBg,
              AppColors.statPinkBorder,
              AppColors.statPinkText,
            ),
          ),
        ],
      ),
    );
  }

  Widget _programCard(String code, Color bg, Color border, Color accent) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 16),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: border),
      ),
      child: Column(
        children: [
          Text(
            '${_programCounts[code] ?? 0}',
            style: TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.w700,
              color: accent,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            code,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontSize: 12.5,
              fontWeight: FontWeight.w600,
              color: AppColors.textPrimary,
            ),
          ),
        ],
      ),
    );
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
    final q = _query; // is request ka number yaad rakho
    try {
      final result = await ApiService.get(
        '/beneficiaries',
        queryParams: {
          'page': '$_page',
          'pageSize': '$_pageSize',
          if (q.isNotEmpty) 'search': q,
        },
      );
      if (!mounted || q != _query) return; // number badal gaya ya clear hua
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
      MaterialPageRoute(builder: (_) => EditBeneficiaryPage(beneficiary: full)),
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
          _programCards(),
          _searchField(),
          _resultBar(),
          Expanded(
            child: RefreshIndicator(onRefresh: _refresh, child: _body()),
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
        keyboardType: TextInputType.number,
        inputFormatters: [
          FilteringTextInputFormatter.digitsOnly,
          LengthLimitingTextInputFormatter(10),
        ],
        decoration: InputDecoration(
          hintText: 'Enter 10-digit mobile number',
          prefixIcon: const Icon(LucideIcons.search, size: 20),
          suffixIcon: _searchController.text.isEmpty
              ? null
              : IconButton(
                  onPressed: _clearSearch,
                  icon: const Icon(LucideIcons.x, size: 18),
                  tooltip: 'Clear',
                ),
          isDense: true,
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 12,
            vertical: 14,
          ),
        ),
      ),
    );
  }

  Widget _resultBar() {
    if (_loading || !_searched) return const SizedBox(height: 8);
    final label = _total == 1
        ? '1 beneficiary found'
        : '$_total beneficiaries found';
    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 0, 24, 10),
      child: Align(
        alignment: Alignment.centerLeft,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
          decoration: BoxDecoration(
            color: AppColors.primaryBlueSoft,
            borderRadius: BorderRadius.circular(20),
          ),
          child: Text(
            label,
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: AppColors.primaryBlue,
            ),
          ),
        ),
      ),
    );
  }

  Widget _body() {
    if (!_searched) return _searchPrompt();
    if (_loading) {
      return ListView(
        padding: const EdgeInsets.fromLTRB(24, 4, 24, 24),
        physics: const AlwaysScrollableScrollPhysics(),
        children: const [SkeletonCardRows(rows: 8)],
      );
    }

    if (_error != null) {
      return ListView(
        padding: const EdgeInsets.all(24),
        physics: const AlwaysScrollableScrollPhysics(),
        children: [const SizedBox(height: 40), _errorTile()],
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
            title: 'No matches',
            message: 'No beneficiary found with number "$_query".',
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
              child: SkeletonBox(width: 120, height: 12, borderRadius: 6),
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

  // Number likhne se pehle ka khali screen
  Widget _searchPrompt() {
    final typed = _query.length;
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(32, 56, 32, 24),
      children: [
        Center(
          child: Container(
            width: 96,
            height: 96,
            decoration: const BoxDecoration(
              color: AppColors.primaryBlueSoft,
              shape: BoxShape.circle,
            ),
            child: const Icon(
              LucideIcons.search,
              size: 40,
              color: AppColors.primaryBlue,
            ),
          ),
        ),
        const SizedBox(height: 24),
        const Text(
          'Find a beneficiary',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w700,
            color: AppColors.textPrimary,
          ),
        ),
        const SizedBox(height: 8),
        const Text(
          'Enter the 10-digit mobile number to see\nthe beneficiary details.',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 13.5,
            height: 1.5,
            color: AppColors.textSecondary,
          ),
        ),
        const SizedBox(height: 20),
        Center(
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
            decoration: BoxDecoration(
              color: typed == 0
                  ? AppColors.surfaceSoft
                  : AppColors.primaryBlueSoft,
              borderRadius: BorderRadius.circular(20),
            ),
            child: Text(
              '$typed / 10 digits',
              style: TextStyle(
                fontSize: 12.5,
                fontWeight: FontWeight.w600,
                color: typed == 0
                    ? AppColors.textSecondary
                    : AppColors.primaryBlue,
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _pill(String text, Color bg, Color fg, {IconData? icon}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 12, color: fg),
            const SizedBox(width: 4),
          ],
          Text(
            text,
            style: TextStyle(
              fontSize: 11.5,
              fontWeight: FontWeight.w600,
              color: fg,
            ),
          ),
        ],
      ),
    );
  }

  Widget _memberCard(Map<String, dynamic> m) {
    final name = m['full_name']?.toString().trim();
    final displayName = (name == null || name.isEmpty)
        ? 'Name not filled'
        : name;
    final mobile = m['mobile']?.toString().trim() ?? '';
    final code = m['beneficiary_code']?.toString().trim() ?? '';
    final ngo = m['ngos'] is Map ? (m['ngos']['name']?.toString() ?? '') : '';
    final photo = m['photo']?.toString();

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
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: () => _open(m),
          borderRadius: AppTheme.radiusCard,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    CircleAvatar(
                      radius: 28,
                      backgroundColor: AppColors.primaryBlueSoft,
                      backgroundImage: avatar,
                      child: avatar != null
                          ? null
                          : Text(
                              displayName[0].toUpperCase(),
                              style: const TextStyle(
                                fontSize: 20,
                                fontWeight: FontWeight.w700,
                                color: AppColors.primaryBlue,
                              ),
                            ),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            displayName,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w700,
                              color: AppColors.textPrimary,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Row(
                            children: [
                              const Icon(
                                LucideIcons.phone,
                                size: 13,
                                color: AppColors.textSecondary,
                              ),
                              const SizedBox(width: 5),
                              Text(
                                mobile.isEmpty ? 'No number' : mobile,
                                style: const TextStyle(
                                  fontSize: 13,
                                  color: AppColors.textSecondary,
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    const Icon(
                      LucideIcons.chevronRight,
                      size: 20,
                      color: AppColors.textTertiary,
                    ),
                  ],
                ),
                if (code.isNotEmpty || ngo.isNotEmpty) ...[
                  const SizedBox(height: 14),
                  const Divider(height: 1),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      if (code.isNotEmpty)
                        _pill(
                          code,
                          AppColors.surfaceSoft,
                          AppColors.textSecondary,
                        ),
                      if (ngo.isNotEmpty)
                        _pill(
                          ngo,
                          AppColors.primaryBlueSoft,
                          AppColors.primaryBlue,
                        ),
                    ],
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
