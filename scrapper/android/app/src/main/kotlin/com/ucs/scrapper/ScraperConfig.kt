package com.ucs.scrapper

import android.content.Context
import android.content.SharedPreferences
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

object ScraperConfig {
    private const val PREFS = "scrapper_prefs"
    private const val ALIAS = "scraper_pin_key"
    private lateinit var prefs: SharedPreferences

    fun init(context: Context) {
        prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    }

    fun getAll(): Map<String, Any?> = mapOf(
        "deviceLabel" to (get("deviceLabel") ?: ""),
        "projectId" to (get("projectId") ?: ""),
        "devicePin" to (getPin("devicePin") ?: ""),
        "gpayPin" to (getPin("gpayPin") ?: ""),
        "gpayLockType" to (get("gpayLockType") ?: "pin"),
        "receivedOnly" to getBool("receivedOnly", true),
        "maxTransactions" to getInt("maxTransactions", 200),
        "scrollLoops" to getInt("scrollLoops", 8),
        "historyText" to (get("historyText") ?: "All activity")
    )

    fun setAll(map: Map<String, Any?>) {
        val e = prefs.edit()
        for ((k, v) in map) when (k) {
            "devicePin" -> putPin(e, "devicePin", v?.toString() ?: "")
            "gpayPin" -> putPin(e, "gpayPin", v?.toString() ?: "")
            else -> when (v) {
                is Boolean -> e.putBoolean(k, v)
                is Int -> e.putInt(k, v)
                is Long -> e.putInt(k, v.toInt())
                is Double -> e.putString(k, v.toString())
                is String -> e.putString(k, v)
                else -> e.putString(k, v?.toString())
            }
        }
        e.apply()
    }

    fun get(k: String) = prefs.getString(k, null)
    fun getBool(k: String, d: Boolean) = prefs.getBoolean(k, d)
    fun getInt(k: String, d: Int) = prefs.getInt(k, d)
    fun getSet(k: String): Set<String> = prefs.getStringSet(k, emptySet()) ?: emptySet()
    fun putSet(k: String, s: Set<String>) { prefs.edit().putStringSet(k, s).apply() }

    private fun getKey(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getKey(ALIAS, null) as? SecretKey)?.let { return it }
        val kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        kg.init(
            KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .build()
        )
        return kg.generateKey()
    }

    private fun putPin(e: SharedPreferences.Editor, k: String, plain: String) {
        if (plain.isBlank()) { e.putString(k, ""); return }
        try {
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.ENCRYPT_MODE, getKey())
            val iv = cipher.iv
            val ct = cipher.doFinal(plain.toByteArray(Charsets.UTF_8))
            e.putString(k, Base64.encodeToString(iv + ct, Base64.NO_WRAP))
        } catch (ex: Exception) {
            e.putString(k, "")
        }
    }

    fun getPin(k: String): String? {
        val raw = prefs.getString(k, null) ?: return null
        if (raw.isEmpty()) return ""
        return try {
            val bytes = Base64.decode(raw, Base64.NO_WRAP)
            val iv = bytes.copyOfRange(0, 12)
            val ct = bytes.copyOfRange(12, bytes.size)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, getKey(), GCMParameterSpec(128, iv))
            String(cipher.doFinal(ct), Charsets.UTF_8)
        } catch (ex: Exception) {
            null
        }
    }
}