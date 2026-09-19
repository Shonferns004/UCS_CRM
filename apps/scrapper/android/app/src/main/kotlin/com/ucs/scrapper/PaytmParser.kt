package com.ucs.scrapper

import android.graphics.Rect
import android.os.SystemClock
import android.util.Log
import android.view.accessibility.AccessibilityNodeInfo

/**
 * Paytm payment-detail parser.
 *
 * Paytm's receipt screens render as free text (amount / date / transaction id /
 * sender) with no stable resource-ids, and the detail page can split its fields
 * across the fold. Capture therefore scrolls and merges the page into a single
 * text buffer, then applies the shared free-text heuristics — isolated here so
 * Paytm-specific tuning never affects GPay or Razorpay.
 *
 * Paytm Business masks the transaction id on the receipt (e.g. "202...195556").
 * The only unmasked copy appears briefly as a toast ("Transaction ID <id>
 * Copied") after the row's "Copy" button is tapped, so the parser taps it
 * during [surfaceHiddenText] and recovers the full digit run.
 */
class PaytmParser(private val svc: ScraperAccessibilityService) : TransactionParser {

    override fun needsScroll(): Boolean = true

    override fun isDetailScreen(root: AccessibilityNodeInfo): Boolean {
        val text = svc.textsJoined(root).lowercase()
        return Regex(
            "(transaction id|upi transaction|upi ref|reference no|payment id|paytm transaction|order id|google transaction id|paid to|received from|transaction status|ref number)"
        ).containsMatchIn(text)
    }

    override fun surfaceHiddenText(root: AccessibilityNodeInfo?) {
        var r = root ?: svc.rootInActiveWindow ?: return
        // Bring the Copy row into view. The transaction id (or, on UPI Lite
        // receipts, the order id) sits below the fold, so scroll down until a
        // "Copy" aligned with that label is visible before interacting with it.
        var label = "Transaction ID"
        var copy = copyForLabel(r, label) ?: copyForLabel(r, "Order ID").also { label = "Order ID" }
        var scrolls = 0
        while (copy == null && scrolls < 4) {
            svc.swipeDownOnce()
            SystemClock.sleep(350)
            r = svc.rootInActiveWindow ?: continue
            copy = copyForLabel(r, label) ?: copyForLabel(r, "Order ID").also { label = "Order ID" }
            scrolls++
        }
        val target = copy
        if (target == null) {
            val probe = mutableListOf<String>()
            svc.collectTexts(svc.rootInActiveWindow, probe)
            val pj = probe.joinToString("\n")
            Log.d(
                "UcsScrapper",
                "paytm copy NOT found after $scrolls scrolls; hasTxnIdLabel=${pj.contains("Transaction ID", true)} " +
                    "hasOrderIdLabel=${pj.contains("Order ID", true)} hasCopy=${pj.contains("Copy", true)}"
            )
            return
        }
        val tr = Rect()
        target.getBoundsInScreen(tr)
        Log.d("UcsScrapper", "paytm tapping copy for [$label] at $tr")
        try {
            svc.tapCenter(target)
        } catch (ex: Exception) {
            Log.w("UcsScrapper", "paytm tap copy failed: " + ex.message)
            return
        }
        // The revealed value appears in a transient toast ("<label> <token>
        // Copied"); poll a few times to catch it before it vanishes. Try the
        // tapped label first, then any long numeric run, then any token before
        // "Copied".
        var recovered: String? = null
        for (attempt in 0 until 6) {
            SystemClock.sleep(250)
            val texts = mutableListOf<String>()
            svc.collectTexts(svc.rootInActiveWindow, texts)
            val joined = texts.joinToString("\n")
            recovered = Regex(Regex.escape(label) + "\\s+([A-Za-z0-9._-]{10,})\\s+Copied", RegexOption.IGNORE_CASE)
                .find(joined)?.groupValues?.get(1)
                ?: Regex("\\d{20,}").find(joined)?.value
                ?: Regex("([A-Za-z0-9._-]{12,})\\s+Copied", RegexOption.IGNORE_CASE)
                    .find(joined)?.groupValues?.get(1)
            if (recovered != null) break
        }
        if (recovered != null) {
            svc.recoveredRef = recovered
            Log.d("UcsScrapper", "paytm recovered ref=[$recovered]")
        } else {
            val probe = mutableListOf<String>()
            svc.collectTexts(svc.rootInActiveWindow, probe)
            Log.d("UcsScrapper", "paytm toast NOT seen; tree=[${probe.joinToString(" | ").take(300)}]")
        }
    }

    /** Finds the "Copy" node for the given [label], or null.
     *
     *  WebView rows can't be trusted for [AccessibilityNodeInfo.isVisibleToUser]
     *  (often false even when on screen), so visibility is judged by bounds
     *  only: prefer a Copy on the same row as the label, else fall back to the
     *  nearest Copy at/below the label's row. */
    private fun copyForLabel(root: AccessibilityNodeInfo, label: String): AccessibilityNodeInfo? {
        val labelNode = svc.findNode(root) {
            val t = it.text?.toString()?.trim() ?: return@findNode false
            t == label || t.startsWith(label)
        } ?: return null
        val lr = Rect()
        labelNode.getBoundsInScreen(lr)
        val copies = mutableListOf<AccessibilityNodeInfo>()
        collectCopyNodes(root, copies)
        if (copies.isEmpty()) return null
        copies.firstOrNull { node ->
            val nr = Rect()
            node.getBoundsInScreen(nr)
            !nr.isEmpty && nr.centerY() in (lr.top - 60)..(lr.bottom + 60)
        }?.let { return it }
        var best: AccessibilityNodeInfo? = null
        var bestDy = Int.MAX_VALUE
        for (node in copies) {
            val nr = Rect()
            node.getBoundsInScreen(nr)
            if (nr.isEmpty) continue
            val dy = nr.centerY() - lr.centerY()
            if (dy >= -60 && dy < bestDy) {
                bestDy = dy
                best = node
            }
        }
        return best
    }

    private fun collectCopyNodes(node: AccessibilityNodeInfo?, out: MutableList<AccessibilityNodeInfo>) {
        if (node == null) return
        if (node.text?.toString()?.trim() == "Copy") out.add(node)
        for (i in 0 until node.childCount) collectCopyNodes(node.getChild(i), out)
    }

    override fun parse(root: AccessibilityNodeInfo?, merged: List<String>?, txn: ScrapedTxn) {
        // Prefer the merged text collected by scrolling the (scrollable) detail
        // screen; it contains fields that may sit below the visible fold. If no
        // merged text was supplied, fall back to the current frame's text.
        val texts: List<String> = merged ?: run {
            val m = mutableListOf<String>()
            if (root != null) svc.collectTexts(root, m)
            m
        }
        val joined = texts.joinToString("\n")

        // Amount (common to all UPI receipt screens): ₹ / Rs / INR + number.
        txn.amount = svc.extractAmount(joined) ?: txn.amount

        // Date + time.
        val date = svc.extractDate(joined)
        if (date != null) txn.transactionDate = date
        val time = svc.parseTime(joined)
        if (time != null) txn.paymentTime = time

        // Transaction / UPI reference (app-agnostic patterns), preferring the
        // full unmasked id. Priority:
        //  1. svc.recoveredRef — set by surfaceHiddenText from the copy-toast.
        //  2. the copy-toast itself inside this frame's merged text
        //     ("<label> <token> Copied"), read fully.
        //  3. the shared app-agnostic extractor (falls back to a 12-16 digit run).
        val toastId = Regex(
            "(?:Transaction\\s+ID|Order\\s+ID|RRN)\\s+([A-Za-z0-9._-]{10,})\\s+Copied",
            RegexOption.IGNORE_CASE
        ).find(joined)?.groupValues?.get(1)
        txn.paymentId = svc.recoveredRef
            ?: toastId
            ?: svc.extractUpiRef(joined)
            ?: txn.paymentId

        // Payer / sender heuristics.
        txn.payerName = svc.extractPayer(joined)
        Log.d(
            "UcsScrapper",
            "paytm payer=[${txn.payerName}] ref=[${txn.paymentId}] joined=[${joined.take(600)}]"
        )

        // If still no date, guarantee today.
        if (txn.transactionDate.isNullOrBlank()) txn.transactionDate = svc.fallbackDate()
    }
}
