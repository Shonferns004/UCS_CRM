package com.ucs.lockbox

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import android.view.inputmethod.InputMethodInfo
import android.view.inputmethod.InputMethodManager

/**
 * Packages that can never be blocked. Fixed system set plus runtime-resolved
 * launcher, IME(s) and dialer so OEM variations never brick the device.
 */
object AlwaysAllow {

    private val FIXED = setOf(
        "android",
        "com.android.systemui",
        "com.android.settings",
        "com.android.permissioncontroller",
        "com.android.packageinstaller",
        "com.google.android.gms",
        "com.google.android.gsf",
        "com.android.vending",
        "com.android.phone",
        "com.android.providers.media",
        "com.android.providers.settings",
        "com.android.providers.calendar",
        "com.android.providers.contacts",
        "com.android.providers.downloads",
        "com.android.inputmethod.latin",
        "com.google.android.inputmethod.latin",
        "com.google.android.apps.nexuslauncher",
        "com.google.android.apps.recorder",
        "com.android.se",
        "com.android.cts.priv.ctsshim",
        "com.android.shell",
        "com.android.certinstaller",
        "com.android.documentsui",
        "com.android.printspooler",
        "com.android.externalstorage",
        "com.android.mtp",
        "com.android.managedprovisioning",
        "com.android.dynsystem",
        "com.android.emergency",
        "com.sec.android.app.launcher",
        "com.sec.android.inputmethod",
        "com.samsung.android.emergency",
    )

    /** Enabled input method packages, resolved at runtime. */
    fun inputMethods(context: Context): Set<String> {
        val imm = context.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
        val enabledIds = runCatching {
            Settings.Secure.getString(context.contentResolver, Settings.Secure.ENABLED_INPUT_METHODS)
        }.getOrNull().orEmpty()
        val all = if (Build.VERSION.SDK_INT >= 33) {
            imm.enabledInputMethodList
        } else {
            @Suppress("DEPRECATION")
            imm.enabledInputMethodList
        }
        val enabled = enabledIds.split(":").toSet()
        return all
            .filter { it.id in enabled }
            .mapTo(mutableSetOf()) { it.packageName }
    }

    fun launcher(context: Context): String? {
        val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
        val info = context.packageManager.resolveActivity(intent, PackageManager.MATCH_DEFAULT_ONLY)
        return info?.activityInfo?.packageName
    }

    fun dialer(context: Context): String? {
        val intent = Intent(Intent.ACTION_DIAL)
        val info = context.packageManager.resolveActivity(intent, PackageManager.MATCH_DEFAULT_ONLY)
        return info?.activityInfo?.packageName
    }

    /** Every package that must be exempt from blocking, for a given device. */
    fun alwaysAllowed(context: Context): Set<String> {
        val dynamic = mutableSetOf<String>()
        launcher(context)?.let { dynamic.add(it) }
        dialer(context)?.let { dynamic.add(it) }
        dynamic.addAll(inputMethods(context))
        val own = context.packageName.let { pkg ->
            // Keep self always reachable (splash/main), never blockable.
            listOf(pkg, "$pkg.launcher", "$pkg.block")
        }
        dynamic.addAll(own)
        return FIXED + dynamic
    }

    fun isAlwaysAllowed(context: Context, pkg: String): Boolean = pkg in alwaysAllowed(context)
}