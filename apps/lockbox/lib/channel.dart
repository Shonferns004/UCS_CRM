import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// A launcher app as returned by the native AppListProvider.
class InstalledApp {
  final String package;
  final String label;
  final bool isSystem;
  final String iconBase64;

  const InstalledApp({
    required this.package,
    required this.label,
    required this.isSystem,
    required this.iconBase64,
  });

  factory InstalledApp.fromJson(Map<String, dynamic> json) => InstalledApp(
        package: json['package'] as String? ?? '',
        label: json['label'] as String? ?? '',
        isSystem: json['system'] as bool? ?? false,
        iconBase64: json['icon'] as String? ?? '',
      );
}

/// Snapshot of the device protection state (getProtectionStatus).
class ProtectionStatus {
  final bool protectionEnabled;
  final bool accessibilityEnabled;
  final bool setupComplete;
  final bool launcherVisible;
  final int allowlistCount;
  final int blockedToday;
  final String secretCode;
  final bool recoveryNotification;
  final bool hasPin;
  final String appVersion;

  const ProtectionStatus({
    required this.protectionEnabled,
    required this.accessibilityEnabled,
    required this.setupComplete,
    required this.launcherVisible,
    required this.allowlistCount,
    required this.blockedToday,
    required this.secretCode,
    required this.recoveryNotification,
    required this.hasPin,
    required this.appVersion,
  });

  factory ProtectionStatus.fromMap(Map<Object?, Object?> json) => ProtectionStatus(
        protectionEnabled: json['protectionEnabled'] as bool? ?? true,
        accessibilityEnabled: json['accessibilityEnabled'] as bool? ?? false,
        setupComplete: json['setupComplete'] as bool? ?? false,
        launcherVisible: json['launcherVisible'] as bool? ?? true,
        allowlistCount: json['allowlistCount'] as int? ?? 0,
        blockedToday: json['blockedToday'] as int? ?? 0,
        secretCode: json['secretCode'] as String? ?? '5284',
        recoveryNotification: json['recoveryNotification'] as bool? ?? false,
        hasPin: json['hasPin'] as bool? ?? false,
        appVersion: json['appVersion'] as String? ?? '1.0.0',
      );

  /// Is the device actually protected right now?
  bool get active => setupComplete && protectionEnabled && accessibilityEnabled;

  bool get paused => setupComplete && protectionEnabled && !accessibilityEnabled;
}

/// One blocked-attempt log entry.
class BlockLogEntry {
  final String package;
  final String label;
  final int ts;

  const BlockLogEntry({required this.package, required this.label, required this.ts});

  factory BlockLogEntry.fromJson(Map<String, dynamic> json) => BlockLogEntry(
        package: json['pkg'] as String? ?? '',
        label: json['label'] as String? ?? '',
        ts: json['ts'] as int? ?? 0,
      );
}

/// Typed wrapper around the `com.ucs.lockbox/channel` MethodChannel.
class LockBoxChannel {
  static const channel = MethodChannel('com.ucs.lockbox/channel');

  static final _eventController = StreamController<Map<String, dynamic>>.broadcast();
  static Stream<Map<String, dynamic>> get events => _eventController.stream;
  static bool _listening = false;

  static void _ensureListening() {
    if (_listening) return;
    _listening = true;
    channel.setMethodCallHandler((call) async {
      if (call.method == 'onEvent' && call.arguments is Map) {
        _eventController.add(Map<String, dynamic>.from(call.arguments as Map));
      }
    });
  }

  static Future<List<InstalledApp>> getInstalledApps() async {
    _ensureListening();
    final res = await channel.invokeMethod<Map<Object?, Object?>>('getInstalledApps');
    final raw = res?['apps'] as List? ?? const [];
    final apps = <InstalledApp>[];
    for (final item in raw) {
      if (item is Map) {
        apps.add(InstalledApp.fromJson(
          item.map((k, v) => MapEntry(k.toString(), v)),
        ));
      }
    }
    return apps;
  }

  static Future<Set<String>> getAllowlist() async {
    final res = await channel.invokeMethod<Map<Object?, Object?>>('getAllowlist');
    final raw = res?['packages'] as List? ?? const [];
    return raw.map((e) => e.toString()).toSet();
  }

  /// Packages that can never be blocked (launcher, settings, phone, IMEs…).
  static Future<Set<String>> getEssentialPackages() async {
    final res = await channel.invokeMethod<Map<Object?, Object?>>('getEssentialPackages');
    final raw = res?['packages'] as List? ?? const [];
    return raw.map((e) => e.toString()).toSet();
  }

  static Future<void> saveAllowlist(Set<String> packages) async {
    await channel.invokeMethod('saveAllowlist', packages.toList());
  }

  static Future<bool> isAccessibilityEnabled() async =>
      await channel.invokeMethod('isAccessibilityEnabled') as bool? ?? false;

  static Future<void> openAccessibilitySettings() async {
    await channel.invokeMethod('openAccessibilitySettings');
  }

  static Future<void> setLauncherVisible(bool visible) async {
    await channel.invokeMethod('setLauncherVisible', visible);
  }

  static Future<bool> isLauncherVisible() async =>
      await channel.invokeMethod('isLauncherVisible') as bool? ?? true;

  static Future<String> getSecretCode() async =>
      await channel.invokeMethod('getSecretCode') as String? ?? '5284';

  static Future<bool> setSecretCode(String code) async {
    try {
      await channel.invokeMethod('setSecretCode', code);
      return true;
    } on PlatformException {
      return false;
    }
  }

  static Future<bool> isSetupComplete() async =>
      await channel.invokeMethod('isSetupComplete') as bool? ?? false;

  static Future<void> setSetupComplete(bool value) async {
    await channel.invokeMethod('setSetupComplete', value);
  }

  static Future<bool> setPin(String pin) async {
    try {
      await channel.invokeMethod('setPin', pin);
      return true;
    } on PlatformException {
      return false;
    }
  }

  static Future<bool> verifyPin(String pin) async =>
      await channel.invokeMethod('verifyPin', pin) as bool? ?? false;

  static Future<bool> hasPin() async =>
      await channel.invokeMethod('hasPin') as bool? ?? false;

  static Future<void> setProtectionEnabled(bool value) async {
    await channel.invokeMethod('setProtectionEnabled', value);
  }

  static Future<ProtectionStatus> getProtectionStatus() async {
    _ensureListening();
    final res = await channel.invokeMethod<Map<Object?, Object?>>('getProtectionStatus');
    return ProtectionStatus.fromMap(res ?? const {});
  }

  static Future<void> enableRecoveryNotification() async {
    await channel.invokeMethod('enableRecoveryNotification');
  }

  static Future<void> disableRecoveryNotification() async {
    await channel.invokeMethod('disableRecoveryNotification');
  }

  static Future<void> openNotificationSettings() async {
    await channel.invokeMethod('openNotificationSettings');
  }

  static Future<List<BlockLogEntry>> getBlockedLog({int limit = 50}) async {
    final res = await channel.invokeMethod<Map<Object?, Object?>>(
      'getBlockedLog',
      limit,
    );
    final raw = res?['entries'] as List? ?? const [];
    final out = <BlockLogEntry>[];
    for (final item in raw) {
      if (item is Map) {
        out.add(BlockLogEntry.fromJson(item.map((k, v) => MapEntry(k.toString(), v))));
      }
    }
    return out;
  }

  static Future<void> clearBlockedLog() async {
    await channel.invokeMethod('clearBlockedLog');
  }

  static Future<bool> resetAllData() async {
    try {
      await channel.invokeMethod('resetAllData');
      return true;
    } on PlatformException {
      return false;
    }
  }

  /// Builds an ImageProvider from a base64 PNG payload (empty → null).
  static ImageProvider? iconImage(String base64) {
    if (base64.isEmpty) return null;
    try {
      final bytes = base64Decode(base64);
      return MemoryImage(bytes);
    } catch (_) {
      return null;
    }
  }
}