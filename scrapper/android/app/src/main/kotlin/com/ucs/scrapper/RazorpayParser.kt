package com.ucs.scrapper

import android.util.Log
import android.view.accessibility.AccessibilityNodeInfo

/**
 * Razorpay payment-detail parser.
 *
 * Razorpay renders every transaction detail field (amount, payment id, created
 * date, customer) against stable resource-ids, so this parser reads nodes
 * directly instead of relying on free-text heuristics:
 *   - amount   -> node whose resource-id ends with "ds-amount"
 *   - fields   -> label/value nodes both having resource-id "ds-text"
 *   - customer -> the paying customer's email or phone on the detail card
 *
 * The detail screen fits on a single page, so no scrolling is required.
 */
class RazorpayParser(private val svc: ScraperAccessibilityService) : TransactionParser {

    override fun needsScroll(): Boolean = false

    override fun isDetailScreen(root: AccessibilityNodeInfo): Boolean {
        val text = svc.textsJoined(root).lowercase()
        // Razorpay's transactions LIST also contains the word "payment id"
        // ("Search using payment id" box), so a bare keyword match would turn
        // the list into a false "detail" screen. Require the actual detail
        // markers instead: its amount node ("ds-amount") plus either the
        // Payment ID / Created On label pair or the "Payment Amount" title.
        val hasAmountNode = svc.findNode(root) {
            it.viewIdResourceName?.endsWith("ds-amount") == true
        } != null
        if (!hasAmountNode) return false
        return text.contains("payment amount") ||
            (text.contains("payment id") && text.contains("created on"))
    }

    override fun parse(root: AccessibilityNodeInfo?, merged: List<String>?, txn: ScrapedTxn) {
        if (root != null) parseRazorpayDetail(root, txn)
        // If no date was read, guarantee today so the backend never rejects it.
        if (txn.transactionDate.isNullOrBlank()) txn.transactionDate = svc.fallbackDate()
        Log.d(
            "UcsScrapper",
            "razorpay payer=[${txn.payerName}] ref=[${txn.paymentId}] amt=[${txn.amount}] date=[${txn.transactionDate}]"
        )
    }

    private fun parseRazorpayDetail(root: AccessibilityNodeInfo, txn: ScrapedTxn) {
        // Amount node ("₹ 300.00").
        val amountNode = svc.findNode(root) {
            it.viewIdResourceName?.endsWith("ds-amount") == true
        }
        amountNode?.text?.toString()?.let { raw ->
            Regex("([\\d,]+(?:\\.\\d{1,2})?)").find(raw)?.groupValues?.get(1)
                ?.replace(",", "")?.toDoubleOrNull()?.takeIf { it > 0 }?.let { txn.amount = it }
        }
        if (txn.amount == null) svc.extractAmount(svc.textsJoined(root))?.let { txn.amount = it }

        // Razorpay renders every detail field as a "label" node followed by a
        // "value" node, both with resource-id "ds-text". Walk them in order.
        val dsTexts = mutableListOf<String>()
        svc.collectByResourceId(root, "ds-text", dsTexts)
        val dense = svc.textsDense(dsTexts.joinToString("\n"))
        for (i in 0 until dense.size) {
            val cur = dense[i].trim()
            val value = dense.getOrNull(i + 1)?.trim() ?: continue
            when {
                cur.equals("Payment ID", true) -> {
                    txn.paymentId = svc.extractUpiRef(value) ?: value.trim()
                }
                cur.equals("Created On", true) -> {
                    svc.parseDayMonth(value)?.let { txn.transactionDate = it }
                    svc.parseTime(value)?.let { txn.paymentTime = it }
                }
            }
        }

        // Payer: Razorpay's "customer details" card lists the paying customer's
        // email (or phone) — the closest thing to a sender on a business
        // payment account. Prefer the email; strip the "@...com" part so the
        // payer name is just the account name, not the whole address.
        val email = svc.findNode(root) {
            Regex("^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$")
                .matches(it.text?.toString()?.trim() ?: "")
        }
        if (email != null) {
            val raw = email.text?.toString()?.trim() ?: ""
            val local = raw.substringBefore('@').trim().takeIf { it.isNotEmpty() } ?: raw
            txn.payerName = local.take(80)
        } else {
            val phone = svc.findNode(root) {
                val t = it.text?.toString()?.trim() ?: ""
                Regex("^\\+?\\d{10,13}$").matches(t)
            }
            if (phone != null) txn.payerName = phone.text?.toString()?.trim()?.take(80)
        }
    }
}
