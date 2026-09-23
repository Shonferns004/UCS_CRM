package com.ucs.lockbox

import android.accessibilityservice.AccessibilityService
import android.content.Context
import android.content.Intent
import android.view.accessibility.AccessibilityEvent

/**
 * Watchdog that enforces the allowlist.
 *
 * Guard chain (order matters, see DESIGN.md):
 *   TYPE_WINDOW_STATE_CHANGED → read package → ignore null/empty
 *   → ignore own package → ignore System UI → ignore configured launcher
 *   → ignore lock-screen/system packages → check allowlist
 *   → allowed: do nothing / blocked: launch BlockActivity
 *
 * Anti-loop rules:
 *   - never relaunch BlockActivity for the same package within 1200ms
 *   - ignore every window event that reports our own package
 *   - clear block state when the user returns home
 *   - never call Flutter UI APIs from this service; emit via GuardBridge
 */
class GuardAccessibilityService : AccessibilityService() {

    companion object {
        @Volatile var instance: GuardAccessibilityService? = null
            private set

        private const val RELAUNCH_GUARD_MS = 1200L
    }

    private var lastBlockedPkg: String? = null
    private var lastBlockedAt = 0L

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        GuardBridge.emit(mapOf(
            GuardBridge.EVENT_ACCESSIBILITY to true,
            "connected" to true
        ))
    }

    override fun onUnbind(intent: Intent?): Boolean {
        instance = null
        GuardBridge.emit(mapOf(
            GuardBridge.EVENT_ACCESSIBILITY to false,
            "connected" to false
        ))
        return super.onUnbind(intent)
    }

    override fun onInterrupt() {}

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null || event.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return

        // 1. Read package name.
        val pkg = event.packageName?.toString() ?: return
        if (pkg.isEmpty()) return
        if (!isBlockingActive()) return

        // 2–6. Guard chain: never block essential surfaces.
        if (AlwaysAllow.isAlwaysAllowed(this, pkg)) return
        // 7. Allowlist check.
        if (AllowlistStore.isAllowed(this, pkg)) return

        // 8. Blocked → launch BlockActivity with anti-loop guards.
        val now = System.currentTimeMillis()
        if (pkg == lastBlockedPkg && now - lastBlockedAt < RELAUNCH_GUARD_MS) return
        lastBlockedPkg = pkg
        lastBlockedAt = now

        block(pkg)
    }

    private fun isBlockingActive(): Boolean =
        AllowlistStore.isSetupComplete(this) && AllowlistStore.isProtectionEnabled(this)

    private fun block(pkg: String) {
        val label = AppListProvider.appLabel(this, pkg)
        AllowlistStore.logBlock(this, pkg, label)
        GuardBridge.emit(mapOf(
            GuardBridge.EVENT_BLOCKED to true,
            "pkg" to pkg,
            "label" to label,
            "ts" to System.currentTimeMillis()
        ))

        val intent = Intent(this, BlockActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            .putExtra("package", pkg)
        runCatching { startActivity(intent) }
    }

    /** Called when the user returns to a safe surface so stale block state clears. */
    fun onReturnedHome() {
        lastBlockedPkg = null
        lastBlockedAt = 0L
    }
}