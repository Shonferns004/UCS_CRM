package com.ucs.lockbox

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Re-shows the recovery notification across reboots when it was enabled. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action == Intent.ACTION_BOOT_COMPLETED &&
            AllowlistStore.isRecoveryNotification(context)
        ) {
            RecoveryNotification.show(context)
        }
    }
}