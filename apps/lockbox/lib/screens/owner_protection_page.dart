import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../channel.dart';
import '../core/theme/app_colors.dart';
import '../core/widgets/app_widgets.dart';
import '../core/widgets/pin_pad.dart';

/// Uninstall protection, plus the guardian's way back out.
///
/// Two very different jobs live here, so they are kept visibly separate:
///
///  * **Protection** — blocks this package's uninstall. Android only honours
///    this for a true device owner, so the page is honest about whether the
///    system is actually enforcing anything rather than showing a reassuring
///    toggle that does nothing.
///
///  * **Removal** — the escape hatch. Because device owner is a one-way door,
///    there has to be a guaranteed way for the guardian to reverse it, or a
///    typo during enrolment bricks the phone. Removal always demands the PIN,
///    even when it was opened from Settings where the user is already unlocked.
class OwnerProtectionPage extends StatefulWidget {
  /// Set when the page was reached by dialling the secret code, which starts
  /// the PIN gate immediately instead of letting the page open unlocked.
  final bool requirePinFirst;

  const OwnerProtectionPage({super.key, this.requirePinFirst = false});

  @override
  State<OwnerProtectionPage> createState() => _OwnerProtectionPageState();
}

class _OwnerProtectionPageState extends State<OwnerProtectionPage> {
  DeviceOwnerStatus? _status;
  bool _loading = true;
  bool _busy = false;
  String? _loadError;

  // PIN gate
  bool _gateOpen = false;
  final _digits = <String>[];
  int _pinLength = 4;
  String? _pinError;
  bool _pinOk = false;

  @override
  void initState() {
    super.initState();
    _refresh();
    if (widget.requirePinFirst) _gateOpen = true;
    _loadPinLength();
  }

  Future<void> _loadPinLength() async {
    final length = await LockBoxChannel.pinLength();
    if (!mounted) return;
    setState(() => _pinLength = length.clamp(4, 6));
  }

  Future<void> _refresh() async {
    try {
      final status = await LockBoxChannel.deviceOwnerStatus();
      if (!mounted) return;
      setState(() {
        _status = status;
        _loading = false;
        _loadError = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _loadError = e.toString();
      });
    }
  }

  // ---------- PIN gate ----------

  void _addDigit(String d) {
    if (_busy || _digits.length >= _pinLength) return;
    setState(() {
      _digits.add(d);
      _pinError = null;
      _pinOk = false;
    });
    if (_digits.length == _pinLength) _verify();
  }

  void _backspace() {
    if (_busy) return;
    setState(() {
      if (_digits.isNotEmpty) _digits.removeLast();
      _pinError = null;
      _pinOk = false;
    });
  }

  Future<void> _verify() async {
    setState(() => _busy = true);
    final ok = await LockBoxChannel.verifyPin(_digits.join());
    if (!mounted) return;
    if (ok) {
      HapticFeedback.mediumImpact();
      setState(() {
        _busy = false;
        _pinOk = true;
        _digits.clear();
      });
      // Let the success state register before swapping the view back.
      await Future<void>.delayed(const Duration(milliseconds: 260));
      if (!mounted) return;
      setState(() => _gateOpen = false);
    } else {
      HapticFeedback.heavyImpact();
      setState(() {
        _busy = false;
        _pinError = 'Incorrect PIN';
        _digits.clear();
      });
    }
  }

  // ---------- actions ----------

  Future<void> _toggleBlocked(bool value) async {
    setState(() => _busy = true);
    await LockBoxChannel.setUninstallBlocked(value);
    // Never trust the return value alone; re-read what the system actually
    // reports so the switch cannot drift from reality.
    await _refresh();
    if (!mounted) return;
    setState(() => _busy = false);
  }

  Future<void> _requestUninstall() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Remove LockBox?'),
        content: const Text(
          'LockBox will step down as device owner and then be uninstalled. '
          'App blocking on this device stops working after this.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.error),
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Uninstall'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    setState(() => _busy = true);
    final ok = await LockBoxChannel.uninstallSelf();
    if (!mounted) return;
    setState(() => _busy = false);
    if (!ok) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not step down from device owner.')),
      );
    }
  }

  void _copyCommand() {
    final cmd = _status?.adbCommand ?? '';
    if (cmd.isEmpty) return;
    Clipboard.setData(ClipboardData(text: cmd));
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Command copied')),
    );
  }

  // ---------- build ----------

  @override
  Widget build(BuildContext context) {
    if (_gateOpen) return _buildGate();

    final dark = Theme.of(context).brightness == Brightness.dark;
    final secondaryText = dark ? AppColors.darkTextSecondary : AppColors.textSecondary;

    return Scaffold(
      appBar: AppBar(title: const Text('Uninstall Protection')),
      body: SafeArea(
        child: _loading
            ? const BusyScreen(message: 'Checking device owner…')
            : _loadError != null
                ? AppEmptyState(
                    icon: LucideIcons.alertTriangle,
                    title: 'Could not read status',
                    subtitle: _loadError,
                  )
                : RefreshIndicator(
                    onRefresh: _refresh,
                    child: ListView(
                      padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
                      children: [
                        _buildStatusCard(),
                        const SizedBox(height: 18),
                        if ((_status?.isDeviceOwner ?? false))
                          _buildOwnerControls()
                        else
                          _buildEnrolInstructions(),
                        const SizedBox(height: 18),
                        _buildRemoval(secondaryText),
                      ],
                    ),
                  ),
      ),
    );
  }

  Widget _buildStatusCard() {
    final s = _status;
    final owner = s?.isDeviceOwner ?? false;
    final blocked = s?.uninstallBlocked ?? false;
    final color = blocked ? AppColors.success : (owner ? AppColors.warning : AppColors.error);

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [color, color.withValues(alpha: 0.75)],
        ),
        borderRadius: AppRadii.card,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                blocked ? LucideIcons.shieldCheck : LucideIcons.shieldOff,
                color: Colors.white,
                size: 36,
              ),
              const Spacer(),
              StatusPill(
                label: blocked
                    ? 'UNINSTALL BLOCKED'
                    : owner
                        ? 'OWNER, UNBLOCKED'
                        : 'NOT ENROLLED',
                icon: LucideIcons.info,
                color: Colors.white,
              ),
            ],
          ),
          const SizedBox(height: 14),
          Text(
            blocked
                ? 'This phone will refuse to uninstall LockBox.'
                : owner
                    ? 'Device owner is active, but uninstall is currently allowed.'
                    : 'LockBox cannot block its own uninstall yet.',
            style: const TextStyle(
              color: Colors.white,
              fontSize: 15,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            owner
                ? 'Uninstall blocking is enforced by Android, not by LockBox.'
                : 'Android only honours an app\'s request to block its own uninstall '
                    'when that app is the device owner.',
            style: TextStyle(color: Colors.white.withValues(alpha: 0.9), fontSize: 13),
          ),
        ],
      ),
    );
  }

  Widget _buildOwnerControls() {
    final blocked = _status?.uninstallBlocked ?? false;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SectionHeader('PROTECTION'),
        AppSwitchTile(
          title: 'Block uninstall',
          subtitle: blocked
              ? 'Android refuses to remove LockBox.'
              : 'Turn on to make LockBox un-removable.',
          icon: LucideIcons.lock,
          value: blocked,
          enabled: !_busy,
          onChanged: _toggleBlocked,
        ),
      ],
    );
  }

  Widget _buildEnrolInstructions() {
    final s = _status!;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SectionHeader('ENROL THIS PHONE'),
        AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'This is a one-way step',
                style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15, color: Theme.of(context).colorScheme.primary),
              ),
              const SizedBox(height: 6),
              Text(
                'Once LockBox is the device owner, Android will not let it be '
                'uninstalled through normal means. Removal then requires the '
                'secret dialer code and your PIN, which is the only way back.',
                style: TextStyle(fontSize: 13, height: 1.4),
              ),
              const SizedBox(height: 14),
              Text(
                s.canBeProvisioned
                    ? 'This phone has no accounts yet, so it can still be enrolled '
                        'from its setup screen. Otherwise run:'
                    : 'This phone already has an account, so Android will refuse '
                        'in-app enrollment. Run this from a computer with the phone '
                        'connected:',
                style: TextStyle(fontSize: 13, height: 1.4),
              ),
              const SizedBox(height: 10),
              InkWell(
                onTap: _copyCommand,
                borderRadius: AppRadii.small,
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AppColors.surfaceSoft,
                    borderRadius: AppRadii.small,
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          s.adbCommand,
                          style: const TextStyle(fontFamily: 'monospace', fontSize: 12),
                        ),
                      ),
                      const SizedBox(width: 8),
                      const Icon(LucideIcons.copy, size: 16),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'Tap to copy.',
                style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.onSurfaceVariant),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildRemoval(Color secondaryText) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SectionHeader('REMOVE LOCKBOX'),
        AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Guardian removal',
                style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
              ),
              const SizedBox(height: 6),
              Text(
                'Releases device owner and uninstalls LockBox. You will be asked '
                'for your PIN.',
                style: TextStyle(fontSize: 13, height: 1.4, color: secondaryText),
              ),
              const SizedBox(height: 14),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: _busy ? null : _requestUninstall,
                  icon: _busy
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(LucideIcons.trash2, size: 20),
                  label: const Text('Uninstall LockBox'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppColors.error,
                    side: const BorderSide(color: AppColors.error),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildGate() {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final primaryText = dark ? AppColors.darkTextPrimary : AppColors.textPrimary;
    final secondaryText = dark ? AppColors.darkTextSecondary : AppColors.textSecondary;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Confirm'),
        leading: IconButton(
          icon: const Icon(LucideIcons.arrowLeft),
          onPressed: _busy ? null : () => setState(() => _gateOpen = false),
        ),
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 12),
              Icon(LucideIcons.shieldAlert, size: 40, color: AppColors.primary),
              const SizedBox(height: 14),
              Text(
                'Enter your PIN',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: primaryText),
              ),
              const SizedBox(height: 6),
              Text(
                'Required to change or remove uninstall protection.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 13.5, color: secondaryText),
              ),
              const SizedBox(height: 26),
              Center(
                child: PinDots(
                  length: _digits.length,
                  total: _pinLength,
                  error: _pinError != null,
                  success: _pinOk,
                ),
              ),
              if (_pinError != null) ...[
                const SizedBox(height: 10),
                Center(
                  child: Text(
                    _pinError!,
                    style: const TextStyle(color: AppColors.error, fontSize: 13, fontWeight: FontWeight.w600),
                  ),
                ),
              ],
              const Spacer(),
              Center(
                child: PinKeypad(
                  onDigit: _addDigit,
                  onBackspace: _backspace,
                  enabled: !_busy && !_pinOk,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
