import 'package:flutter/material.dart';
import '../services/api_service.dart';
import 'login_page.dart';
import 'punch_page.dart';

class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  final _searchCtrl = TextEditingController();
  List<dynamic> _workers = [];
  List<dynamic> _filtered = [];
  Map<String, dynamic> _todayMap = {};
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final workers = await ApiService.getAllWorkers();
      final todayRaw = await ApiService.getTodayAll();
      final todayList = todayRaw is List ? todayRaw : <dynamic>[];
      final todayMap = <String, dynamic>{};
      for (final r in todayList) {
        if (r is Map<String, dynamic> && r['worker_id'] != null) {
          todayMap[r['worker_id'].toString()] = r;
        }
      }
      setState(() {
        _workers = workers;
        _filtered = workers;
        _todayMap = todayMap;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  void _onSearch(String q) {
    final term = q.trim().toLowerCase();
    setState(() {
      if (term.isEmpty) {
        _filtered = _workers;
      } else {
        _filtered = _workers.where((w) {
          final name = (w['name'] ?? '').toString().toLowerCase();
          final loginId = (w['login_id'] ?? '').toString().toLowerCase();
          final phone = (w['phone'] ?? '').toString().toLowerCase();
          return name.contains(term) || loginId.contains(term) || phone.contains(term);
        }).toList();
      }
    });
  }

  Future<void> _logout() async {
    await ApiService.clearToken();
    if (!mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const LoginPage()),
      (route) => false,
    );
  }

  void _openWorker(Map<String, dynamic> worker) {
    final id = (worker['id'] ?? '').toString();
    final record = _todayMap[id];
    final punchIn = record?['punch_in_time'] as String?;
    final punchOut = record?['punch_out_time'] as String?;

    final String action;
    if (punchIn == null) {
      action = 'punch_in';
    } else if (punchOut == null) {
      action = 'punch_out';
    } else {
      action = 'done';
    }

    Navigator.of(context)
        .push(MaterialPageRoute(
          builder: (_) => PunchPage(worker: worker, action: action),
        ))
        .then((_) => _load());
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(
        title: const Text('HR Attend'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _load,
            tooltip: 'Refresh',
          ),
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: _logout,
            tooltip: 'Logout',
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(12),
            child: TextField(
              controller: _searchCtrl,
              onChanged: _onSearch,
              decoration: InputDecoration(
                hintText: 'Search by name, login ID, or phone',
                prefixIcon: const Icon(Icons.search),
                suffixIcon: _searchCtrl.text.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.clear),
                        onPressed: () {
                          _searchCtrl.clear();
                          _onSearch('');
                        },
                      )
                    : null,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              ),
            ),
          ),
          Expanded(
            child: _buildBody(scheme),
          ),
        ],
      ),
    );
  }

  Widget _buildBody(ColorScheme scheme) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline, size: 48, color: Colors.red),
              const SizedBox(height: 12),
              Text(_error!, textAlign: TextAlign.center),
              const SizedBox(height: 16),
              FilledButton(onPressed: _load, child: const Text('Retry')),
            ],
          ),
        ),
      );
    }
    if (_filtered.isEmpty) {
      return Center(
        child: Text(_searchCtrl.text.isEmpty ? 'No employees found' : 'No matches'),
      );
    }
    return ListView.separated(
      padding: const EdgeInsets.only(bottom: 24),
      itemCount: _filtered.length,
      separatorBuilder: (_, _) => const Divider(height: 1),
      itemBuilder: (context, i) {
        final w = _filtered[i];
        final id = (w['id'] ?? '').toString();
        final record = _todayMap[id];
        final punchIn = record?['punch_in_time'] as String?;
        final punchOut = record?['punch_out_time'] as String?;

        String statusText = 'Awaiting punch-in';
        Color statusColor = Colors.orange;
        if (punchIn != null && punchOut == null) {
          statusText = 'Punched in - awaiting out';
          statusColor = Colors.blue;
        } else if (punchIn != null && punchOut != null) {
          statusText = 'Punched in & out';
          statusColor = Colors.green;
        }

        return ListTile(
          leading: CircleAvatar(
            backgroundColor: scheme.primaryContainer,
            child: Text(
              ((w['name'] ?? '?').toString().isEmpty ? '?' : (w['name'] as String)[0].toUpperCase()),
            ),
          ),
          title: Text(w['name'] ?? 'Unknown'),
          subtitle: Text(
            '${w['login_id'] ?? ''}${(w['department'] ?? '').toString().isNotEmpty ? ' • ${w['department']}' : ''}',
          ),
          trailing: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: statusColor.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(statusText, style: TextStyle(fontSize: 12, color: statusColor)),
              ),
              const Icon(Icons.chevron_right),
            ],
          ),
          onTap: () => _openWorker(w),
        );
      },
    );
  }
}
