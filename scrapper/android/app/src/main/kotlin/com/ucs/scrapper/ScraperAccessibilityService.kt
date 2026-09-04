package com.ucs.scrapper

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.graphics.Path
import android.graphics.Rect
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.util.Log
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale

class ScraperAccessibilityService : AccessibilityService() {

    enum class Stage { IDLE, UNLOCK, LAUNCH, GPAY_PIN, COLLECT, DETAIL, UPLOAD, DONE, ERROR, PAUSED }

    companion object {
        @Volatile var instance: ScraperAccessibilityService? = null
            private set
        val GPAY_PACKAGES = listOf(
            "com.google.android.apps.nbu.paisa.user", // current GPay / Google Pay (India)
            "com.google.android.apps.nbu.paisa",      // legacy Google Pay (Tez)
        )
    }

    private val handler = Handler(Looper.getMainLooper())
    private val ticker = object : Runnable {
        override fun run() {
            if (running) {
                try { tick() } catch (t: Throwable) { emit("error", mapOf("message" to (t.message ?: "tick error"))) }
            }
            handler.postDelayed(this, 800L)
        }
    }

    @Volatile private var running = false
    @Volatile private var captureInFlight = false
    private var stage: Stage = Stage.IDLE
    private var inspectMode = false

    /**
     * Transaction reference recovered by the Paytm parser from its copy-toast
     * during [TransactionParser.surfaceHiddenText]. Persisted on the service
     * (a singleton) because a fresh parser instance is built for each call;
     * reset once per capture and read back by the parser's [parse] step.
     */
    @Volatile internal var recoveredRef: String? = null

    private var devicePin = ""
    private var gpayPin = ""
    private var gpayLockType = "pin"
    private var projectId = ""
    private var deviceLabel = ""
    private var backendUrl = ""
    private var apiKey = ""
    private var receivedOnly = true
    private var maxTx = 200
    private var maxScrolls = 8
    private var historyText = "All activity"
    private var cutoffDate: String? = null
    private var hitCutoff = false

    private var pinIndex = 0
    private var pinDone = false
    private var waitTicks = 0
    private var scrollCount = 0
    private var listEntered = false
    private var listWaitTicks = 0
    private var linkSearchTicks = 0
    private val linkSearchMax = 60
    private var detailPhase = 0
    private var detailWaitTicks = 0
    private var detailTapAttempts = 0
    private var pendingDetail: ScrapedTxn? = null
    private var blockedNotified = false
    private var blockedSince = 0L

    private val collected = mutableListOf<ScrapedTxn>()
    private val seenRefs = HashSet<String>()
    private val knownRefs = HashSet<String>()
    private var lastHeaderDate: String? = null
    private var revisitCount = 0

    private var training = false
    private val trainedSteps = mutableListOf<TrainedStep>()
    private var trainLastAt = 0L
    private var trainedFlow: List<TrainedStep> = emptyList()
    private var replayIdx = 0
    private var stepCooldown = 0
    private var flowDone = false
    private var linkCooldown = 0

    private var wakeLock: PowerManager.WakeLock? = null
    private var runId = ""
    private var uploadResult: String? = null

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        ScraperConfig.init(this)
        OverlayManager.init(this)
        if (ScraperConfig.getBool("overlayEnabled", false)) {
            handler.post { OverlayManager.start(this) }
        }
        emit("connected", emptyMap())
    }

    override fun onUnbind(intent: Intent?): Boolean {
        instance = null
        stopRun()
        return super.onUnbind(intent)
    }

    override fun onInterrupt() {}

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (!training || event == null) return
        val pkg = event.packageName?.toString() ?: return
        if (!pkg.contains("nbu.paisa")) return
        val now = System.currentTimeMillis()
        when (event.eventType) {
            AccessibilityEvent.TYPE_VIEW_CLICKED -> {
                val src = event.source ?: return
                val t = src.text?.toString()?.trim() ?: ""
                val d = src.contentDescription?.toString()?.trim() ?: ""
                if (t.isEmpty() && d.isEmpty()) return
                val last = trainedSteps.lastOrNull()
                if (last != null && last.type == "click" && now - trainLastAt < 900 &&
                    last.text == t && last.desc == d) return
                trainLastAt = now
                val b = Rect()
                src.getBoundsInScreen(b)
                val dm = resources.displayMetrics
                trainedSteps.add(TrainedStep().apply {
                    type = "click"; text = t; desc = d; cls = src.className?.toString() ?: ""
                    relX = if (dm.widthPixels > 0) b.centerX().toFloat() / dm.widthPixels else 0f
                    relY = if (dm.heightPixels > 0) b.centerY().toFloat() / dm.heightPixels else 0f
                })
                emitTraining()
            }
            AccessibilityEvent.TYPE_VIEW_SCROLLED -> {
                val last = trainedSteps.lastOrNull()
                if (last == null || last.type != "swipe" || now - trainLastAt > 1500) {
                    trainedSteps.add(TrainedStep().apply { type = "swipe" })
                    trainLastAt = now
                    emitTraining()
                }
            }
        }
    }

    fun startTraining() {
        training = true
        trainedSteps.clear()
        trainLastAt = 0L
        trainingSessionStarted()
        emit("training", mapOf("state" to "on", "steps" to 0))
    }

    fun stopTraining(): Int {
        training = false
        ScraperConfig.setAll(mapOf("trainedFlow" to TrainedStep.save(trainedSteps)))
        val n = trainedSteps.size
        emit("training", mapOf("state" to "off", "steps" to n))
        return n
    }

    fun isTraining(): Boolean = training
    fun trainedCount(): Int = trainedSteps.size

    private fun trainingSessionStarted() {
        val km = getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
        if (km.isKeyguardLocked) {
            emit("status", mapOf("message" to "Unlock the phone, open Google Pay, then do the flow with your finger. Taps and scrolls are recorded."))
            return
        }
        val intent = GPAY_PACKAGES.asSequence()
            .map { packageManager.getLaunchIntentForPackage(it) }
            .firstOrNull { it != null }
        if (intent != null) {
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            startActivity(intent)
        }
        emit("status", mapOf("message" to "Training ON. Do the flow manually: open See all transactions, tap a transaction, scroll back up. Then press Stop & save."))
    }

    private fun emitTraining() {
        ServiceBridge.emit(mapOf("type" to "training", "steps" to trainedSteps.size))
    }

    fun setInspectMode(on: Boolean) { inspectMode = on }

    fun startRun(backendUrl: String, apiKey: String) {
        val c = ScraperConfig
        devicePin = c.getPin("devicePin") ?: ""
        gpayPin = c.getPin("gpayPin") ?: ""
        gpayLockType = c.get("gpayLockType") ?: "pin"
        projectId = c.get("projectId") ?: ""
        deviceLabel = c.get("deviceLabel") ?: ""
        this.backendUrl = backendUrl.ifBlank { ScraperConfig.resolveBackendUrl() }
        this.apiKey = apiKey.ifBlank { ScraperConfig.resolveApiKey() }
        ScraperConfig.setAll(mapOf(
            "backendUrl" to this.backendUrl,
            "apiKey" to this.apiKey
        ))
        receivedOnly = c.getBool("receivedOnly", true)
        maxTx = c.getInt("maxTransactions", 200)
        maxScrolls = c.getInt("scrollLoops", 8)
        historyText = c.get("historyText") ?: "All activity"
        maxScrolls = 40
        val cal = Calendar.getInstance()
        cal.add(Calendar.DAY_OF_YEAR, -1)
        cutoffDate = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(cal.time)
        hitCutoff = false

        collected.clear(); seenRefs.clear()
        knownRefs.clear()
        Thread {
            val remote = ScraperUploader.knownRefs(backendUrl, apiKey, projectId)
            if (remote.isNotEmpty()) handler.post { knownRefs.addAll(remote) }
        }.start()
        pinIndex = 0; pinDone = false; waitTicks = 0; scrollCount = 0; revisitCount = 0
listEntered = false; listWaitTicks = 0; linkSearchTicks = 0
        detailPhase = 0; detailWaitTicks = 0; detailTapAttempts = 0; pendingDetail = null
        lastHeaderDate = null
        trainedFlow = TrainedStep.load(ScraperConfig.get("trainedFlow"))
        replayIdx = 0; stepCooldown = 0; flowDone = false; linkCooldown = 0
        runId = "run-${deviceLabel.ifBlank { "phone" }}-${System.currentTimeMillis()}"

        if (devicePin.isBlank()) {
            emit("error", mapOf("message" to "Phone lock PIN must be set."))
            return
        }
        if (gpayLockType == "pin" && gpayPin.isBlank()) {
            emit("error", mapOf("message" to "Google Pay passcode must be set (or switch GPay lock to Fingerprint/Face)."))
            return
        }
        if (projectId.isBlank() || deviceLabel.isBlank()) {
            emit("error", mapOf("message" to "Phone label and NGO/project must be set."))
            return
        }
        blockedNotified = false
        blockedSince = 0L

        running = true
        stage = Stage.UNLOCK
        acquireKeepOn()
        emit("started", mapOf("run_id" to runId))
        handler.removeCallbacksAndMessages(ticker)
        handler.post(ticker)
        try { tick() } catch (t: Throwable) {}
    }

    fun stopRun(uploadCollected: Boolean = false) {
        if (uploadCollected && running && collected.isNotEmpty()) {
            finishUpload("stopped manually")
            return
        }
        running = false
        handler.removeCallbacksAndMessages(ticker)
        releaseKeepOn()
        stage = Stage.IDLE
        ServiceBridge.emit(mapOf("type" to "stopped"))
    }

    fun isRunning(): Boolean = running

    // ---------- tick ----------

    private fun tick() {
        val root = rootInActiveWindow ?: run {
            emit("status", mapOf("message" to "no window"))
            return
        }
        if (inspectMode) {
            emitInspect(root)
            return
        }
        if (handleBlocker(root)) return

        var next: Stage? = null
        when (stage) {
            Stage.UNLOCK -> next = stepUnlock(root)
            Stage.LAUNCH -> next = stepLaunch(root)
            Stage.GPAY_PIN -> next = stepGpayPin(root)
            Stage.COLLECT -> next = stepCollect(root)
            Stage.DETAIL -> next = stepDetail(root)
            Stage.UPLOAD -> {}
            else -> {}
        }
        if (next != null && next != stage) {
            stage = next
            emitStage()
        }
    }

    private fun emitStage() {
        ServiceBridge.emit(mapOf(
            "type" to "stage",
            "stage" to stage.name,
            "collected" to collected.size,
            "run_id" to runId
        ))
    }

    private fun emit(type: String, extra: Map<String, Any?>) {
        val m = HashMap<String, Any?>()
        m["type"] = type
        m["stage"] = stage.name
        m.putAll(extra)
        ServiceBridge.emit(m)
    }

    private fun setError(msg: String) {
        stage = Stage.ERROR
        running = false
        releaseKeepOn()
        emit("error", mapOf("message" to msg))
    }

    // ---------- steps ----------

    private fun stepUnlock(root: AccessibilityNodeInfo): Stage {
        val km = getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
        if (!km.isKeyguardLocked) return Stage.LAUNCH
        if (devicePin.isBlank()) { setError("Phone is locked but no device PIN set."); return Stage.IDLE }
        if (pinIndex < devicePin.length) {
            tapDigit(devicePin[pinIndex], root)
            pinIndex++
        } else {
            pinIndex = 0
        }
        return Stage.UNLOCK
    }

    private fun stepLaunch(root: AccessibilityNodeInfo): Stage {
        val pkg = root.packageName ?: ""
        if (pkg.contains("nbu.paisa")) {
            return if (gpayLockType == "pin" && gpayPin.isNotBlank()) Stage.GPAY_PIN else Stage.COLLECT
        }
        if (waitTicks < 1) { // one launch attempt per app-open
            val intent = GPAY_PACKAGES.asSequence()
                .map { packageManager.getLaunchIntentForPackage(it) }
                .firstOrNull { it != null }
            if (intent == null) { setError("Google Pay is not installed on this phone."); return Stage.IDLE }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            startActivity(intent)
        }
        waitTicks++
        if (waitTicks > 20) setError("Could not open Google Pay (screen: $pkg).")
        return Stage.LAUNCH
    }

    private fun stepGpayPin(root: AccessibilityNodeInfo): Stage {
        if (!hasDigitPad(root)) {
            if (pinDone) { waitTicks++; if (waitTicks > 2) { pinDone = false; waitTicks = 0; return Stage.COLLECT } }
            waitTicks++
            if (waitTicks > 12) { pinDone = false; waitTicks = 0; return Stage.COLLECT }
            return Stage.GPAY_PIN
        }
        waitTicks = 0
        if (pinDone) {
            // pad still visible after pin typed; wait for it to advance
            waitTicks++
            if (waitTicks > 6) { pinDone = false; waitTicks = 0; return Stage.COLLECT }
            return Stage.GPAY_PIN
        }
        if (pinIndex < gpayPin.length) {
            tapDigit(gpayPin[pinIndex], root)
            pinIndex++
        } else {
            pinDone = true
            waitTicks = 0
        }
        return Stage.GPAY_PIN
    }

    private fun stepCollect(root: AccessibilityNodeInfo): Stage {
        // A previously recorded flow is only a rough hint and can become
        // stale as GPay changes its UI. Never replay it during a normal run:
        // replaying arbitrary old coordinates/text matches caused random
        // clicks and swipes instead of opening transaction rows.
        flowDone = true

        // A run may start while GPay is still showing the last detail page.
        // Return to history first instead of searching that page for a list.
        if (!listEntered && isTransactionDetailScreen(root)) {
            emit("info", mapOf("message" to "Returning from transaction detail to history"))
            performGlobalAction(GLOBAL_ACTION_BACK)
            linkCooldown = 2
            return Stage.COLLECT
        }

if (!listEntered) {
            if (linkCooldown > 0) {
                linkCooldown--
            } else if (linkSearchTicks < linkSearchMax) {
                linkSearchTicks++
                val seeAll = findNode(root) {
                    val d = it.contentDescription?.toString()?.trim() ?: ""
                    val t = it.text?.toString()?.trim() ?: ""
                    (it.isClickable || it.isLongClickable) && (d.equals("See all", true) || t.equals("See all", true))
                }
                if (seeAll != null) {
                    emit("info", mapOf("message" to "Opening full transactions list"))
                    seeAll.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                    linkCooldown = 6
                    linkSearchTicks = 0
                    listWaitTicks = 0
                    return Stage.COLLECT
                }
                val link = findLinkToTransactions(root)
                if (link != null) {
                    emit("info", mapOf("message" to "Navigating to transaction history"))
                    link.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                    linkCooldown = 6
                    linkSearchTicks = 0
                    listWaitTicks = 0
                    return Stage.COLLECT
                }
                // Not on the transaction list yet — likely GPay's home screen, where
                // the "See all" / history entry is below the fold. Scroll down each
                // tick to reveal it instead of waiting for a manual scroll.
val pkg = root.packageName?.toString() ?: ""
                if (pkg.contains("nbu.paisa")) {
                    emit("info", mapOf("message" to "Scrolling GPay home screen to find the transaction history link"))
                    swipeUp()
                }
            }
        }
        val rows = mutableListOf<AccessibilityNodeInfo>()
        collectRows(root, rows)
        if (!listEntered) {
            if (isLikelyTransactionListScreen(root, rows.size) &&
                rows.any { it.isVisibleToUser && parseRow(it) != null }) {
                listEntered = true
                listWaitTicks = 0
                emit("info", mapOf("message" to "Transaction list is ready"))
            } else {
                listWaitTicks++
                if (listWaitTicks > 20) {
                    setError("Google Pay transaction list did not load. Open GPay and check that transaction history is available.")
                }
                return Stage.COLLECT
            }
        }
        lastHeaderDate = null
        for (row in rows) {
            if (!row.isVisibleToUser) continue
            val header = parseHeader(row)
            if (header != null) {
                lastHeaderDate = header
                if (cutoffDate != null && header < cutoffDate!!) {
                    hitCutoff = true
                    break
                }
                continue
            }
            val txn = parseRow(row) ?: continue
            if (cutoffDate != null && txn.transactionDate != null && txn.transactionDate!! < cutoffDate!!) {
                hitCutoff = true
                break
            }
            if (!txn.received && receivedOnly) continue

            val ref = txn.paymentId?.filterNot { it == ' ' }
            val refOk = !ref.isNullOrBlank() && ref.length >= 12 && !ref.uppercase().contains("X")
            val alreadySeen = refOk && (ref in seenRefs || ref in knownRefs)
            // Open every transaction's detail page so the full detail (date, UPI
            // ref, payer) is always extracted from the screen rather than relying
            // on the list header date, which is frequently missing.
            if (!alreadySeen && pendingDetail == null && txn.received && clickableAncestor(row) != null) {
                pendingDetail = txn
            } else if (refOk) {
                seenRefs.add(ref)
                collected.add(txn)
            }
        }

        emit("collected", mapOf("count" to collected.size))

        if (pendingDetail != null) {
            detailPhase = 0
            detailTapAttempts = 0
            return Stage.DETAIL
        }
        if (hitCutoff) {
            finishUpload("scanned all of today & yesterday")
            return Stage.IDLE
        }
        if (collected.size >= maxTx) {
            finishUpload("reached max ${maxTx} transactions")
            return Stage.IDLE
        }
        if (scrollCount >= maxScrolls) {
            finishUpload("no new rows after $maxScrolls scrolls")
            return Stage.IDLE
        }
        scrollCount++
        swipeUp()
        return Stage.COLLECT
    }

    private fun findLinkToTransactions(root: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        val patterns = listOf("see transaction history", "see all transactions", "view all transactions", "view all", "all transactions", "all activity")
        val want = (patterns + listOf(historyText.lowercase())).filter { it.length >= 3 }.toSet()
        return findNode(root) {
            val t = (it.text?.toString() ?: "").lowercase()
            val d = (it.contentDescription?.toString() ?: "").lowercase()
            (it.isClickable || it.isLongClickable) && want.any { (t + " " + d).contains(it) }
        }
    }

    private fun stepTrained(root: AccessibilityNodeInfo, steps: List<TrainedStep>): Stage {
        if (stepCooldown > 0) {
            stepCooldown--
            return Stage.COLLECT
        }
        val st = steps[replayIdx]
        when (st.type) {
            "back" -> {
                performGlobalAction(GLOBAL_ACTION_BACK)
                replayIdx++; stepCooldown = 2
                return Stage.COLLECT
            }
            "swipe" -> {
                swipeUp()
                replayIdx++; stepCooldown = 1
                return Stage.COLLECT
            }
            else -> {
                val node = findNode(root) {
                    if (!it.isVisibleToUser) return@findNode false
                    val t = (it.text?.toString() ?: "").trim()
                    val d = (it.contentDescription?.toString() ?: "").trim()
                    (st.text.isNotEmpty() && (t == st.text || (t.length >= 3 && t.contains(st.text)))) ||
                        (st.desc.isNotEmpty() && (d == st.desc || (d.length >= 3 && d.contains(st.desc))))
                }
                if (node != null) {
                    if (node.isClickable) node.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                    else {
                        val r = Rect()
                        node.getBoundsInScreen(r)
                        tap(r.centerX().toFloat(), r.centerY().toFloat())
                    }
                    replayIdx++; stepCooldown = 2
                    return Stage.COLLECT
                }
                val joined = textsJoined(root).lowercase()
                val inDetail = Regex("(transaction id|txn id|ref no|reference no|upi[- ]?ref|payment id)").containsMatchIn(joined)
                if (inDetail) {
                    performGlobalAction(GLOBAL_ACTION_BACK)
                    stepCooldown = 2
                    return Stage.COLLECT
                }
                swipeUp()
                stepCooldown = 1
                return Stage.COLLECT
            }
        }
    }

    private fun stepDetail(root: AccessibilityNodeInfo): Stage {
        when (detailPhase) {
            0 -> {
                val pd = pendingDetail ?: return Stage.COLLECT
                var tapped = false
                val rows = mutableListOf<AccessibilityNodeInfo>()
                collectRows(root, rows)
                for (row in rows) {
                    if (!row.isVisibleToUser) continue
                    val txn = parseRow(row) ?: continue
                    if (txn.amount != pd.amount) continue
                    val pn = pd.payerName?.trim()?.lowercase() ?: ""
                    val tn = txn.payerName?.trim()?.lowercase() ?: ""
                    if (pn.isNotEmpty() && tn.isNotEmpty() && !tn.contains(pn) && !pn.contains(tn)) continue
                    val clickTarget = clickableAncestor(row) ?: continue
                    if (clickTarget.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
                        tapped = true
                        break
                    }
                    // Accessibility nodes can become stale between parsing
                    // and clicking. Use the bounds of this exact row only.
                    val bounds = Rect()
                    clickTarget.getBoundsInScreen(bounds)
                    if (!bounds.isEmpty && bounds.width() > 0 && bounds.height() > 0) {
                        tap(bounds.centerX().toFloat(), bounds.centerY().toFloat())
                        tapped = true
                        break
                    }
                }
                if (tapped) {
                    emit("info", mapOf("message" to "Opening transaction detail"))
                    detailPhase = 1
                    detailWaitTicks = 0
                } else {
                    detailTapAttempts++
                    if (detailTapAttempts >= 6) {
                        emit("warning", mapOf("message" to "Could not open the transaction row; skipping it."))
                        pendingDetail = null
                        detailPhase = 0
                        detailTapAttempts = 0
                    }
                }
            }
            1 -> {
                // Wait on the transaction detail page and keep re-parsing until
                // the date (and any other detail) has been extracted, or a max
                // number of retries is reached. Do NOT press back before the
                // page has been given time to render its content.
                val detailScreen = isTransactionDetailScreen(root)
                if (detailScreen) parseDetail(root, pendingDetail)
                detailWaitTicks++
                val hasDate = !pendingDetail?.transactionDate.isNullOrBlank()
                if (hasDate || detailWaitTicks >= 8) {
                    performGlobalAction(GLOBAL_ACTION_BACK)
                    detailWaitTicks = 0
                    detailPhase = 2
                }
                // else: stay on the detail page, retry next tick.
            }
            2 -> {
                val raw = pendingDetail?.paymentId
                val ref = raw?.filterNot { it == ' ' }
                val refOk = !ref.isNullOrBlank() && ref.length >= 12 && !ref.uppercase().contains("X")
                if (refOk) {
                    val already = ref in knownRefs
                    val hasDate = !pendingDetail?.transactionDate.isNullOrBlank()
                    val txn = pendingDetail
                    if (ref in seenRefs) {
                        // same transaction re-opened (a scroll didn't move) — swipe past it
                        pendingDetail = null
                        detailPhase = 0
                        revisitCount++
                        if (revisitCount >= 5) {
                            revisitCount = 0
                            finishUpload("scanned all new rows")
                            return Stage.IDLE
                        }
                        swipeUp()
                        return Stage.COLLECT
                    }
                    seenRefs.add(ref)
                    revisitCount = 0
                    pendingDetail = null
                    detailPhase = 0
                    if (!already && hasDate && txn != null && txn !in collected) collected.add(txn)
                    emit("collected", mapOf("count" to collected.size))
                    swipeUp()
                    return Stage.COLLECT
                }
                pendingDetail = null
                detailPhase = 0
                revisitCount++
                swipeUp()
                emit("collected", mapOf("count" to collected.size))
                return Stage.COLLECT
            }
        }
        return Stage.DETAIL
    }

    private fun finishUpload(reason: String) {
        stage = Stage.UPLOAD
        waitTicks = 0
        emit("uploading", mapOf("reason" to reason, "count" to collected.size))
        Thread {
            val result = ScraperUploader.upload(
                backendUrl, apiKey, projectId, runId, deviceLabel, collected
            )
            val counts = LinkedHashMap<String, Any?>()
            result.payload?.let { p ->
                // The device-import API returns these values under
                // `summary`; accept top-level values too for older servers.
                val summary = p.optJSONObject("summary")
                for (k in arrayOf("imported", "skipped", "errored", "ref_duplicates", "fingerprint_duplicates", "in_batch_duplicates", "auto_matched")) {
                    when {
                        summary?.has(k) == true -> counts[k] = summary.get(k)
                        p.has(k) -> counts[k] = p.get(k)
                    }
                }
                if (p.has("errors")) counts["errors"] = p.getJSONArray("errors").length()
            }
            val done = mapOf(
                "ok" to result.ok,
                "message" to result.message,
                "count" to collected.size,
                "counts" to counts
            )
            ServiceBridge.emit(mapOf("type" to "done", "payload" to done))
            handler.post {
                running = false
                stage = Stage.IDLE
                releaseKeepOn()
                ServiceBridge.emit(mapOf("type" to "stage", "stage" to "IDLE"))
                closeSurfacesOnFinish()
            }
        }.start()
    }

    // ---------- manual capture ----------

    /**
     * Maps a payment-app package name to a short human label used for the
     * "you switched apps" guard. Unknown packages fall back to a best-effort
     * readable fragment of the package id.
     */
    private fun appLabel(pkg: String): String = when {
        pkg.contains("com.google.android.apps.nbu.paisa") -> "Google Pay"
        pkg.contains("net.one97.paytm") || pkg.contains("com.paytm.app") -> "Paytm"
        pkg.contains("com.phonepe.app") -> "PhonePe"
        pkg.contains("com.freecharge.android") -> "Freecharge"
        pkg.contains("razorpay") -> "Razorpay"
        pkg.contains("com.mobikwik_new") || pkg.contains("com.mobikwik") -> "Mobikwik"
        pkg.contains("amazon.in") -> "Amazon Pay"
        pkg.contains("in.org.npci.upiapp") -> "BHIM UPI"
        pkg.contains("com.airtelbank") || pkg.contains("com.myairtel") -> "Airtel Payments"
        else -> pkg.substringAfterLast('.').substringBefore('.')
            .ifBlank { pkg.split('.').firstOrNull()?.take(16) ?: "other" }
    }

    /**
     * Called from the floating Capture overlay. Reads the currently-visible
     * transaction detail screen, extracts its data, uploads it as a single
     * record, and reports whether it was added or already existed.
     */
    fun captureTransaction() {
        var root = rootInActiveWindow
        if (root == null) {
            OverlayManager.emitResult(false, null, "No screen focused — open the transaction detail page first.")
            return
        }
        // WebView receipts (e.g. Paytm Business) can briefly report an empty tree
        // right after the overlay is removed, before their web content re-syncs.
        // Retry a few times so we don't mistake that for a non-detail screen.
        var emptyRetries = 0
        while (textsJoined(root).isBlank() && emptyRetries < 3) {
            android.os.SystemClock.sleep(250)
            rootInActiveWindow?.let { root = it }
            emptyRetries++
        }
        val pkg = root.packageName?.toString() ?: ""
        android.util.Log.d(
            "UcsScrapper",
            "captureTransaction pkg=[$pkg] text=[${textsJoined(root).take(400)}]"
        )
        val detail = isTransactionDetailScreen(root)
        if (!detail) {
            OverlayManager.emitResult(false, null, "Not a transaction detail page. Open the transaction then tap Capture.")
            return
        }

        // ---- "you switched apps" guard ------------------------------------
        // If the currently-open payment app differs from the app the last
        // capture came from, block so the Mode of Payment / received bank are
        // re-checked first. The first-ever capture sets the baseline silently.
        val currentApp = appLabel(pkg)
        val lastApp = ScraperConfig.get("lastCaptureApp")
        if (!lastApp.isNullOrBlank() && !lastApp.equals(currentApp, ignoreCase = true)) {
            OverlayManager.emitResult(
                false, null,
                "App changed from $lastApp to $currentApp. Update Mode of Payment before capturing."
            )
            return
        }

        if (captureInFlight) {
            OverlayManager.emitResult(false, null, "Capture already running — wait a moment.")
            return
        }
        captureInFlight = true
        // Reset the per-capture Paytm copy-toast reference so a stale id from a
        // previous capture is never reused.
        recoveredRef = null

        // Route to the per-app parser. Single-page screens (e.g. Razorpay) can
        // be read from the current frame directly with no scrolling; scrollable
        // detail screens (e.g. GPay Business, Paytm) merge every frame's text
        // so amount / date / reference / payer are captured across the fold.
        val parser = parserFor(detectAppKind(pkg), this)
        if (parser.needsScroll()) {
            startScrollCollect(pkg, currentApp)
        } else {
            gatherCapture(pkg, currentApp, null)
        }
    }

    /**
     * Reads the currently visible frame's text into [acc], deduplicating by
     * the raw string so repeated lines across frames are kept only once.
     */
    private fun addCurrentFrame(acc: MutableSet<String>) {
        val root = rootInActiveWindow ?: return
        val t = mutableListOf<String>()
        collectTexts(root, t)
        t.map { it.trim() }.filter { it.isNotEmpty() }.forEach { acc.add(it) }
    }

    /**
     * Scrolls a scrollable detail screen and merges every visible frame's text.
     *
     * The detail page opens at its top, so the header (amount / payer) is already
     * on the current frame. We only need to scroll DOWN to read the below-fold
     * fields (date / reference / sender). A downward finger-swipe (swipeUp) moves
     * the page down; scrolling back up is deliberately NOT done because a pull-down
     * at the top triggers the app's pull-to-refresh and reloads the page mid-capture.
     *
     * Sequence: snapshot the current frame, then up to four downward scrolls,
     * merging text each step. Stops early once a scroll adds nothing new (bottom).
     */
    private fun startScrollCollect(pkg: String, currentApp: String) {
        val acc = LinkedHashSet<String>()
        var steps = 0
        var noNewFrames = 0
        var firstRun = true

        addCurrentFrame(acc)
        val stepRunnable = object : Runnable {
            override fun run() {
                // Only check "did the last scroll add anything new" after the
                // first scroll has actually happened; the very first run just
                // moves the page (the seed frame was already captured above).
                if (!firstRun) {
                    val before = acc.size
                    addCurrentFrame(acc)
                    if (acc.size == before) {
                        noNewFrames++
                        if (noNewFrames >= 1) {
                            surfaceHidden(pkg)
                            gatherCapture(pkg, currentApp, acc.toList())
                            return
                        }
                    } else {
                        noNewFrames = 0
                    }
                }
                firstRun = false
                if (steps >= 4) {
                    surfaceHidden(pkg)
                    gatherCapture(pkg, currentApp, acc.toList())
                    return
                }
                steps++
                swipeUp()
                handler.postDelayed(this, 400L)
            }
        }
        handler.postDelayed(stepRunnable, 400L)
    }

    /**
     * Asks this app's parser to surface text hidden behind an interaction (the
     * Paytm parser taps the transaction-id "Copy" button so the full id appears
     * in a toast, then stores it on the service). Called right before gathering
     * so any recovery happens while the relevant row is on screen; safe to call
     * more than once.
     */
    private fun surfaceHidden(pkg: String) {
        try {
            parserFor(detectAppKind(pkg), this).surfaceHiddenText(rootInActiveWindow)
        } catch (ex: Exception) {
            Log.w("UcsScrapper", "surfaceHiddenText failed: " + ex.message)
        }
    }

    /**
     * Builds the ScrapedTxn, parses it (using [merged] scroll text when provided),
     * validates, and uploads it. Runs on the main thread for parsing; the upload
     * itself is off-thread. Always finishes by re-showing the overlay.
     */
    private fun gatherCapture(pkg: String, currentApp: String, merged: List<String>?) {
        val root = rootInActiveWindow
        val txn = ScrapedTxn(received = true)
        // Delegate field extraction to this app's dedicated parser.
        parserFor(detectAppKind(pkg), this).parse(root, merged, txn)
        txn.bankName = ScraperConfig.get("receivedBank")
        txn.mop = ScraperConfig.get("modeOfPayment")?.ifBlank { null }

        // Source = the payment app the transaction came from.
        txn.source = ScraperConfig.get("paymentMethod")?.ifBlank { null } ?: currentApp
        // Ensure the MOP field is never blank in the bank audit — fall back to
        // the source app when no mode was picked.
        if (txn.mop.isNullOrBlank()) txn.mop = txn.source

        val ref = txn.paymentId?.filterNot { it == ' ' }
        // Guard against an accidental re-tap on the same still-open transaction.
        if (ref != null && ref == OverlayManager.lastCaptureRef) {
            OverlayManager.emitResult(false, ref, "Same transaction already captured — open a new one.")
            captureInFlight = false
            Handler(Looper.getMainLooper()).postDelayed({
                OverlayManager.show(this@ScraperAccessibilityService)
            }, 1200)
            return
        }

        // Reject transactions with no readable date.
        val dateStr = txn.transactionDate?.trim()
        if (dateStr.isNullOrBlank()) {
            OverlayManager.emitResult(false, ref, "Could not read the transaction date.")
            captureInFlight = false
            Handler(Looper.getMainLooper()).postDelayed({
                OverlayManager.show(this@ScraperAccessibilityService)
            }, 1200)
            return
        }

        val uploadNow = txn.copy(
            transactionDate = txn.transactionDate ?: fallbackDate()
        )
        Thread {
            val res = ScraperUploader.upload(
                backendUrl.ifBlank { ScraperConfig.resolveBackendUrl() },
                apiKey.ifBlank { ScraperConfig.resolveApiKey() },
                projectId.ifBlank { ScraperConfig.get("projectId") ?: "" },
                "capture-" + System.currentTimeMillis(),
                deviceLabel.ifBlank { "manual" }, listOf(uploadNow)
            )
            var msgs = ""
            var added = false
            // Only treat a non-2xx response as a hard failure regardless of its
            // body; count "errored"/"skipped" from the summary once it's a valid
            // response. Never report "Saved" when nothing positive happened.
            val errored = res.payload?.let {
                val sum = it.optJSONObject("summary")
                (sum?.optInt("errored") ?: it.optInt("errored", 0)) ?: 0
            } ?: 0
            val skipped = res.payload?.let {
                val sum = it.optJSONObject("summary")
                (sum?.optInt("skipped") ?: it.optInt("skipped", 0)) ?: 0
            } ?: 0
            val imported = res.payload?.let {
                val sum = it.optJSONObject("summary")
                (sum?.optInt("imported") ?: it.optInt("imported", 0)) ?: 0
            } ?: 0
            if (!res.ok) {
                msgs = "Import failed" + if (res.message.isNotBlank()) ": ${res.message.take(160)}" else ""
            } else if (imported > 0) {
                added = true
                msgs = "Imported successfully"
            } else if (errored > 0) {
                val errs = res.payload?.optJSONArray("error_messages")
                val firstErr = if (errs != null && errs.length() > 0) errs.getString(0) else null
                msgs = "Import failed: ${firstErr ?: "$errored rejected by server"}"
            } else if (skipped > 0) {
                msgs = "Already captured (duplicate skipped)"
            } else {
                msgs = "Saved"
            }
            val msg = msgs
            // Remember which payment app this capture came from so the next
            // capture can warn if the user switched apps. Only update on a
            // successful upload (not a hard failure).
            if (res.ok) ScraperConfig.setAll(mapOf("lastCaptureApp" to currentApp))
            OverlayManager.lastCaptureRef = ref
            OverlayManager.emitResult(added, ref, msg)
            if (uploadNow.transactionDate != null) {
                emit("collected", mapOf("count" to 1))
            }
            captureInFlight = false
            // Re-show overlay after a delay so user can capture another
            Handler(Looper.getMainLooper()).postDelayed({
                OverlayManager.show(this@ScraperAccessibilityService)
            }, 1200)
        }.start()
    }

    internal fun extractAmount(joined: String): Double? {
        val patterns = listOf(
            Regex("[₹Rs.INR]{0,3}\\s*([\\d,]+(?:\\.\\d{1,2})?)\\s*(?:credited|debited|received|paid)", RegexOption.IGNORE_CASE),
            Regex("(?:amount|total|you (?:received|paid))\\s*[₹:$]?\\s*([\\d,]+(?:\\.\\d{1,2})?)", RegexOption.IGNORE_CASE),
            Regex("[₹\\$]\\s*([\\d,]+(?:\\.\\d{1,2})?)", RegexOption.IGNORE_CASE)
        )
        for (p in patterns) {
            val m = p.find(joined) ?: continue
            val v = m.groupValues[1].replace(",", "").toDoubleOrNull()
            if (v != null && v > 0) return v
        }
        return null
    }

    internal fun extractDate(joined: String): String? {
        val lines = textsDense(joined)
        // A date that directly follows a label ("Date", "TXN Date", "Paid on").
        for (i in 0 until lines.size) {
            if (!Regex("^(?:date|txn\\s*date|paid\\s*on)\\s*[:.]?$", RegexOption.IGNORE_CASE).matches(lines[i])) continue
            val next = lines.getOrNull(i + 1) ?: continue
            parseDayMonth(next)?.let { return it }
        }
        // Day-first "d M, YYYY" with a real 4-digit year. Never match a 2-digit
        // year after the month: on date lines like "30 AUG, 12:07 PM" the hour
        // "12" would otherwise be swallowed as the year (giving 2012).
        Regex("\\b(\\d{1,2})\\s+([A-Za-z]{3,9}),?\\s+(\\d{4})\\b", RegexOption.IGNORE_CASE)
            .find(joined)?.let { m ->
                val mon = monthNumber(m.groupValues[2]) ?: return@let null
                return String.format(Locale.US, "%04d-%02d-%02d", m.groupValues[3].toInt(), mon, m.groupValues[1].toInt())
            }
        // Day-first "d M[,] hh:mm" with no year → current year (Razorpay
        // "01 Sep, 11:46 pm", Paytm "04 May 2026").
        parseDayMonth(joined)?.let { return it }
        // Month-first "M d, YYYY".
        Regex("\\b([A-Za-z]{3,9})\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b", RegexOption.IGNORE_CASE)
            .find(joined)?.let { m ->
                val mon = monthNumber(m.groupValues[1]) ?: return@let null
                return String.format(Locale.US, "%04d-%02d-%02d", m.groupValues[3].toInt(), mon, m.groupValues[2].toInt())
            }
        // dd/mm/yyyy
        Regex("(\\d{1,2})[/.-](\\d{1,2})[/.-](\\d{2,4})").find(joined)
            ?.let { return parseHeaderFromText(it.value) }
        // yyyy-MM-dd
        Regex("(\\d{4}-\\d{2}-\\d{2})").find(joined)?.let { return it.groupValues[1] }
        return null
    }

    /**
     * Parses a day + month (optionally followed by a time) into yyyy-MM-dd.
     * When no year is present it is inferred from the current date, walking
     * back a year if the parsed month/day is still in the future today.
     */
    internal fun parseDayMonth(s: String): String? {
        val m = Regex("\\b(\\d{1,2})\\s+([A-Za-z]{3,9})\\b").find(s) ?: return null
        val day = m.groupValues[1].toInt()
        if (day < 1 || day > 31) return null
        val mon = monthNumber(m.groupValues[2]) ?: return null
        var year = Calendar.getInstance().get(Calendar.YEAR)
        if (isFuture(mon, day, year)) year -= 1
        return String.format(Locale.US, "%04d-%02d-%02d", year, mon, day)
    }

    private fun isFuture(month: Int, day: Int, year: Int): Boolean {
        val cal = Calendar.getInstance()
        val nowY = cal.get(Calendar.YEAR)
        val nowM = cal.get(Calendar.MONTH) + 1
        val nowD = cal.get(Calendar.DAY_OF_MONTH)
        val y = nowY + (year - nowY)
        return when {
            y > nowY -> true
            y < nowY -> false
            month > nowM -> true
            month < nowM -> false
            else -> day > nowD
        }
    }

    internal fun extractUpiRef(joined: String): String? {
        // Razorpay payment ids are "pay_" + alphanumeric (e.g. pay_TWrtyXO1x2cI7H).
        Regex("\\bpay_[A-Za-z0-9]{8,}\\b").find(joined)?.let { return it.value }
        // Label + value, tolerant of "No:"/"Id:" suffixes and trailing labels
        // like "Copy". Works for "UPI Ref No: 525170991793", "Paytm Transaction
        // ID: 123456789012", GPay "UPI transaction ID: 111...".
        Regex("(?:upi\\s*ref(?:\\.?\\s*no\\b)?|upi\\s*transaction\\s*id\\b|transaction\\s*(?:id|ref)\\b|payment\\s*(?:id|ref)\\b|reference\\s*(?:no|number|id)\\b|txn\\s*id\\b|paytm\\s*(?:transaction\\s*)?(?:id|ref)\\b)\\s*[:.]?\\s*([A-Za-z0-9][A-Za-z0-9 _-]{8,})", RegexOption.IGNORE_CASE)
            .find(joined)?.let { m ->
                // Prefer the 12-16 digit run within the captured value.
                val digits = Regex("\\d{12,16}").find(m.groupValues[1])?.value
                if (digits != null) return digits
                val clean = Regex("^[A-Za-z0-9]+").find(
                    m.groupValues[1].replace(Regex("[ \\n]"), "")
                )?.value
                if (clean != null && clean.length >= 10) return clean
            }
        // Fallback: first bare 12–16 digit run anywhere (Paytm ref / UPI id).
        Regex("\\b\\d{12,16}\\b").find(joined)?.let { return it.value }
        return null
    }

    internal fun extractPayer(joined: String): String? {
        val lines = textsDense(joined)
        android.util.Log.d("UcsScrapper", "extractPayer joined=[$joined]")

        // Label-then-name on the next line: "From\nBENJAMIN", "Received from\nName",
        // "Money received\nBENJAMIN", "Sender\nName", "Paid by\nName".
        val labelLine = Regex("""^(?:received\s*from|money\s*(?:received|sent)\s*from|paid\s*(?:by|from)|from|sender|to)\s*:?$""", RegexOption.IGNORE_CASE)
        val labelWord = Regex("""^(?:from|to|by|sender|receiver|amount|date|time|status|payment|transaction)$""", RegexOption.IGNORE_CASE)
        for (i in 0 until lines.size) {
            if (!labelLine.matches(lines[i])) continue
            val name = lines.getOrNull(i + 1)?.trim()?.trimEnd('.')?.take(80) ?: continue
            // A node's `contentDescription` can duplicate the label itself; never
            // accept a bare label word as the payer, walk to the next line.
            if (labelWord.matches(name)) continue
            if (name.length >= 2 && Regex("^[A-Za-z][A-Za-z .'-]+$").matches(name)) return name
        }

        // Inline label: "From : BENJAMIN" or "From BENJAMIN" on one line.
        for (line in lines) {
            val m = Regex("""(?:received\s*from|money\s*(?:received|sent)\s*from|paid\s*(?:by|from)|from|sender)\s*[:.]?\s*([A-Za-z][A-Za-z .'-]{1,60})""", RegexOption.IGNORE_CASE)
                .find(line) ?: continue
            val name = m.groupValues[1].trim().trimEnd('.').take(80)
            if (name.length >= 2 && !Regex("""^(?:from|to|by|sender|receiver)$""", RegexOption.IGNORE_CASE).matches(name)) return name
        }

        // Last resort: plausible multi-word human-name line (skip amounts, IDs,
        // upi tokens, labels, toolbars).
        for (line in lines) {
            val t = line.trim()
            if (t.length < 2 || t.length > 60) continue
            if (Regex("\\d").containsMatchIn(t)) continue
            if (Regex("(rupee|rs\\.?|inr|upi|ref|transaction|amount|date|status|success\\b|id|paytm|google|payment|capture|help|share|view\\b|history\\b|bank\\b|money\\b)", RegexOption.IGNORE_CASE).containsMatchIn(t)) continue
            val words = t.split(Regex("\\s+"))
            if (words.size >= 2 && words.all { Regex("[A-Za-z][A-Za-z.'-]*").matches(it) }) return t
        }
        return null
    }

    internal fun textsDense(joined: String): List<String> {
        val out = mutableListOf<String>()
        for (t in joined.split("\n").map { it.trim() }.filter { it.isNotEmpty() }) {
            // Nodes often expose the same string via both `text` and
            // `contentDescription`; collapse consecutive duplicates so a label
            // like "From" followed by its value isn't read as two labels.
            if (out.isEmpty() || out.last() != t) out.add(t)
        }
        return out
    }

    // ---------- blocking screens ----------

    private fun closeSurfacesOnFinish() {
        try {
            // Close Google Pay (and any foreground overlay) fully by going Home.
            performGlobalAction(GLOBAL_ACTION_HOME)
        } catch (ex: Exception) {
            Log.w("Scraper", "closeSurfacesOnFinish: HOME failed: " + ex.message)
        }
        // Bring the scraper app back into the foreground fresh from the
        // background. CLEAR_TASK + NEW_TASK fully recreates the task so it
        // starts clean instead of resuming a stale GPay-adjacent state.
        try {
            val intent = Intent(this, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
            startActivity(intent)
        } catch (ex: Exception) {
            Log.w("Scraper", "closeSurfacesOnFinish: reopen failed: " + ex.message)
        }
    }

    private fun handleBlocker(root: AccessibilityNodeInfo?): Boolean {
        if (root == null) return false
        val t = textsJoined(root).lowercase()
        val blocked = Regex("(biometr|fingerprint|face ?unlock|confirm it[’']?s you|verify.*it[’']?s you|pin again)").containsMatchIn(t)
        if (!blocked) {
            blockedNotified = false
            blockedSince = 0L
            return false
        }
        val now = System.currentTimeMillis()
        if (blockedSince == 0L) blockedSince = now
        if (!blockedNotified) {
            blockedNotified = true
            val msg = if (gpayLockType == "biometric") {
                "Google Pay wants biometric unlock — touch the fingerprint sensor (or scan your face) now. The run continues when it clears."
            } else {
                "Google Pay asked for extra verification (fingerprint / confirm it's you). Scan now, or Stop the run."
            }
            emit("warning", mapOf("message" to msg))
        } else if (gpayLockType != "biometric" && now - blockedSince > 5 * 60 * 1000L) {
            setError("Stuck on Google Pay verification for 5 minutes. Check the phone manually and restart.")
            return true
        }
        return true
    }

    // ---------- parsing helpers ----------

    private fun parseHeader(node: AccessibilityNodeInfo): String? {
        if (node.isClickable) return null
        val t = (node.text?.toString() ?: "").trim()
        if (t.isBlank()) return null
        if (t.length > 40) return null
        val low = t.lowercase()
        val m = Regex("^(today|yesterday)$").find(low)
        if (m != null) {
            val cal = Calendar.getInstance()
            if (low == "yesterday") cal.add(Calendar.DAY_OF_YEAR, -1)
            return SimpleDateFormat("yyyy-MM-dd", Locale.US).format(cal.time)
        }
        val dm = Regex("(\\d{1,2})\\s+([A-Za-z]{3,9})\\s*(\\d{2,4})?").find(t)
        if (dm != null) {
            val day = dm.groupValues[1].toInt()
            val mon = monthNumber(dm.groupValues[2])
            if (mon == null) return null
            var year = dm.groupValues[3].toIntOrNull() ?: Calendar.getInstance().get(Calendar.YEAR)
            if (year in 0..99) year += 2000
            return String.format(Locale.US, "%04d-%02d-%02d", year, mon, day)
        }
        return null
    }

    private fun monthNumber(name: String): Int? {
        val low = name.lowercase().take(3)
        val names = listOf("jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec")
        val i = names.indexOf(low)
        return if (i >= 0) i + 1 else null
    }

    private fun parseRow(row: AccessibilityNodeInfo): ScrapedTxn? {
        val desc = row.contentDescription?.toString()?.trim()
        if (!desc.isNullOrBlank()) {
            val am = Regex("[₹$]\\s*([\\d,]+(?:\\.\\d{1,2})?)\\s+(credited|debited)\\b", RegexOption.IGNORE_CASE).find(desc)
            if (am != null) {
                val amount = am.groupValues[1].replace(",", "").toDoubleOrNull() ?: return null
                val received = am.groupValues[2].equals("credited", true)
                val lines = desc.split("\n").map { it.trim() }.filter { it.isNotEmpty() }
                val name = lines.firstOrNull { Regex("[₹$\\d]").find(it) == null }?.take(80)
                val dateLine = lines.firstOrNull { l ->
                    Regex("credited|debited", RegexOption.IGNORE_CASE).find(l) == null &&
                        Regex("\\d{1,2}\\s+[A-Za-z]{3,9}").find(l) != null
                }
                val parsedDate = dateLine?.let { parseHeaderFromText(it) }
                return ScrapedTxn(
                    paymentId = null,
                    amount = amount,
                    payerName = name?.ifBlank { null },
                    transactionDate = parsedDate,
                    paymentTime = null,
                    received = received
                )
            }
        }
        val texts = mutableListOf<String>()
        collectTexts(row, texts)
        var amount: Double? = null
        var hasPlus = false
        var hasMinus = false
        for (t in texts) {
            val m = Regex("^([+-])\\s*[₹]\\s*([\\d,]+(?:\\.\\d{1,2})?)\\s*$").find(t.trim())
                ?: Regex("^([+-])\\s*([\\d,]+(?:\\.\\d{1,2})?)\\s*$").find(t.trim())
                ?: Regex("^[₹]\\s*([\\d,]+(?:\\.\\d{1,2})?)\\s*$").find(t.trim())
            if (m != null) {
                amount = m.groupValues[m.groupValues.lastIndex].replace(",", "").toDoubleOrNull()
                if (amount == null) continue
                val sign = m.groupValues[1]
                if (sign == "+") hasPlus = true
                if (sign == "-") hasMinus = true
                break
            }
        }
        if (amount == null) return null

        val joined = texts.joinToString(" ")
        if (Regex("(failed|declined|rejected|pending|refund|cancelled|couldn[’']?t|not deducted)", RegexOption.IGNORE_CASE).containsMatchIn(joined)) return null

        val title = texts.firstOrNull {
            Regex("^(received from|payment from|paid you|sent to|paid to|transferred to|money|refund|top.?up|bank|income|cash|cashback)", RegexOption.IGNORE_CASE).containsMatchIn(it.trim())
        } ?: texts.firstOrNull { it.trim().length in 2..45 }

        val received = if (hasPlus) true else if (hasMinus) false else !Regex("(sent to|paid to|transferred to|money to|debited|top.?up)", RegexOption.IGNORE_CASE).containsMatchIn(title ?: "")

        val payer = title?.replace(Regex("^(received from|payment from|paid you|sent to|paid to|transferred to|money|refund|top.?up|bank|income|cash|cashback)", RegexOption.IGNORE_CASE), "")?.trim()?.take(80)

        val ref = Regex("UPI[ /]?([A-Za-z0-9_-]{10,})", RegexOption.IGNORE_CASE).find(joined)
            ?.groupValues?.get(1)?.replace(" ", "")

        val time = parseTime(joined)

        val ownDate = texts
            .map { parseHeaderFromText(it.trim()) }
            .firstOrNull { it != null && Regex("^\\d{4}-\\d{2}-\\d{2}\$").matches(it) }

        return ScrapedTxn(
            paymentId = ref,
            amount = amount,
            payerName = payer?.ifBlank { null },
            transactionDate = ownDate ?: lastHeaderDate,
            paymentTime = time,
            received = received
        )
    }

    internal fun parseTime(joined: String): String? {
        val m12 = Regex("(\\d{1,2}:\\d{2})\\s*(am|pm)", RegexOption.IGNORE_CASE).find(joined)
        if (m12 != null) {
            val parts = m12.groupValues[1].split(":")
            var h = parts[0].toInt()
            val mi = parts[1].toInt()
            val ampm = m12.groupValues[2].lowercase()
            if (ampm == "pm" && h < 12) h += 12
            if (ampm == "am" && h == 12) h = 0
            return String.format(Locale.US, "%02d:%02d", h, mi)
        }
        val m24 = Regex("(\\b[012]?\\d:\\d{2}\\b)").find(joined)
        return m24?.groupValues?.get(1)
    }

    private fun parseDetail(root: AccessibilityNodeInfo, txn: ScrapedTxn?) {
        if (txn == null) return
        val texts = mutableListOf<String>()
        collectTexts(root, texts)
        val joined = texts.joinToString("\n")

        val id = Regex("(?:UPI\\s*transaction\\s*ID|Transaction\\s*(?:ID|Id|id)|UPI\\s*Ref|Reference\\s*No|payment\\s*ID|Google\\s*transaction\\s*ID)\\s*[:.]?\\s*(?:\\n\\s*)?([A-Za-z0-9][A-Za-z0-9 _-]{9,})", RegexOption.IGNORE_CASE).find(joined)
            ?.groupValues?.get(1)?.replace(Regex("[ \\n]"), "")
            ?.takeIf { Regex("^[A-Za-z0-9_-]{10,}\$").matches(it) }
            ?: texts.firstOrNull { Regex("^[A-Za-z0-9]{16}$").matches(it.trim()) }?.trim()
        if (id != null && (txn.paymentId?.filterNot { it == ' ' } ?: "") != id) txn.paymentId = id

        val date = Regex("\\bdate\\b\\s*:\\s*(\\d{1,2}\\s+[A-Za-z]{3,9},?\\s*\\d{2,4}|\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{2,4}|\\d{1,2}\\s+[A-Za-z]{3,9})", RegexOption.IGNORE_CASE)
            .find(joined)?.groupValues?.get(1)
            ?: Regex("(\\d{1,2}\\s+[A-Za-z]{3,9}(?:,\\s*\\d{2,4}))", RegexOption.IGNORE_CASE)
                .find(joined)?.groupValues?.get(1)
            ?: Regex("(\\d{1,2}(?:st|nd|rd|th)?\\s+(?:[A-Za-z]{3,9})(?:,?\\s*\\d{2,4})?)", RegexOption.IGNORE_CASE)
                .find(joined)?.groupValues?.get(1)
            ?: Regex("(\\d{1,2}\\s+[A-Za-z]{3,9})", RegexOption.IGNORE_CASE)
                .find(joined)?.groupValues?.get(1)
        if (date != null) txn.transactionDate = parseHeaderFromText(date)

        // Robust fallback so a row is never dropped just because the date text
        // could not be matched on the detail screen. Today/yesterday are
        // resolved, anything else falls back to today's date.
        if (txn.transactionDate.isNullOrBlank()) {
            txn.transactionDate = fallbackDate()
        }

        val relTime = Regex("\\btime\\b\\s*:\\s*(\\d{1,2}:\\d{2}\\s*(?:am|pm))", RegexOption.IGNORE_CASE).find(joined)
            ?: Regex("(\\d{1,2}:\\d{2}\\s*(?:am|pm))", RegexOption.IGNORE_CASE).find(joined)
        if (relTime != null) txn.paymentTime = convert12(relTime.groupValues[1])

        val fromLine = Regex("From:\\s*([A-Za-z][A-Za-z .'-]{1,60})", RegexOption.IGNORE_CASE).find(joined)
        if (fromLine != null) txn.payerName = fromLine.groupValues[1].trim().trimEnd('.').take(80)
    }

    private fun convert12(s: String): String {
        val m = Regex("(\\d{1,2}):(\\d{2})\\s*(am|pm)", RegexOption.IGNORE_CASE).find(s) ?: return s.trim()
        var h = m.groupValues[1].toInt()
        val mi = m.groupValues[2].toInt()
        val ap = m.groupValues[3].lowercase()
        if (ap == "pm" && h < 12) h += 12
        if (ap == "am" && h == 12) h = 0
        return String.format(Locale.US, "%02d:%02d", h, mi)
    }

    private fun parseHeaderFromText(s: String): String {
        val t = s.trim().replace(",", "")
        val dm = Regex("(\\d{1,2})\\s+([A-Za-z]{3,9})\\s*(\\d{2,4})?").find(t)
        if (dm != null) {
            val day = dm.groupValues[1].toInt()
            val mon = monthNumber(dm.groupValues[2]) ?: return t
            var year = dm.groupValues[3].toIntOrNull() ?: Calendar.getInstance().get(Calendar.YEAR)
            if (year in 0..99) year += 2000
            return String.format(Locale.US, "%04d-%02d-%02d", year, mon, day)
        }
        val m = Regex("(\\d{1,2})[/.-](\\d{1,2})[/.-](\\d{2,4})").find(t)
        if (m != null) {
            var y = m.groupValues[3].toInt()
            if (y in 0..99) y += 2000
            return String.format(Locale.US, "%04d-%02d-%02d", y, m.groupValues[2].toInt(), m.groupValues[1].toInt())
        }
        return t
    }

    internal fun fallbackDate(): String {
        val joined = textsJoined(rootInActiveWindow).lowercase()
        val cal = Calendar.getInstance()
        if (joined.contains("yesterday")) cal.add(Calendar.DAY_OF_YEAR, -1)
        return SimpleDateFormat("yyyy-MM-dd", Locale.US).format(cal.time)
    }

    // ---------- tap / gesture helpers ----------

    private fun tapDigit(d: Char, root: AccessibilityNodeInfo?) {
        val st = d.toString()
        val node = findNode(root) { (it.text?.toString() ?: "") == st && it.isVisibleToUser }
        if (node != null) {
            node.performAction(AccessibilityNodeInfo.ACTION_CLICK)
        } else {
            val (x, y) = padCoord(st)
            tap(x, y)
        }
    }

    private fun padCoord(d: String): Pair<Float, Float> {
        val dm = resources.displayMetrics
        val w = dm.widthPixels.toFloat()
        val h = dm.heightPixels.toFloat()
        if (d == "0") {
            return w * 0.5f to h * 0.62f + 3f * h * 0.07f
        }
        val i = "123456789".indexOf(d)
        val row = i / 3
        val col = i % 3
        return (w * 0.5f + (col - 1) * w * 0.20f) to (h * 0.62f + row * h * 0.07f)
    }

    private fun tap(x: Float, y: Float) {
        val p = Path().apply { moveTo(x, y) }
        val stroke = GestureDescription.StrokeDescription(p, 0L, 60L)
        dispatchGesture(GestureDescription.Builder().addStroke(stroke).build(), null, null)
    }

    /** Taps the center of [node]. Per-app parsers use this to interact with
     *  non-clickable text nodes (e.g. Paytm's "Copy" label, whose tap is handled
     *  by a webview at that screen coordinate). */
    internal fun tapCenter(node: AccessibilityNodeInfo) {
        val r = Rect()
        node.getBoundsInScreen(r)
        tap(r.exactCenterX(), r.exactCenterY())
    }

    private fun swipeUp() {
        val dm = resources.displayMetrics
        val w = dm.widthPixels.toFloat()
        val h = dm.heightPixels.toFloat()
        val p = Path().apply {
            moveTo(w * 0.5f, h * 0.80f)
            lineTo(w * 0.5f, h * 0.25f)
        }
        val stroke = GestureDescription.StrokeDescription(p, 0L, 300L)
        dispatchGesture(GestureDescription.Builder().addStroke(stroke).build(), null, null)
    }

    /** One downward scroll (/scroll down) gesture, exposed for per-app parsers
     *  that need to bring below-the-fold content (e.g. Paytm's Copy row) into
     *  view before interacting with it. */
    internal fun swipeDownOnce() {
        swipeUp()
    }

    private fun swipeDown() {
        val dm = resources.displayMetrics
        val w = dm.widthPixels.toFloat()
        val h = dm.heightPixels.toFloat()
        val p = Path().apply {
            moveTo(w * 0.5f, h * 0.25f)
            lineTo(w * 0.5f, h * 0.80f)
        }
        val stroke = GestureDescription.StrokeDescription(p, 0L, 300L)
        dispatchGesture(GestureDescription.Builder().addStroke(stroke).build(), null, null)
    }

    private fun collectDescRows(node: AccessibilityNodeInfo?, out: MutableList<AccessibilityNodeInfo>, seen: HashSet<AccessibilityNodeInfo>) {
        if (node == null || !node.isVisibleToUser || !seen.add(node)) return
        if (node.isClickable) {
            val d = node.contentDescription?.toString()?.trim() ?: ""
            if (d.isNotBlank() && Regex("[₹$]\\s*[\\d,]+(?:\\.\\d{1,2})?\\s+(credited|debited)\\b", RegexOption.IGNORE_CASE).containsMatchIn(d)) {
                out.add(node)
                return
            }
        }
        for (i in 0 until node.childCount) collectDescRows(node.getChild(i), out, seen)
    }

    private fun amountNodes(node: AccessibilityNodeInfo?, out: MutableList<AccessibilityNodeInfo>, seen: HashSet<AccessibilityNodeInfo>) {
        if (node == null || !node.isVisibleToUser || !seen.add(node)) return
        val t = node.text?.toString()?.trim() ?: ""
        if (t.isNotEmpty() && t.length <= 16 &&
            Regex("^[+-]?\\s*[₹$]?\\s*[\\d,]+(?:\\.\\d{1,2})?\\s*$").matches(t)) {
            out.add(node)
        }
        for (i in 0 until node.childCount) amountNodes(node.getChild(i), out, seen)
    }

    private fun collectRows(root: AccessibilityNodeInfo, out: MutableList<AccessibilityNodeInfo>) {
        val descRows = mutableListOf<AccessibilityNodeInfo>()
        collectDescRows(root, descRows, HashSet())
        if (descRows.isNotEmpty()) {
            out.addAll(descRows)
            return
        }
        val amounts = mutableListOf<AccessibilityNodeInfo>()
        amountNodes(root, amounts, HashSet())
        if (amounts.isNotEmpty()) {
            val used = HashSet<AccessibilityNodeInfo>()
            val dm = resources.displayMetrics
            for (n in amounts) {
                var row = n
                var cur: AccessibilityNodeInfo? = n
                while (true) {
                    val p = cur?.parent ?: break
                    if (!p.isVisibleToUser) break
                    val r = Rect()
                    p.getBoundsInScreen(r)
                    if (r.isEmpty) break
                    if (r.height() > dm.heightPixels * 0.15f) break
                    if (r.width() >= dm.widthPixels * 0.45f) { row = p; break }
                    cur = p
                }
                if (used.add(row)) out.add(row)
            }
            return
        }
        // Never use every clickable node as a transaction row. On loading,
        // home, permission, and error screens that list contains arbitrary
        // buttons and is the cause of random taps during a run.
    }

    private fun clickableAncestor(node: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        var current: AccessibilityNodeInfo? = node
        repeat(6) {
            if (current == null) return null
            if (current!!.isVisibleToUser && current!!.isClickable) return current
            current = current!!.parent
        }
        return null
    }

    private fun isTransactionDetailScreen(root: AccessibilityNodeInfo): Boolean {
        val pkg = root.packageName?.toString() ?: ""
        return parserFor(detectAppKind(pkg), this).isDetailScreen(root)
    }

    private fun isLikelyTransactionListScreen(root: AccessibilityNodeInfo, rowCount: Int): Boolean {
        val text = textsJoined(root).lowercase()
        val hasDateMarker = text.contains("today") || text.contains("yesterday") ||
            Regex("\\b\\d{1,2}\\s+[a-z]{3,9}\\b").containsMatchIn(text)
        // Current GPay history uses filter chips instead of a visible
        // "All activity" / "Transaction history" title.
        val hasHistoryFilters = text.contains("status") &&
            text.contains("payment method") && text.contains("date") &&
            text.contains("amount")
        return (text.contains("all activity") || text.contains("transaction history")) ||
            (hasHistoryFilters && hasDateMarker && rowCount >= 1) ||
            (text.contains("transactions") && hasDateMarker && rowCount >= 2)
    }

    // ---------- tree scanning ----------

    private fun hasDigitPad(root: AccessibilityNodeInfo): Boolean {
        return findNode(root) { Regex("^\\d$").matches(it.text?.toString()?.trim() ?: "") } != null
    }

    private fun clickableRows(root: AccessibilityNodeInfo, out: MutableList<AccessibilityNodeInfo>) {
        val seen = HashSet<AccessibilityNodeInfo>()
        clickableRowsInner(root, out, seen)
    }

    private fun clickableRowsInner(node: AccessibilityNodeInfo?, out: MutableList<AccessibilityNodeInfo>, seen: HashSet<AccessibilityNodeInfo>) {
        if (node == null || !node.isVisibleToUser || !seen.add(node)) return
        if (node.isClickable) out.add(node)
        for (i in 0 until node.childCount) clickableRowsInner(node.getChild(i), out, seen)
    }

    internal fun findNode(root: AccessibilityNodeInfo?, pred: (AccessibilityNodeInfo) -> Boolean): AccessibilityNodeInfo? {
        if (root == null) return null
        if (pred(root)) return root
        for (i in 0 until root.childCount) {
            val r = findNode(root.getChild(i), pred)
            if (r != null) return r
        }
        return null
    }

    internal fun collectTexts(node: AccessibilityNodeInfo?, out: MutableList<String>) {
        if (node == null) return
        node.text?.toString()?.takeIf { it.isNotBlank() }?.let { out.add(it.trim()) }
        node.contentDescription?.toString()?.takeIf { it.isNotBlank() }?.let { out.add(it.trim()) }
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            if (child === node) continue
            collectTexts(child, out)
        }
    }

    internal fun collectByResourceId(node: AccessibilityNodeInfo?, id: String, out: MutableList<String>) {
        if (node == null) return
        if ((node.viewIdResourceName ?: "").endsWith(id)) {
            node.text?.toString()?.takeIf { it.isNotBlank() }?.let { out.add(it.trim()) }
        }
        for (i in 0 until node.childCount) collectByResourceId(node.getChild(i), id, out)
    }

    internal fun textsJoined(root: AccessibilityNodeInfo): String {
        val out = mutableListOf<String>()
        collectTexts(root, out)
        return out.joinToString(" · ")
    }

    // ---------- inspect ----------

    private fun emitInspect(root: AccessibilityNodeInfo) {
        val lines = mutableListOf<String>()
        dump(root, 0, lines, HashSet())
        ServiceBridge.emit(mapOf(
            "type" to "inspect",
            "pkg" to (root.packageName ?: ""),
            "lines" to lines.take(400)
        ))
    }

    private fun dump(node: AccessibilityNodeInfo?, depth: Int, out: MutableList<String>, seen: HashSet<AccessibilityNodeInfo>) {
        if (node == null || !node.isVisibleToUser || !seen.add(node)) return
        if (out.size > 400) return
        val cls = node.className?.toString()?.substringAfterLast('.') ?: "?"
        val bounds = Rect()
        node.getBoundsInScreen(bounds)
        val text = (node.text?.toString() ?: "").trim()
        val desc = (node.contentDescription?.toString() ?: "").trim()
        val label = when {
            text.isNotBlank() && desc.isNotBlank() -> "[$text|$desc]"
            text.isNotBlank() -> "[$text]"
            desc.isNotBlank() -> "($desc)"
            else -> ""
        }
        out.add("${"  ".repeat(depth)}${cls}${if (node.isClickable) " *" else ""} ${bounds} ${label}")
        for (i in 0 until node.childCount) dump(node.getChild(i), depth + 1, out, seen)
    }

    fun dumpWindow(): List<String> {
        val root = rootInActiveWindow ?: return listOf("no active window")
        val lines = mutableListOf<String>()
        dump(root, 0, lines, HashSet())
        return lines.take(400)
    }

    // ---------- keep-on ----------

    private fun acquireKeepOn() {
        try {
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = pm.newWakeLock(
                PowerManager.SCREEN_DIM_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP or PowerManager.ON_AFTER_RELEASE,
                "scrapper:keepOn"
            ).apply { acquire(30 * 60 * 1000L) }
        } catch (t: Throwable) {}
    }

    private fun releaseKeepOn() {
        try { wakeLock?.takeIf { it.isHeld }?.release() } catch (t: Throwable) {}
        wakeLock = null
    }
}
