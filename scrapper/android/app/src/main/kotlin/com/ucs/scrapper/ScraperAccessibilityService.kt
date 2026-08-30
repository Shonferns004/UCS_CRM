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
    private var stage: Stage = Stage.IDLE
    private var inspectMode = false

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

    private var pinIndex = 0
    private var pinDone = false
    private var waitTicks = 0
    private var scrollCount = 0
    private var listEntered = false
    private var detailPhase = 0
    private var pendingDetail: ScrapedTxn? = null
    private var blockedNotified = false
    private var blockedSince = 0L

    private val collected = mutableListOf<ScrapedTxn>()
    private val seenRefs = HashSet<String>()
    private val seenPartial = HashSet<String>()
    private var lastHeaderDate: String? = null

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
        emit("connected", emptyMap())
    }

    override fun onInterrupt() {}

    override fun onUnbind(intent: Intent?): Boolean {
        instance = null
        stopRun()
        return super.onUnbind(intent)
    }

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
        this.backendUrl = backendUrl
        this.apiKey = apiKey
        receivedOnly = c.getBool("receivedOnly", true)
        maxTx = c.getInt("maxTransactions", 200)
        maxScrolls = c.getInt("scrollLoops", 8)
        historyText = c.get("historyText") ?: "All activity"

        collected.clear(); seenRefs.clear(); seenPartial.clear()
        pinIndex = 0; pinDone = false; waitTicks = 0; scrollCount = 0
        listEntered = false; detailPhase = 0; pendingDetail = null
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

    fun stopRun() {
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
        if (!flowDone && trainedFlow.isNotEmpty()) {
            if (replayIdx >= trainedFlow.size) flowDone = true
            else return stepTrained(root, trainedFlow)
        }
        if (!listEntered) {
            if (linkCooldown > 0) {
                linkCooldown--
            } else {
                val seeAll = findNode(root) {
                    val d = it.contentDescription?.toString()?.trim() ?: ""
                    val t = it.text?.toString()?.trim() ?: ""
                    (it.isClickable || it.isLongClickable) && (d.equals("See all", true) || t.equals("See all", true))
                }
                if (seeAll != null) {
                    emit("info", mapOf("message" to "Opening full transactions list"))
                    seeAll.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                    listEntered = true
                    linkCooldown = 2
                    return Stage.COLLECT
                }
                val link = findLinkToTransactions(root)
                if (link != null) {
                    emit("info", mapOf("message" to "Navigating to transaction history"))
                    link.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                    linkCooldown = 2
                    return Stage.COLLECT
                }
            }
        }
        val rows = mutableListOf<AccessibilityNodeInfo>()
        collectRows(root, rows)
        lastHeaderDate = null
        for (row in rows) {
            if (!row.isVisibleToUser) continue
            val header = parseHeader(row)
            if (header != null) { lastHeaderDate = header; continue }
            val txn = parseRow(row) ?: continue
            if (!txn.received && receivedOnly) continue
            val partial = txn.amount.toString() + "|" + (txn.payerName ?: "").trim().lowercase()
            if (partial in seenPartial) continue
            seenPartial.add(partial)

            val ref = txn.paymentId?.filterNot { it == ' ' }
            val refOk = !ref.isNullOrBlank() && ref.length >= 12 && !ref.uppercase().contains("X")
            if (refOk) {
                seenRefs.add(ref)
                collected.add(txn)
            } else if (pendingDetail == null && txn.received) {
                pendingDetail = txn
            }
        }

        emit("collected", mapOf("count" to collected.size))

        if (pendingDetail != null) {
            detailPhase = 0
            return Stage.DETAIL
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
                    val r = Rect()
                    row.getBoundsInScreen(r)
                    if (row.isClickable) {
                        row.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                    } else {
                        tap((r.centerX()).toFloat(), (r.centerY()).toFloat())
                    }
                    tapped = true
                    break
                }
                if (!tapped) {
                    val located = findNode(root) {
                        val s = it.text?.toString() ?: ""
                        Regex("\\d").containsMatchIn(s) && s.contains(pd.amount.toInt().toString())
                    }
                    if (located != null) {
                        val r = Rect()
                        located.getBoundsInScreen(r)
                        tap((r.centerX()).toFloat(), (r.centerY()).toFloat())
                    }
                }
                detailPhase = 1
            }
            1 -> {
                parseDetail(root, pendingDetail)
                performGlobalAction(GLOBAL_ACTION_BACK)
                detailPhase = 2
            }
            2 -> {
                val ref = pendingDetail?.paymentId
                if (!ref.isNullOrBlank()) {
                    seenRefs.add(ref.filterNot { it == ' ' })
                    if (pendingDetail !in collected) collected.add(pendingDetail!!)
                }
                pendingDetail = null
                detailPhase = 0
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
                for (k in arrayOf("imported", "ref_duplicates", "fingerprint_duplicates", "in_batch_duplicates", "auto_matched")) {
                    if (p.has(k)) counts[k] = p.get(k)
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
            }
        }.start()
    }

    // ---------- blocking screens ----------

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

        val ref = Regex("UPI[/\\s]?([A-Za-z0-9_-]{10,})", RegexOption.IGNORE_CASE).find(joined)
            ?.groupValues?.get(1)?.replace(" ", "")

        val time = parseTime(joined)

        return ScrapedTxn(
            paymentId = ref,
            amount = amount,
            payerName = payer?.ifBlank { null },
            transactionDate = lastHeaderDate,
            paymentTime = time,
            received = received
        )
    }

    private fun parseTime(joined: String): String? {
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

        val date = Regex("\\bdate\\b\\s*:\\s*(\\d{1,2}\\s+[A-Za-z]{3,9},\\s*\\d{2,4}|\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{2,4})", RegexOption.IGNORE_CASE).find(joined)?.groupValues?.get(1)
            ?: Regex("(\\d{1,2}\\s+[A-Za-z]{3,9},?\\s*\\d{2,4})").find(joined)?.groupValues?.get(1)
        if (date != null) txn.transactionDate = parseHeaderFromText(date)

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
        clickableRows(root, out)
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

    private fun findNode(root: AccessibilityNodeInfo?, pred: (AccessibilityNodeInfo) -> Boolean): AccessibilityNodeInfo? {
        if (root == null) return null
        if (pred(root)) return root
        for (i in 0 until root.childCount) {
            val r = findNode(root.getChild(i), pred)
            if (r != null) return r
        }
        return null
    }

    private fun collectTexts(node: AccessibilityNodeInfo?, out: MutableList<String>) {
        if (node == null) return
        node.text?.toString()?.takeIf { it.isNotBlank() }?.let { out.add(it.trim()) }
        node.contentDescription?.toString()?.takeIf { it.isNotBlank() }?.let { out.add(it.trim()) }
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            if (child === node) continue
            collectTexts(child, out)
        }
    }

    private fun textsJoined(root: AccessibilityNodeInfo): String {
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