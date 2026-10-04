package com.ucs.lockbox

import android.app.admin.DeviceAdminReceiver
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context

/**
 * Device-owner entry point for LockBox.
 *
 * Android offers an app exactly one way to stop being uninstalled:
 * `DevicePolicyManager.setUninstallBlocked`. It is only honoured for a true
 * device owner (not a profile owner), so this receiver exists to make LockBox
 * eligible for that role.
 *
 * The important caveat, and the reason [releaseOwnershipAndUninstall] exists:
 * becoming device owner is a one-way door. There is no user-facing "exit" — the
 * app must clear its own device-owner status before the package can be removed.
 * That is deliberate (it is the whole point) but it means a guardian needs a
 * guaranteed way back in, which is what the secret dialer code plus PIN provide.
 */
class LockBoxDeviceAdminReceiver : DeviceAdminReceiver() {

    companion object {
        @JvmStatic
        fun component(context: Context): ComponentName =
            ComponentName(context, LockBoxDeviceAdminReceiver::class.java)

        private fun dpm(context: Context): DevicePolicyManager =
            context.getSystemService(DevicePolicyManager::class.java)

        /** True when this app currently holds device-owner status. */
        fun isDeviceOwner(context: Context): Boolean {
            val manager = dpm(context) ?: return false
            return manager.isDeviceOwnerApp(context.packageName)
        }

        /** True when the receiver is an active admin, owner or not. */
        fun isAdminActive(context: Context): Boolean {
            val manager = dpm(context) ?: return false
            return manager.isAdminActive(component(context))
        }

        /**
         * Block or unblock this package's uninstall. Only meaningful while
         * device owner; returns false otherwise so the UI never claims a
         * protection the system is not actually enforcing.
         *
         * The signature is (admin, packageName, blocked): a device owner names
         * both which admin is authorising the block and which package it
         * applies to, which is this app on both counts.
         */
        @Suppress("DEPRECATION")
        fun setUninstallBlocked(context: Context, blocked: Boolean): Boolean {
            val manager = dpm(context) ?: return false
            if (!manager.isDeviceOwnerApp(context.packageName)) return false
            return runCatching {
                manager.setUninstallBlocked(component(context), context.packageName, blocked)
                true
            }.getOrDefault(false)
        }

        @Suppress("DEPRECATION")
        fun isUninstallBlocked(context: Context): Boolean {
            val manager = dpm(context) ?: return false
            if (!manager.isDeviceOwnerApp(context.packageName)) return false
            return runCatching {
                manager.isUninstallBlocked(component(context), context.packageName)
            }.getOrDefault(false)
        }

        /**
         * Steps down from device owner so the package becomes uninstallable
         * again. This is the escape hatch behind the guardian's secret code —
         * without it a device owner can never be removed from the phone.
         */
        fun releaseOwnership(context: Context): Boolean {
            val manager = dpm(context) ?: return false
            if (!manager.isDeviceOwnerApp(context.packageName)) return true
            return runCatching {
                manager.clearDeviceOwnerApp(context.packageName)
                true
            }.getOrDefault(false)
        }

        /**
         * Whether this device can still be enrolled. Provisioning is refused
         * once an account exists on the device, which is why the UI offers ADB
         * as the fallback rather than pretending the QR flow always works.
         */
        fun canBeProvisioned(context: Context): Boolean {
            val manager = dpm(context) ?: return false
            if (manager.isDeviceOwnerApp(context.packageName)) return false
            val accounts = android.accounts.AccountManager.get(context)
            return runCatching {
                accounts.accounts.isEmpty()
            }.getOrDefault(false)
        }

        /**
         * The `dpm set-device-owner` command a guardian can run over ADB to
         * enrol this build. Surfaced in the UI so nobody has to guess it.
         */
        fun adbEnrolCommand(context: Context): String =
            "adb shell dpm set-device-owner ${context.packageName}/${component(context).className}"
    }
}
