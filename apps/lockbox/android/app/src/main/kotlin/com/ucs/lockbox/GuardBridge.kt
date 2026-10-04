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

    /**
     * The guardian dialed the secret code. Carries no secret itself — only the
     * system can deliver this broadcast, and MainActivity already checked the
     * digits against the stored code before launching.
     */
    const val EVENT_SECRET_CODE = "secretCodeUsed"
}