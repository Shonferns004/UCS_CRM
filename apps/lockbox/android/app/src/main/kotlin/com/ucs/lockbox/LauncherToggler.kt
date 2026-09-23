package com.ucs.lockbox

import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager

/**
 * Hides/shows the launcher icon by toggling the dedicated launcher alias.
 * The real MainActivity component is NEVER disabled — that is what the
 * secret-code receiver and notifications launch.
 */
object LauncherToggler {

    const val LAUNCHER_ALIAS = "com.ucs.lockbox.LauncherAlias"

    fun setVisible(context: Context, visible: Boolean) {
        val pm = context.packageManager
        val cn = ComponentName(context.packageName, LAUNCHER_ALIAS)
        val state = if (visible) {
            PackageManager.COMPONENT_ENABLED_STATE_ENABLED
        } else {
            PackageManager.COMPONENT_ENABLED_STATE_DISABLED
        }
        pm.setComponentEnabledSetting(cn, state, PackageManager.DONT_KILL_APP)
    }

    fun isVisible(context: Context): Boolean {
        val pm = context.packageManager
        val cn = ComponentName(context.packageName, LAUNCHER_ALIAS)
        return pm.getComponentEnabledSetting(cn) != PackageManager.COMPONENT_ENABLED_STATE_DISABLED
    }
}