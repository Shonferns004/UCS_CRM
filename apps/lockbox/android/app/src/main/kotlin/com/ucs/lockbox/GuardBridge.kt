package com.ucs.lockbox

import io.flutter.plugin.common.MethodChannel

/** Event bridge: Android service → Flutter UI. Mirrors the scrapper app's pattern. */
object GuardBridge {
    @Volatile var channel: MethodChannel? = null

    fun emit(map: Map<String, Any?>) {
        try {
            channel?.invokeMethod("onEvent", map)
        } catch (t: Throwable) {
            // channel may be briefly unbound while the UI starts
        }
    }

    const val EVENT_ACCESSIBILITY = "accessibilityChanged"
    const val EVENT_PROTECTION = "protectionStatusChanged"
    const val EVENT_LAUNCHER = "launcherVisibilityChanged"
    const val EVENT_ALLOWLIST = "allowlistChanged"
    const val EVENT_BLOCKED = "blocked"
}