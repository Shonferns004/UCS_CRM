import '../../core/lucide_icons.dart';
import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_skeleton.dart';
import '../../core/widgets/beneficiary_tile.dart';
import '../../services/api_service.dart';
import 'beneficiary_detail_page.dart';

class BeneficiarySearchPage extends StatefulWidget {
  const BeneficiarySearchPage({super.key});

  @override
  State<BeneficiarySearchPage> createState() => _BeneficiarySearchPageState();
}

class _BeneficiarySearchPageState extends State<BeneficiarySearchPage> {
  final _searchController = TextEditingController();
  List<dynamic> _results = [];
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _search(String query) async {
    final q = query.trim();
    if (q.isEmpty) {
      setState(() {
        _results = [];
        _error = null;
      });
      return;
    }
    if (q.length < 2) return;

    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final result = await ApiService.get('/beneficiaries/search', queryParams: {'q': q});
      final list = result is List ? result : (result['data'] ?? result['results'] ?? []);
      if (!mounted) return;
      setState(() {
        _results = List<dynamic>.from(list);
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Find Beneficiary'),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: TextField(
              controller: _searchController,
              autofocus: true,
              textInputAction: TextInputAction.search,
              onSubmitted: _search,
              onChanged: (value) => _search(value),
              decoration: InputDecoration(
                hintText: 'Search by name, code or mobile',
                prefixIcon: const Icon(LucideIcons.search),
                suffixIcon: _searchController.text.isNotEmpty
                    ? IconButton(
                        icon: const Icon(LucideIcons.x),
                        onPressed: () {
                          _searchController.clear();
                          _search('');
                        },
                      )
                    : null,
              ),
            ),
          ),
          Expanded(child: _buildBody()),
        ],
      ),
    );
  }

Widget _buildBody() {
    if (_loading) {
      return const SkeletonList();
    }
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(_error!, textAlign: TextAlign.center, style: const TextStyle(color: AppTheme.error, fontSize: 14)),
        ),
      );
    }
    if (_results.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(LucideIcons.search, size: 48, color: AppTheme.textSecondary.withAlpha(120)),
            const SizedBox(height: 12),
            const Text('No beneficiaries found', style: TextStyle(fontSize: 15, color: AppTheme.textSecondary)),
          ],
        ),
      );
    }
    return RefreshIndicator(
      onRefresh: () => _search(_searchController.text),
      child: ListView.separated(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        itemCount: _results.length,
        separatorBuilder: (_, _) => const SizedBox(height: 8),
        itemBuilder: (context, index) {
          final b = _results[index];
          return _BeneficiaryCard(beneficiary: b);
        },
      ),
    );
  }
}

class _BeneficiaryCard extends StatelessWidget {
  final Map<String, dynamic> beneficiary;
  const _BeneficiaryCard({required this.beneficiary});

@override
  Widget build(BuildContext context) {
    final name = beneficiary['full_name'] ?? 'Unknown';
    final code = beneficiary['beneficiary_code'] ?? '';
    final mobile = beneficiary['mobile'] ?? '';
    final city = beneficiary['city'] ?? '';

    return BeneficiaryTile(
      name: name,
      code: code,
      subtitle: [mobile, city].where((e) => e.isNotEmpty).join(' • '),
      onTap: () => Navigator.push(
        context,
        MaterialPageRoute(builder: (_) => BeneficiaryDetailPage(beneficiary: beneficiary)),
      ),
    );
  }
}

