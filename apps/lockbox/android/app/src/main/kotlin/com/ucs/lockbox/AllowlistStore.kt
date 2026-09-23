package com.ucs.lockbox

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.security.MessageDigest
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Single source of truth for all persisted LockBox state. Plain SharedPreferences,
 * write-through, accessed from the service, activities, receivers and the channel.
 *
 * Layout is deliberately simple (no DataStore/Room) so shell scripts and backups
 * can reason about it. `allowBackup=false` is set in the manifest.
 */
object AllowlistStore {

    private const val PREFS = "lockbox_prefs"
    private const val KEY_ALLOWED = "allowed_packages"
    private const val KEY_SETUP_COMPLETE = "setup_complete"
    private const val KEY_PROTECTION_ON = "protection_enabled"
    private const val KEY_SECRET_CODE = "secret_code"
    private const val KEY_PIN_HASH = "pin_hash"
    private const val KEY_RECOVERY = "recovery_notification"
    private const val KEY_BLOCK_LOG = "block_log"

    private const val DEFAULT_SECRET = "5284" // LOCK on a phone keypad
    private const val LOG_CAP = 200
    private const val SALT = "lockbox.v1"

    private fun prefs(context: Context) =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    // ---------- allowlist ----------

    fun setAllowed(context: Context, packages: Collection<String>) {
        prefs(context).edit().putStringSet(KEY_ALLOWED, packages.toHashSet()).apply()
    }

    fun getAllowed(context: Context): Set<String> =
        prefs(context).getStringSet(KEY_ALLOWED, emptySet()) ?: emptySet()

    fun isAllowed(context: Context, pkg: String): Boolean =
        pkg in getAllowed(context)

    // ---------- flags ----------

    fun isSetupComplete(context: Context): Boolean =
        prefs(context).getBoolean(KEY_SETUP_COMPLETE, false)

    fun setSetupComplete(context: Context, value: Boolean) {
        prefs(context).edit().putBoolean(KEY_SETUP_COMPLETE, value).apply()
    }

    fun isProtectionEnabled(context: Context): Boolean =
        prefs(context).getBoolean(KEY_PROTECTION_ON, true)

    fun setProtectionEnabled(context: Context, value: Boolean) {
        prefs(context).edit().putBoolean(KEY_PROTECTION_ON, value).apply()
    }

    fun isRecoveryNotification(context: Context): Boolean =
        prefs(context).getBoolean(KEY_RECOVERY, false)

    fun setRecoveryNotification(context: Context, value: Boolean) {
        prefs(context).edit().putBoolean(KEY_RECOVERY, value).apply()
    }

    // ---------- secret code ----------

    fun getSecretCode(context: Context): String =
        prefs(context).getString(KEY_SECRET_CODE, DEFAULT_SECRET) ?: DEFAULT_SECRET

    fun setSecretCode(context: Context, code: String) {
        prefs(context).edit().putString(KEY_SECRET_CODE, code).apply()
    }

    // ---------- PIN (hashed, never plaintext) ----------

    fun pinHash(context: Context): String? =
        prefs(context).getString(KEY_PIN_HASH, null)

    fun setPin(context: Context, pin: String) {
        prefs(context).edit().putString(KEY_PIN_HASH, hash(pin)).apply()
    }

    fun verifyPin(context: Context, pin: String): Boolean {
        val stored = pinHash(context) ?: return false
        return MessageDigest.isEqual(stored.toByteArray(), hash(pin).toByteArray())
    }

    fun hasPin(context: Context): Boolean = pinHash(context) != null

    private fun hash(pin: String): String {
        val digest = MessageDigest.getInstance("SHA-256")
        digest.update("$SALT:$pin".toByteArray(Charsets.UTF_8))
        return digest.digest().joinToString("") { "%02x".format(it) }
    }

    // ---------- blocked-attempt log (ring buffer) ----------

    private val dayFmt = SimpleDateFormat("yyyy-MM-dd", Locale.US)

    fun logBlock(context: Context, pkg: String, label: String) {
        val cur = prefs(context).getString(KEY_BLOCK_LOG, null)
            ?.let { runCatching { JSONArray(it) }.getOrNull() } ?: JSONArray()
        if (cur.length() >= LOG_CAP) {
            cur.remove(0)
        }
        val entry = JSONObject()
            .put("pkg", pkg)
            .put("label", label)
            .put("ts", System.currentTimeMillis())
        cur.put(entry)
        prefs(context).edit().putString(KEY_BLOCK_LOG, cur.toString()).apply()
    }

    fun getBlockLog(context: Context, limit: Int = LOG_CAP): List<Map<String, Any?>> {
        val raw = prefs(context).getString(KEY_BLOCK_LOG, null) ?: return emptyList()
        val arr = runCatching { JSONArray(raw) }.getOrNull() ?: return emptyList()
        val out = ArrayList<Map<String, Any?>>(arr.length())
        val start = (arr.length() - limit).coerceAtLeast(0)
        for (i in start until arr.length()) {
            val o = arr.getJSONObject(i)
            out.add(mapOf(
                "pkg" to o.optString("pkg"),
                "label" to o.optString("label"),
                "ts" to o.optLong("ts")
            ))
        }
        return out.reversed()
    }

    fun clearBlockLog(context: Context) {
        prefs(context).edit().remove(KEY_BLOCK_LOG).apply()
    }

    fun blockedToday(context: Context): Int {
        val today = dayFmt.format(Date())
        var count = 0
        val raw = prefs(context).getString(KEY_BLOCK_LOG, null) ?: return 0
        val arr = runCatching { JSONArray(raw) }.getOrNull() ?: return 0
        for (i in 0 until arr.length()) {
            val ts = arr.getJSONObject(i).optLong("ts", 0L)
            if (ts > 0 && dayFmt.format(Date(ts)) == today) count++
        }
        return count
    }

    // ---------- reset ----------

    fun resetAll(context: Context) {
        prefs(context).edit().clear().apply()
    }
}