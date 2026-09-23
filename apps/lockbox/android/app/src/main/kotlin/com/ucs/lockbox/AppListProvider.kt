package com.ucs.lockbox

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ResolveInfo
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.os.Build
import android.provider.Settings
import android.util.Base64
import java.io.ByteArrayOutputStream

/**
 * Lists every launcher-capable app and resolves always-allow packages at runtime.
 * Icons are returned as base64 PNG so Flutter can render real app icons without
 * any extra plugin.
 */
object AppListProvider {

    private const val ICON_SIZE = 96 // px, crisp on most densities

    fun installedApps(context: Context): List<Map<String, Any?>> {
        val pm = context.packageManager
        val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        val resolve = if (Build.VERSION.SDK_INT >= 33) {
            pm.queryIntentActivities(intent, PackageManager.ResolveInfoFlags.of(0))
        } else {
            @Suppress("DEPRECATION")
            pm.queryIntentActivities(intent, 0)
        }

        val allowAll = AlwaysAllow.alwaysAllowed(context)
        val entries = resolve
            .asSequence()
            .distinctBy { it.activityInfo.packageName }
            .map { ri -> entry(context, pm, ri) }
            .sortedWith(compareByDescending<Map<String, Any?>> {
                val pkg = it["package"] as String
                when {
                    pkg == context.packageName -> Int.MAX_VALUE
                    pkg in allowAll -> 0
                    it["system"] == true -> -1
                    else -> 1
                }
            }.thenBy { (it["label"] as String).lowercase() })
            .toList()
        return entries
    }

    private fun entry(context: Context, pm: PackageManager, ri: ResolveInfo): Map<String, Any?> {
        val ai = ri.activityInfo
        val pkg = ai.packageName
        val label = runCatching { ai.loadLabel(pm).toString() }.getOrDefault(pkg)
        val system = (ai.applicationInfo.flags and
            (android.content.pm.ApplicationInfo.FLAG_SYSTEM or
                android.content.pm.ApplicationInfo.FLAG_UPDATED_SYSTEM_APP)) != 0
        val iconB64 = runCatching {
            val d = ai.loadIcon(pm)
            if (d is BitmapDrawable) {
                bitmapToBase64(d.bitmap)
            } else {
                val bmp = Bitmap.createBitmap(ICON_SIZE, ICON_SIZE, Bitmap.Config.ARGB_8888)
                val canvas = Canvas(bmp)
                d.setBounds(0, 0, ICON_SIZE, ICON_SIZE)
                d.draw(canvas)
                bitmapToBase64(bmp)
            }
        }.getOrNull()

        return mapOf(
            "package" to pkg,
            "label" to label,
            "system" to system,
            "icon" to (iconB64 ?: "")
        )
    }

    private fun bitmapToBase64(bmp: Bitmap): String {
        val scaled = if (bmp.width == ICON_SIZE && bmp.height == ICON_SIZE) {
            bmp
        } else {
            Bitmap.createScaledBitmap(bmp, ICON_SIZE, ICON_SIZE, true)
        }
        val out = ByteArrayOutputStream()
        scaled.compress(Bitmap.CompressFormat.PNG, 100, out)
        return Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
    }

    fun appLabel(context: Context, pkg: String): String {
        val pm = context.packageManager
        return runCatching {
            pm.getApplicationInfo(pkg, 0).loadLabel(pm).toString()
        }.getOrDefault(pkg)
    }

    fun appIconBase64(context: Context, pkg: String): String? {
        val pm = context.packageManager
        return runCatching {
            val d = pm.getApplicationInfo(pkg, 0).loadIcon(pm)
            val bmp = if (d is BitmapDrawable) {
                d.bitmap
            } else {
                val b = Bitmap.createBitmap(ICON_SIZE, ICON_SIZE, Bitmap.Config.ARGB_8888)
                val c = Canvas(b)
                d.setBounds(0, 0, ICON_SIZE, ICON_SIZE)
                d.draw(c)
                b
            }
            bitmapToBase64(bmp)
        }.getOrNull()
    }

    /**
     * Latest visible drawable from a package list item (service-only apps that
     * report a default icon may fail lookup — that is expected and handled).
     */
    @Suppress("unused")
    private fun resolveLabel(ri: ResolveInfo): Drawable? = null
}