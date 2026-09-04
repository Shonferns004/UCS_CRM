package com.ucs.scrapper

import android.util.Log
import android.view.accessibility.AccessibilityNodeInfo

/**
 * Google Pay (GPay) payment-detail parser.
 *
 * GPay renders receipts as free text (amount / date / UPI reference / sender)
 * with no stable resource-ids, and the GPay Business detail page can split its
 * fields across the fold. Capture therefore scrolls and merges the page into a
 * single text buffer, then applies the shared free-text heuristics.
 *
 * GPay also serves as the generic fallback for any unmapped payment app.
 */
class GpayParser(private val svc: ScraperAccessibilityService) : TransactionParser {

    override fun needsScroll(): Boolean = true

    override fun isDetailScreen(root: AccessibilityNodeInfo): Boolean {
        val text = svc.textsJoined(root).lowercase()
        return Regex(
            "(transaction id|upi transaction|upi ref|reference no|payment id|paytm transaction|order id|google transaction id|paid to|received from|transaction status|ref number)"
        ).containsMatchIn(text)
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

        // Transaction / UPI reference (app-agnostic patterns).
        txn.paymentId = svc.extractUpiRef(joined) ?: txn.paymentId

        // Payer / sender heuristics.
        txn.payerName = svc.extractPayer(joined)
        Log.d(
            "UcsScrapper",
            "gpay payer=[${txn.payerName}] ref=[${txn.paymentId}] joined=[${joined.take(600)}]"
        )

        // If still no date, guarantee today.
        if (txn.transactionDate.isNullOrBlank()) txn.transactionDate = svc.fallbackDate()
    }
}
