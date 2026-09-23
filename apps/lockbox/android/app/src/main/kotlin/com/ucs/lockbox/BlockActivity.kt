package com.ucs.lockbox

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.view.Window
import android.widget.ImageView
import android.widget.TextView

/**
 * Full-screen, instant cover shown over a blocked app. 100% native on purpose:
 * a Flutter engine cold-start (~½–1s) would let the blocked app flash through.
 * Always has a safe path back to Home, never lands the user back on the
 * blocked activity, and never uses a hard-coded icon/name.
 */
class BlockActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        requestWindowFeature(Window.FEATURE_NO_TITLE)
        setContentView(R.layout.activity_block)

        val pkg = intent?.getStringExtra("package")
        val label = if (!pkg.isNullOrEmpty()) AppListProvider.appLabel(this, pkg) else null

        val subtitle = findViewById<TextView>(R.id.blockSubtitle)
        val icon = findViewById<ImageView>(R.id.blockAppIcon)
        val homeBtn = findViewById<TextView>(R.id.backToHome)

        if (!pkg.isNullOrEmpty()) {
            val iconB64 = AppListProvider.appIconBase64(this, pkg)
            val bmp = iconB64?.let {
                runCatching {
                    val bytes = android.util.Base64.decode(it, android.util.Base64.NO_WRAP)
                    android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                }.getOrNull()
            }
            if (bmp != null) {
                icon.setImageBitmap(bmp)
                icon.visibility = View.VISIBLE
            } else {
                icon.visibility = View.GONE
            }
            subtitle.text = if (!label.isNullOrEmpty()) {
                "$label isn't allowed on this device."
            } else {
                "This app is blocked."
            }
        } else {
            icon.visibility = View.GONE
            subtitle.text = "This app is blocked."
        }

        homeBtn.setOnClickListener { goHome() }
    }

    override fun onBackPressed() = goHome()

    private fun goHome() {
        GuardAccessibilityService.instance?.onReturnedHome()
        val home = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
        home.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
        runCatching { startActivity(home) }
        finishAffinity()
    }
}