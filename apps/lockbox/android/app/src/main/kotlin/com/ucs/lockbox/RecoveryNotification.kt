package com.ucs.lockbox

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build

/**
 * Optional persistent notification that reopens LockBox when the launcher icon
 * is hidden and the dialer secret code is unavailable on the device. ON only
 * via Settings → Recovery Notification.
 */
object RecoveryNotification {

    private const val CHANNEL_ID = "lockbox_recovery"
    private const val NOTIFICATION_ID = 1001

    private fun channel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = context.getSystemService(NotificationManager::class.java)
        val ch = NotificationChannel(
            CHANNEL_ID,
            context.getString(R.string.recovery_channel_name),
            NotificationManager.IMPORTANCE_LOW
        )
        ch.description = context.getString(R.string.recovery_channel_desc)
        ch.setShowBadge(false)
        nm.createNotificationChannel(ch)
    }

    fun show(context: Context) {
        channel(context)
        // Guard against missing POST_NOTIFICATIONS on Android 13+.
        if (Build.VERSION.SDK_INT >= 33) {
            val hasPerm = context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) ==
                android.content.pm.PackageManager.PERMISSION_GRANTED
            if (!hasPerm) return
        }
        val nm = context.getSystemService(NotificationManager::class.java)

        val open = PendingIntent.getActivity(
            context, 0,
            Intent(context, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = Notification.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_lock_lock)
            .setContentTitle(context.getString(R.string.recovery_notification_title))
            .setContentText(context.getString(R.string.recovery_notification_text))
            .setContentIntent(open)
            .setOngoing(true)
            .setAutoCancel(false)
            .setShowWhen(false)
            .build()

        nm.notify(NOTIFICATION_ID, notification)
    }

    fun hide(context: Context) {
        val nm = context.getSystemService(NotificationManager::class.java)
        nm.cancel(NOTIFICATION_ID)
    }
}