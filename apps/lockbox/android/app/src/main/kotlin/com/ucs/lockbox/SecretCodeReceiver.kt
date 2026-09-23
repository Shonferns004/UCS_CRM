package com.ucs.lockbox

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Dialer secret code — registers for the SECRET_CODE scheme with no host so it
 * matches ANY *#*#XXXX#*#* dialed, then validates the dialed digits against the
 * user's stored code. Unknown codes are ignored (never crash, never open).
 *
 * Note: because the host is dynamic (user-changeable) it cannot live in the
 * manifest `android:host`; that is why the filter is host-less.
 */
class SecretCodeReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent?) {
        val host = intent?.data?.host ?: return
        val stored = AllowlistStore.getSecretCode(context)
        if (host != stored) return

        val launch = Intent(context, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            .putExtra(EXTRA_FROM_SECRET, true)
        context.startActivity(launch)
    }

    companion object {
        const val EXTRA_FROM_SECRET = "fromSecretCode"
    }
}