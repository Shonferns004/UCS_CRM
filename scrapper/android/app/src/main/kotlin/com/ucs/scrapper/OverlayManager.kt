package com.ucs.scrapper

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import android.os.Handler
import android.os.Looper
import android.util.Log

/**
 * A floating, movable "Capture" overlay that stays above any app until it is
 * toggled off, the app is deleted, or the device powers off. The overlay is
 * hidden while the screen is locked and restored when unlocked.
 *
 * The overlay has a payment-method dropdown and a movable "Capture" handle.
 * Tapping "Capture" scrapes the current transaction detail screen (via the
 * accessibility service) and uploads it to the backend.
 */
object OverlayManager {
    private const val TAG = "UcsOverlay"

    val PAYMENT_METHODS = listOf("Google Pay", "PhonePe", "Paytm", "Other")

    private var windowManager: WindowManager? = null
    private var overlayView: LinearLayout? = null

    private var xPx = 16
    private var yPx = 240
    private var opacity = 1.0f

    @Volatile var lastCaptureRef: String? = null
        internal set

    // Synthetic view ids (not needed as XML, just to find children).
    private val captureId = 0x51a00001
    private val moveHandleId = 0x51a00002

    private var modalView: View? = null
    private var toastView: View? = null

    private val screenReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            when (intent?.action) {
                Intent.ACTION_SCREEN_OFF -> hide()

                Intent.ACTION_USER_PRESENT -> {
                    if (ScraperConfig.getBool("overlayEnabled", false)) {
                        show(context ?: return)
                    }
                }

                Intent.ACTION_SCREEN_ON -> {
                    // handled by USER_PRESENT
                }
            }
        }
    }

    fun init(context: Context) {
        windowManager =
            context.getSystemService(Context.WINDOW_SERVICE) as? WindowManager

        try {
            val filter = IntentFilter().apply {
                addAction(Intent.ACTION_SCREEN_OFF)
                addAction(Intent.ACTION_SCREEN_ON)
                addAction(Intent.ACTION_USER_PRESENT)
            }

            context.registerReceiver(screenReceiver, filter)
        } catch (ex: Exception) {
            Log.w(TAG, "receiver register failed: " + ex.message)
        }
    }

    fun isShowing(): Boolean = overlayView != null

    fun start(context: Context) {
        if (overlayView == null) show(context)
    }

    fun show(context: Context) {
        val wm = windowManager ?: return
        if (overlayView != null) return

        val displayMetrics = context.resources.displayMetrics

        xPx = ScraperConfig.get("overlayX")?.toIntOrNull() ?: 16

        yPx = ScraperConfig.get("overlayY")?.toIntOrNull()
            ?: (displayMetrics.heightPixels / 4)

        opacity = (ScraperConfig.get("overlayOpacity")?.toFloatOrNull())
            ?: 1.0f

        val layout = buildOverlay(context)

        if (!sourcesLoaded) loadSources()

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                    WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        )

        params.gravity = Gravity.TOP or Gravity.START
        params.x = xPx
        params.y = yPx
        params.alpha = opacity

        try {
            wm.addView(layout, params)
            overlayView = layout
        } catch (ex: Exception) {
            Log.w(TAG, "show failed: " + ex.message)
        }
    }

    fun hide() {
        val wm = windowManager ?: return
        val v = overlayView ?: return

        try {
            ScraperConfig.setAll(
                mapOf(
                    "overlayX" to xPx.toString(),
                    "overlayY" to yPx.toString()
                )
            )

            wm.removeView(v)
        } catch (ex: Exception) {
            Log.w(TAG, "hide failed: " + ex.message)
        }

        overlayView = null
        dismissPaymentModal()
    }

    fun setEnabled(context: Context, enabled: Boolean) {
        ScraperConfig.setAll(
            mapOf("overlayEnabled" to enabled)
        )

        if (enabled) {
            start(context)
        } else {
            hide()
        }
    }

    fun setPaymentMethod(method: String) {
        ScraperConfig.setAll(
            mapOf("paymentMethod" to method)
        )
    }

    fun setOverlayOpacity(context: Context, value: Float) {
        opacity = value.coerceIn(0.0f, 1.0f)
        ScraperConfig.setAll(
            mapOf("overlayOpacity" to opacity.toString())
        )

        val v = overlayView ?: return
        val wm = windowManager ?: return
        val lp = v.layoutParams as? WindowManager.LayoutParams ?: return
        lp.alpha = opacity
        try {
            wm.updateViewLayout(v, lp)
        } catch (ex: Exception) {
            Log.w(TAG, "opacity update failed: " + ex.message)
        }
    }

    // ============================================================
    // PAYMENT-APP PICKER MODAL
    // ============================================================

    private fun showPaymentModal(context: Context) {
        val wm = windowManager ?: return
        if (modalView != null) return

        if (!sourcesLoaded) loadSources()

        val density = context.resources.displayMetrics.density

        // Full-screen transparent touch layer.
        // Tapping anywhere outside the card closes the modal.
        val backdrop = FrameLayout(context).apply {
            setBackgroundColor(Color.TRANSPARENT)
            isClickable = true
            isFocusable = false
        }

        val panel = modalPanel(context)

        val title = TextView(context).apply {
            text = "Capture fields"
            setTextColor(Color.rgb(25, 25, 25))
            textSize = 18f
            setTypeface(Typeface.DEFAULT, Typeface.BOLD)
            gravity = Gravity.CENTER_VERTICAL
        }

        panel.addView(
            title,
            LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                (30 * density).toInt()
            )
        )

        // Small subtitle
        val subtitle = TextView(context).apply {
            text = "Select the details for this capture"
            setTextColor(Color.rgb(120, 120, 120))
            textSize = 12f
            gravity = Gravity.CENTER_VERTICAL
        }

        panel.addView(
            subtitle,
            LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                (24 * density).toInt()
            )
        )

        val bankRow = selectorRow(
            context,
            "Received Bank",
            ScraperConfig.get("receivedBank") ?: "",
            0x51a00200,
            density
        ) {
            showBankSelector(context)
        }

        panel.addView(
            bankRow,
            bankRow.layoutParams
        )

        val mopRow = selectorRow(
            context,
            "Mode of Payment",
            ScraperConfig.get("modeOfPayment") ?: "",
            0x51a00201,
            density
        ) {
            showMopSelector(context)
        }

        panel.addView(
            mopRow,
            mopRow.layoutParams
        )

        val done = TextView(context).apply {
            id = 0x51a00202

            text = "Done"

            setTextColor(Color.WHITE)
            textSize = 14f
            setTypeface(Typeface.DEFAULT, Typeface.BOLD)
            gravity = Gravity.CENTER

            isClickable = true
            contentDescription = "Close"

            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                (44 * density).toInt()
            ).apply {
                topMargin = (14 * density).toInt()
            }

            setBackgroundDrawable(
                GradientDrawable().apply {
                    shape = GradientDrawable.RECTANGLE
                    setColor(Color.rgb(25, 25, 25))
                    cornerRadius = (12 * density)
                }
            )

            setOnClickListener {
                dismissPaymentModal(context)
            }
        }

        panel.addView(
            done,
            done.layoutParams
        )

        // Add the card to the transparent full-screen backdrop.
        val panelParams = FrameLayout.LayoutParams(
            (300 * density).toInt(),
            ViewGroup.LayoutParams.WRAP_CONTENT,
            Gravity.CENTER
        )

        backdrop.addView(panel, panelParams)

        // Prevent touches inside the actual card from reaching
        // the outside-touch dismiss listener.
        panel.setOnClickListener {
            // Intentionally empty.
        }

        // Tapping the transparent area closes the modal.
        backdrop.setOnClickListener {
            dismissPaymentModal(context)
        }

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                    WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        )

        params.gravity = Gravity.TOP or Gravity.START

        try {
            wm.addView(backdrop, params)
            modalView = backdrop
        } catch (ex: Exception) {
            Log.w(TAG, "payment modal show failed: " + ex.message)
        }
    }

    private fun dismissPaymentModal(context: Context? = null) {
        val wm = windowManager ?: return
        val mv = modalView ?: return

        try {
            wm.removeView(mv)
        } catch (ex: Exception) {
        }

        modalView = null
    }

    // ============================================================
    // COMPONENTS + SOURCES FOR THE CAPTURE SETTINGS MODAL
    // ============================================================

    private var bankOptions = listOf(
        "Google Pay",
        "ICICI",
        "Axis Bank",
        "Saraswat Bank",
        "Paytm",
        "Cheque"
    )

    private var mopOptions = listOf(
        "Paytm",
        "Cheque",
        "Google Pay",
        "Razorpay"
    )

    private var sourcesLoaded = false

    private fun loadSources() {
        Thread {
            val res = ScraperUploader.sources(
                ScraperConfig.resolveBackendUrl(),
                ScraperConfig.resolveApiKey()
            )

            if (res.banks.isNotEmpty()) {
                bankOptions = res.banks
            }

            if (res.mops.isNotEmpty()) {
                mopOptions = res.mops
            }

            if (res.banks.isNotEmpty() || res.mops.isNotEmpty()) {
                sourcesLoaded = true
            }
        }.start()
    }

    // ============================================================
    // MODERN MINIMAL MODAL CARD
    // ============================================================

    private fun modalPanel(context: Context): LinearLayout {
        val density = context.resources.displayMetrics.density

        return LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL

            setPadding(
                (20 * density).toInt(),
                (20 * density).toInt(),
                (20 * density).toInt(),
                (20 * density).toInt()
            )

            setBackgroundDrawable(
                GradientDrawable().apply {
                    shape = GradientDrawable.RECTANGLE

                    setColor(Color.WHITE)

                    cornerRadius = (20 * density)

                    setStroke(
                        (1 * density).toInt(),
                        Color.rgb(235, 235, 235)
                    )
                }
            )

            elevation = (12 * density)
        }
    }

    // ============================================================
    // MODERN SELECTOR ROW
    // ============================================================

    private fun selectorRow(
        context: Context,
        label: String,
        value: String,
        viewId: Int,
        density: Float,
        action: () -> Unit
    ): TextView {

        val displayValue =
            if (value.isNotEmpty()) value else "Select"

        return TextView(context).apply {
            id = viewId

            text = "$label\n$displayValue"

            setTextColor(Color.rgb(35, 35, 35))
            textSize = 13f

            gravity = Gravity.CENTER_VERTICAL

            setPadding(
                (16 * density).toInt(),
                0,
                (16 * density).toInt(),
                0
            )

            isClickable = true
            contentDescription = "Open $label list"

            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                (56 * density).toInt()
            ).apply {
                topMargin = (12 * density).toInt()
            }

            setBackgroundDrawable(
                GradientDrawable().apply {
                    shape = GradientDrawable.RECTANGLE

                    setColor(Color.rgb(248, 248, 248))

                    cornerRadius = (12 * density)

                    setStroke(
                        (1 * density).toInt(),
                        Color.rgb(230, 230, 230)
                    )
                }
            )

            setOnClickListener {
                action()
            }
        }
    }

    // ============================================================
    // OPTION ROW
    // ============================================================

    private fun optionRow(
        context: Context,
        name: String,
        viewId: Int,
        density: Float
    ): TextView {

        return TextView(context).apply {
            id = viewId

            text = name

            setTextColor(Color.rgb(35, 35, 35))
            textSize = 14f

            gravity = Gravity.CENTER_VERTICAL

            setPadding(
                (16 * density).toInt(),
                0,
                (16 * density).toInt(),
                0
            )

            isClickable = true
            contentDescription = "Select $name"

            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                (48 * density).toInt()
            ).apply {
                topMargin = (6 * density).toInt()
            }

            setBackgroundDrawable(
                GradientDrawable().apply {
                    shape = GradientDrawable.RECTANGLE

                    setColor(Color.rgb(248, 248, 248))

                    cornerRadius = (12 * density)

                    setStroke(
                        (1 * density).toInt(),
                        Color.rgb(232, 232, 232)
                    )
                }
            )
        }
    }

    // ============================================================
    // BANK SELECTOR
    // ============================================================

    private fun showBankSelector(context: Context) {
        dismissPaymentModal(context)

        val wm = windowManager ?: return
        val density = context.resources.displayMetrics.density

        val backdrop = FrameLayout(context).apply {
            setBackgroundColor(Color.TRANSPARENT)
            isClickable = true
        }

        val panel = optionListPanel(
            context,
            "Received Bank"
        )

        for ((i, name) in bankOptions.withIndex()) {
            val opt = optionRow(
                context,
                name,
                0x51a00300 or i,
                density
            )

            opt.setOnClickListener {
                ScraperConfig.setAll(
                    mapOf("receivedBank" to name)
                )

                dismissPaymentModal(context)
                showPaymentModal(context)
            }

            panel.addView(
                opt,
                opt.layoutParams
            )
        }

        val panelParams = FrameLayout.LayoutParams(
            (300 * density).toInt(),
            ViewGroup.LayoutParams.WRAP_CONTENT,
            Gravity.CENTER
        )

        backdrop.addView(
            panel,
            panelParams
        )

        // Don't close when touching the card.
        panel.setOnClickListener {
            // Intentionally empty.
        }

        // Close when touching outside.
        backdrop.setOnClickListener {
            dismissPaymentModal(context)
        }

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                    WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        )

        params.gravity = Gravity.TOP or Gravity.START

        try {
            wm.addView(backdrop, params)
            modalView = backdrop
        } catch (ex: Exception) {
            Log.w(TAG, "bank selector show failed: " + ex.message)
        }
    }

    // ============================================================
    // MODE OF PAYMENT SELECTOR
    // ============================================================

    private fun showMopSelector(context: Context) {
        dismissPaymentModal(context)

        val wm = windowManager ?: return
        val density = context.resources.displayMetrics.density

        val backdrop = FrameLayout(context).apply {
            setBackgroundColor(Color.TRANSPARENT)
            isClickable = true
        }

        val panel = optionListPanel(
            context,
            "Mode of Payment"
        )

        for ((i, name) in mopOptions.withIndex()) {
            val opt = optionRow(
                context,
                name,
                0x51a00400 or i,
                density
            )

            opt.setOnClickListener {
                ScraperConfig.setAll(
                    mapOf("modeOfPayment" to name)
                )

                dismissPaymentModal(context)
                showPaymentModal(context)
            }

            panel.addView(
                opt,
                opt.layoutParams
            )
        }

        val panelParams = FrameLayout.LayoutParams(
            (300 * density).toInt(),
            ViewGroup.LayoutParams.WRAP_CONTENT,
            Gravity.CENTER
        )

        backdrop.addView(
            panel,
            panelParams
        )

        // Don't close when touching the card.
        panel.setOnClickListener {
            // Intentionally empty.
        }

        // Close when touching outside.
        backdrop.setOnClickListener {
            dismissPaymentModal(context)
        }

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                    WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        )

        params.gravity = Gravity.TOP or Gravity.START

        try {
            wm.addView(backdrop, params)
            modalView = backdrop
        } catch (ex: Exception) {
            Log.w(TAG, "mop selector show failed: " + ex.message)
        }
    }

    // ============================================================
    // OPTION LIST CARD
    // ============================================================

    private fun optionListPanel(
        context: Context,
        header: String
    ): LinearLayout {

        val density = context.resources.displayMetrics.density

        val panel = modalPanel(context)

        val title = TextView(context).apply {
            text = header

            setTextColor(Color.rgb(25, 25, 25))
            textSize = 18f

            setTypeface(
                Typeface.DEFAULT,
                Typeface.BOLD
            )

            gravity = Gravity.CENTER_VERTICAL
        }

        panel.addView(
            title,
            LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                (32 * density).toInt()
            )
        )

        return panel
    }

    // ============================================================
    // MINIMALIST OVERLAY UI
    // ============================================================

    private fun buildOverlay(context: Context): LinearLayout {
        val density = context.resources.displayMetrics.density

        // Completely transparent root.
        val root = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(0, 0, 0, 0)
            setBackgroundColor(Color.TRANSPARENT)
        }

        // --------------------------------------------------------
        // Small drag handle
        // --------------------------------------------------------

        val handle = TextView(context).apply {
            id = moveHandleId

            text = "•••"

            setTextColor(Color.WHITE)
            textSize = 14f
            gravity = Gravity.CENTER

            isClickable = true
            contentDescription = "Move overlay (drag)"

            layoutParams = LinearLayout.LayoutParams(
                (44 * density).toInt(),
                (28 * density).toInt()
            )

            setBackgroundDrawable(
                GradientDrawable().apply {
                    shape = GradientDrawable.RECTANGLE

                    setColor(
                        Color.argb(
                            220,
                            25,
                            25,
                            25
                        )
                    )

                    cornerRadius = (10 * density)
                }
            )

            var dragging = false

            setOnTouchListener { _, event ->
                when (event.action) {

                    MotionEvent.ACTION_DOWN -> {
                        dragging = false
                        true
                    }

                    MotionEvent.ACTION_MOVE -> {
                        val wm = windowManager
                            ?: return@setOnTouchListener true

                        val lp = overlayView?.layoutParams
                            as? WindowManager.LayoutParams
                            ?: return@setOnTouchListener true

                        lp.x = (event.rawX - lp.width / 2f)
                            .toInt()
                            .coerceAtLeast(0)

                        lp.y = (event.rawY - lp.height / 2f)
                            .toInt()
                            .coerceAtLeast(0)

                        wm.updateViewLayout(
                            overlayView,
                            lp
                        )

                        xPx = lp.x
                        yPx = lp.y

                        dragging = true

                        true
                    }

                    MotionEvent.ACTION_UP -> {
                        if (!dragging) {
                            showPaymentModal(context)
                        } else {
                            val wm = windowManager
                                ?: return@setOnTouchListener true

                            val lp = overlayView?.layoutParams
                                as? WindowManager.LayoutParams
                                ?: return@setOnTouchListener true

                            // Snap to the nearest side edge so the overlay
                            // never rests floating in the middle horizontally,
                            // but keep a little breathing space off the edge.
                            val dm = context.resources.displayMetrics
                            val screenW = dm.widthPixels
                            val screenH = dm.heightPixels
                            val edgeMargin = (16 * dm.density).toInt()

                            val leftDist = lp.x
                            val rightDist = screenW - (lp.x + lp.width)
                            lp.x = if (rightDist < leftDist)
                                screenW - lp.width - edgeMargin else edgeMargin

                            lp.y = lp.y.coerceIn(
                                (6 * dm.density).toInt(),
                                screenH - lp.height - (6 * dm.density).toInt()
                            )

                            wm.updateViewLayout(
                                overlayView,
                                lp
                            )

                            xPx = lp.x
                            yPx = lp.y
                        }

                        false
                    }

                    else -> false
                }
            }
        }

        root.addView(
            handle,
            handle.layoutParams
        )

        // --------------------------------------------------------
        // Minimal circular Capture button
        // --------------------------------------------------------

        val btn = TextView(context).apply {
            id = captureId

            text = "●"

            setTextColor(Color.BLACK)
            textSize = 16f
            gravity = Gravity.CENTER

            isClickable = true
            contentDescription = "Capture transaction"

            layoutParams = LinearLayout.LayoutParams(
                (46 * density).toInt(),
                (46 * density).toInt()
            ).apply {
                topMargin = (18 * density).toInt()
            }

            setBackgroundDrawable(
                GradientDrawable().apply {
                    shape = GradientDrawable.OVAL

                    setColor(Color.WHITE)

                    setStroke(
                        (1 * density).toInt(),
                        Color.argb(
                            70,
                            0,
                            0,
                            0
                        )
                    )
                }
            )

            elevation = (5 * density)

            setOnClickListener {
                captureNow()
            }
        }

        root.addView(
            btn,
            btn.layoutParams
        )

        return root
    }

    // ============================================================
    // EXISTING CAPTURE LOGIC — UNCHANGED
    // ============================================================

    fun captureNow() {
        val svc = ScraperAccessibilityService.instance

        if (svc == null) {
            emitResult(
                false,
                null,
                "Accessibility service is not connected — enable it and reopen the overlay."
            )
            return
        }

        // Hide the overlay first so focus returns to the underlying payment app,
        // then capture after a short delay so rootInActiveWindow is readable.
        hide()

        Handler(Looper.getMainLooper()).postDelayed({
            svc.captureTransaction()

            // Always bring the overlay back (show() is a no-op if already visible),
            // even when the capture reported a failure message.
            Handler(Looper.getMainLooper()).postDelayed({
                show(svc)
            }, 2500)
        }, 350)
    }

    fun emitResult(
        added: Boolean,
        ref: String?,
        message: String
    ) {
        val svc = ScraperAccessibilityService.instance
        val ctx = (svc as? Context)?.applicationContext

        if (ctx != null) {
            showResultToast(ctx, added, message)
        } else {
            Log.w(TAG, "emitResult: no accessibility service context — toast skipped")
        }

        ServiceBridge.emit(
            mapOf(
                "type" to "captured",
                "added" to added,
                "message" to message,
                "ref" to (ref ?: "")
            )
        )
    }

    fun dismissResultToast() {
        val v = toastView ?: return
        val wm = windowManager ?: ((ScraperAccessibilityService.instance as? Context)
            ?.getSystemService(Context.WINDOW_SERVICE) as? WindowManager) ?: return
        toastView = null
        try {
            wm.removeView(v)
        } catch (ex: Exception) {
            Log.w(TAG, "dismissResultToast failed: " + ex.message)
        }
    }

    /**
     * Shows a small, dismissible toast as a system overlay so it is visible
     * above any app (even while capturing inside GPay). Tapping it dismisses
     * it immediately; otherwise it hides itself after a couple of seconds.
     */
    fun showResultToast(
        context: Context,
        added: Boolean,
        message: String
    ) {
        Handler(Looper.getMainLooper()).post {
            dismissResultToast()

            val wm = context.getSystemService(Context.WINDOW_SERVICE) as? WindowManager
                ?: return@post

            val density = context.resources.displayMetrics.density

            val display = wm.defaultDisplay
            val point = android.graphics.Point()
            display?.getRealSize(point)

            val view = LinearLayout(context).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER
                isClickable = true
                setOnClickListener { dismissResultToast() }
                setBackgroundDrawable(
                    GradientDrawable().apply {
                        shape = GradientDrawable.RECTANGLE
                        cornerRadius = (18 * density)
                        // success = white pill, otherwise neutral dark pill
                        setColor(if (added) Color.rgb(255, 255, 255) else Color.argb(235, 30, 30, 30))
                        setStroke((1 * density).toInt(), if (added) Color.argb(255, 0, 0, 0) else Color.argb(70, 255, 255, 255))
                    }
                )
            }

            val text = TextView(context).apply {
                text = if (added)
                    "Imported successfully"
                else
                    message.ifBlank { "Capture failed" }
                // success toast uses dark text on the white pill
                setTextColor(if (added) Color.rgb(20, 20, 20) else Color.WHITE)
                textSize = 13f
                maxLines = 2
                setTypeface(Typeface.DEFAULT, Typeface.BOLD)
                gravity = Gravity.CENTER
                setPadding(
                    (18 * density).toInt(),
                    (10 * density).toInt(),
                    (18 * density).toInt(),
                    (10 * density).toInt()
                )
            }

            view.addView(
                text,
                LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                )
            )

            val w = (if (point != null) point.x * 0.72 else 300 * density).toInt()
            val params = WindowManager.LayoutParams(
                w,
                WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                        WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                PixelFormat.TRANSLUCENT
            )
            params.gravity = Gravity.CENTER or Gravity.BOTTOM
            params.y = (70 * density).toInt()

            try {
                wm.addView(view, params)
                toastView = view
            } catch (ex: Exception) {
                Log.w(TAG, "toast overlay show failed: " + ex.message)
                return@post
            }

            Handler(Looper.getMainLooper()).postDelayed({
                dismissResultToast()
            }, 2500)
        }
    }

    fun cleanup(context: Context) {
        dismissResultToast()
        hide()
        dismissPaymentModal()

        try {
            context.unregisterReceiver(screenReceiver)
        } catch (ex: Exception) {
        }

        windowManager = null
    }
}