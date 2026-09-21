import 'package:flutter/material.dart';

import '../../core/api_client.dart';
import '../../core/formatters.dart';
import '../../core/theme.dart';
import '../../models/stock.dart';
import '../../services/stock_service.dart';
import '../../state/app_state.dart';
import '../widgets/common.dart';
import '../widgets/modals.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});
  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  bool _loading = true;
  Object? _error;
  StockConfig? _config;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final c = await StockService.getConfig();
      if (!mounted) return;
      setState(() {
        _config = c;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => Navigator.pop(context),
        ),
        title: const Text('Settings'),
      ),
      body: _loading
          ? const LoadingSpinner(message: 'Loading settings...')
          : _error != null
              ? ErrorState(message: toApiException(_error!).message, onRetry: _load)
              : ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    Card(
                      elevation: 0,
                      margin: EdgeInsets.zero,
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                const Text('Stock Configuration',
                                    style: TextStyle(
                                        fontSize: 15, fontWeight: FontWeight.w700)),
                                if (AppState.auth.canManage)
                                  TextButton.icon(
                                    onPressed: () => _editConfig(context),
                                    icon: const Icon(Icons.edit, size: 16),
                                    label: const Text('Edit'),
                                  ),
                              ],
                            ),
                            const Divider(),
                            _setting('Initial Stock',
                                formatNumber(_config!.initialStock)),
                            _setting('Price per Pad (₹)',
                                formatNumber(_config!.pricePerPad)),
                            _setting('Low Stock Threshold (%)',
                                formatNumber(_config!.lowStockThreshold)),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    Card(
                      elevation: 0,
                      margin: EdgeInsets.zero,
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('Connection',
                                style: TextStyle(
                                    fontSize: 15, fontWeight: FontWeight.w700)),
                            const Divider(),
                            _setting('API Base URL', apiBaseUrl),
                            _setting('Version', 'v0.1.0'),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    OutlinedButton.icon(
                      style: OutlinedButton.styleFrom(
                        foregroundColor: AppColors.danger,
                      ),
                      onPressed: () async {
                        await AppState.auth.logout();
                      },
                      icon: const Icon(Icons.logout, size: 18),
                      label: const Text('Log Out'),
                    ),
                  ],
                ),
    );
  }

  Widget _setting(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Expanded(
            child: Text(label,
                style: const TextStyle(color: AppColors.textLight, fontSize: 13)),
          ),
          Text(value,
              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }

  Future<void> _editConfig(BuildContext context) async {
    final c = _config!;
    final initial = TextEditingController(text: '${c.initialStock ?? ''}');
    final price = TextEditingController(text: '${c.pricePerPad ?? ''}');
    final threshold = TextEditingController(text: '${c.lowStockThreshold ?? ''}');
    await showFormModal(
      context,
      title: 'Edit Stock Configuration',
      builder: (ctx, setState) {
        return Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Edit Stock Configuration',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
            const SizedBox(height: 16),
            FormFieldWrap(
              label: 'Initial Stock',
              child: TextField(controller: initial, keyboardType: TextInputType.number),
            ),
            const SizedBox(height: 12),
            FormFieldWrap(
              label: 'Price per Pad (₹)',
              child: TextField(controller: price, keyboardType: TextInputType.number),
            ),
            const SizedBox(height: 12),
            FormFieldWrap(
              label: 'Low Stock Threshold (%)',
              child: TextField(controller: threshold, keyboardType: TextInputType.number),
            ),
            const SizedBox(height: 20),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                OutlinedButton(
                  onPressed: () => Navigator.pop(ctx),
                  child: const Text('Cancel'),
                ),
                const SizedBox(width: 10),
                FilledButton(
                  onPressed: () async {
                    final msg = await apiRun(context, () async {
                      await StockService.updateConfig(StockConfig(
                        initialStock: int.tryParse(initial.text.trim()),
                        pricePerPad: int.tryParse(price.text.trim()),
                        lowStockThreshold: int.tryParse(threshold.text.trim()),
                      ));
                    }, success: 'Configuration updated');
                    if (msg == null) {
                      Navigator.pop(ctx);
                      _load();
                    } else {
                      ScaffoldMessenger.of(context)
                          .showSnackBar(SnackBar(content: Text(msg)));
                    }
                  },
                  child: const Text('Save'),
                ),
              ],
            ),
          ],
        );
      },
    );
  }
}