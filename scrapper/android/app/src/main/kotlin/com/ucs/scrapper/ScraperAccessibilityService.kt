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
        const val GPAY = "com.google.android.apps.nbu.paisa"
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
    private var historyClicked = false
    private var detailPhase = 0
    private var pendingDetail: ScrapedTxn? = null
    private var blockedNotified = false
    private var blockedSince = 0L

    private val collected = mutableListOf<ScrapedTxn>()
    private val seenRefs = HashSet<String>()
    private val seenPartial = HashSet<String>()
    private var lastHeaderDate: String? = null

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

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {}

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
        historyClicked = false; detailPhase = 0; pendingDetail = null
        lastHeaderDate = null
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
            val intent = packageManager.getLaunchIntentForPackage(GPAY)
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
        val rows = mutableListOf<AccessibilityNodeInfo>()
        clickableRows(root, rows)
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
        if (!historyClicked && historyText.isNotBlank()) {
            val q = historyText.lowercase()
            val link = findNode(root) {
                it.isClickable && ((it.text?.toString()?.lowercase() ?: "").contains(q) || (it.contentDescription?.toString()?.lowercase() ?: "").contains(q))
            }
            if (link != null) { link.performAction(AccessibilityNodeInfo.ACTION_CLICK); historyClicked = true }
        }
        if (scrollCount >= maxScrolls) {
            finishUpload("no new rows after $maxScrolls scrolls")
            return Stage.IDLE
        }
        scrollCount++
        swipeUp()
        return Stage.COLLECT
    }

    private fun stepDetail(root: AccessibilityNodeInfo): Stage {
        when (detailPhase) {
            0 -> {
                val pd = pendingDetail ?: return Stage.COLLECT
                val located = findNode(root) {
                    val s = it.text?.toString() ?: ""
                    Regex("\\d").containsMatchIn(s) && s.contains(pd.amount.toInt().toString())
                }
                if (located != null) {
                    val r = Rect()
                    located.getBoundsInScreen(r)
                    tap((r.centerX()).toFloat(), (r.centerY()).toFloat())
                } else {
                    val a = matchRowCoordinates(root, pd)
                    if (a != null) tap(a.first, a.second)
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

        val id = Regex("(?:UPI\\s*transaction\\s*ID|Transaction\\s*(?:ID|Id|id)|UPI\\s*Ref|Reference\\s*No|payment\\s*ID)\\s*[:.]?\\s*([A-Za-z0-9_-]{10,})").find(joined)?.groupValues?.get(1)
            ?: texts.firstOrNull { Regex("^[A-Za-z0-9]{16}$").matches(it.trim()) }?.trim()
        if (id != null && (txn.paymentId?.filterNot { it == ' ' } ?: "") != id) txn.paymentId = id

        val date = Regex("\\bdate\\b\\s*:\\s*(\\d{1,2}\\s+[A-Za-z]{3,9},\\s*\\d{2,4}|\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{2,4})", RegexOption.IGNORE_CASE).find(joined)?.groupValues?.get(1)
        if (date != null) txn.transactionDate = parseHeaderFromText(date)

        val relTime = Regex("\\btime\\b\\s*:\\s*(\\d{1,2}:\\d{2}\\s*(?:am|pm))", RegexOption.IGNORE_CASE).find(joined)
        if (relTime != null) txn.paymentTime = convert12(relTime.groupValues[1])
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

    private fun matchRowCoordinates(root: AccessibilityNodeInfo, pd: ScrapedTxn): Pair<Float, Float>? {
        val rows = mutableListOf<AccessibilityNodeInfo>()
        clickableRows(root, rows)
        for (row in rows) {
            if (!row.isVisibleToUser) continue
            val t = row.text?.toString() ?: ""
            val d = pd.amount.toInt().toString()
            if (t.contains(d)) {
                val r = Rect()
                row.getBoundsInScreen(r)
                if (r.width() > 0) {
                    val txn = parseRow(row)
                    if (txn != null && txn.amount == pd.amount) {
                        return (r.centerX()).toFloat() to (r.centerY()).toFloat()
                    }
                }
            }
        }
        return null
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