package com.ucs.lockbox

import android.accessibilityservice.AccessibilityServiceInfo
import android.content.Intent
import android.provider.Settings
import android.view.accessibility.AccessibilityManager
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        val channel = MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "com.ucs.lockbox/channel")
        GuardBridge.channel = channel

        channel.setMethodCallHandler { call, result ->
            try {
                handle(call, result)
            } catch (t: Throwable) {
                result.error("LOCKBOX_ERROR", t.message, null)
            }
        }
    }

    private fun handle(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "getInstalledApps" -> {
                val apps = AppListProvider.installedApps(this)
                result.success(mapOf("apps" to apps))
            }

            "getEssentialPackages" -> {
                result.success(mapOf("packages" to AlwaysAllow.alwaysAllowed(this).toList()))
            }

            "getAllowlist" -> result.success(mapOf("packages" to AllowlistStore.getAllowed(this).toList()))

            "saveAllowlist" -> {
                val packages = (call.arguments as? List<*>)?.mapNotNull { it?.toString() } ?: emptyList()
                AllowlistStore.setAllowed(this, packages)
                GuardBridge.emit(mapOf(GuardBridge.EVENT_ALLOWLIST to true, "count" to packages.size))
                result.success(true)
            }

            "isAccessibilityEnabled" -> result.success(accessibilityEnabled())

            "openAccessibilitySettings" -> {
                runCatching {
                    startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                }
                result.success(true)
            }

            "setLauncherVisible" -> {
                val visible = call.arguments as? Boolean ?: true
                LauncherToggler.setVisible(this, visible)
                GuardBridge.emit(mapOf(GuardBridge.EVENT_LAUNCHER to visible))
                result.success(true)
            }

            "isLauncherVisible" -> result.success(LauncherToggler.isVisible(this))

            "getSecretCode" -> result.success(AllowlistStore.getSecretCode(this))

            "setSecretCode" -> {
                val code = call.arguments?.toString() ?: ""
                if (!code.matches(Regex("^\\d{4,8}$"))) {
                    result.error("INVALID_CODE", "Code must be 4–8 digits.", null)
                    return
                }
                AllowlistStore.setSecretCode(this, code)
                result.success(true)
            }

            "isSetupComplete" -> result.success(AllowlistStore.isSetupComplete(this))

            "setSetupComplete" -> {
                val value = call.arguments as? Boolean ?: false
                AllowlistStore.setSetupComplete(this, value)
                result.success(true)
            }

            "setPin" -> {
                val pin = call.arguments?.toString() ?: ""
                if (!pin.matches(Regex("^\\d{4,6}$"))) {
                    result.error("INVALID_PIN", "PIN must be 4–6 digits.", null)
                    return
                }
                AllowlistStore.setPin(this, pin)
                result.success(true)
            }

            "verifyPin" -> {
                val pin = call.arguments?.toString() ?: ""
                result.success(AllowlistStore.verifyPin(this, pin))
            }

            "hasPin" -> result.success(AllowlistStore.hasPin(this))

            "setProtectionEnabled" -> {
                val value = call.arguments as? Boolean ?: true
                AllowlistStore.setProtectionEnabled(this, value)
                GuardBridge.emit(mapOf(GuardBridge.EVENT_PROTECTION to value))
                result.success(true)
            }

            "getProtectionStatus" -> result.success(protectionStatus())

            "enableRecoveryNotification" -> {
                AllowlistStore.setRecoveryNotification(this, true)
                RecoveryNotification.show(this)
                result.success(true)
            }

            "disableRecoveryNotification" -> {
                AllowlistStore.setRecoveryNotification(this, false)
                RecoveryNotification.hide(this)
                result.success(true)
            }

            "openNotificationSettings" -> {
                runCatching {
                    startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                        .putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                }
                result.success(true)
            }

            "getBlockedLog" -> {
                val limit = (call.arguments as? Number)?.toInt() ?: 50
                result.success(mapOf("entries" to AllowlistStore.getBlockLog(this, limit)))
            }

            "clearBlockedLog" -> {
                AllowlistStore.clearBlockLog(this)
                result.success(true)
            }

            "resetAllData" -> {
                val keepRecovery = AllowlistStore.isRecoveryNotification(this)
                AllowlistStore.resetAll(this)
                LauncherToggler.setVisible(this, true) // never lock the user out of the app
                if (keepRecovery) RecoveryNotification.show(this) else RecoveryNotification.hide(this)
                GuardBridge.emit(mapOf(GuardBridge.EVENT_ALLOWLIST to false))
                result.success(true)
            }

            else -> result.notImplemented()
        }
    }

    private fun accessibilityEnabled(): Boolean {
        val am = getSystemService(AccessibilityManager::class.java)
        val enabled = am.getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_ALL_MASK)
        return enabled.any {
            it.resolveInfo.serviceInfo.packageName == packageName &&
                it.resolveInfo.serviceInfo.name == "${packageName}.GuardAccessibilityService"
        }
    }

    private fun protectionStatus(): Map<String, Any?> {
        val accEnabled = accessibilityEnabled()
        val launcherVisible = LauncherToggler.isVisible(this)
        val allowlistCount = AllowlistStore.getAllowed(this).size
        val blockedToday = AllowlistStore.blockedToday(this)
        return mapOf(
            "protectionEnabled" to AllowlistStore.isProtectionEnabled(this),
            "accessibilityEnabled" to accEnabled,
            "setupComplete" to AllowlistStore.isSetupComplete(this),
            "launcherVisible" to launcherVisible,
            "allowlistCount" to allowlistCount,
            "blockedToday" to blockedToday,
            "secretCode" to AllowlistStore.getSecretCode(this),
            "recoveryNotification" to AllowlistStore.isRecoveryNotification(this),
            "hasPin" to AllowlistStore.hasPin(this),
            "appVersion" to (runCatching {
                packageManager.getPackageInfo(packageName, 0).versionName
            }.getOrNull() ?: "1.0.0")
        )
    }

    override fun onDestroy() {
        GuardBridge.channel = null
        super.onDestroy()
    }
}