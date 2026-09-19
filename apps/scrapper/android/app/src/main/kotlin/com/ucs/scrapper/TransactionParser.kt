package com.ucs.scrapper

import android.view.accessibility.AccessibilityNodeInfo

/**
 * Identifies which payment app a capture should be routed to. Each app owns its
 * own detail-screen detection and parsing so GPay / Paytm / Razorpay logic never
 * bleeds into one another.
 */
enum class AppKind {
    GPAY,
    PAYTM,
    RAZORPAY,
    GENERIC,
}

/**
 * Contract every payment-app parser implements. The shared capture scaffold
 * (scroll-collect, validation, upload) is app-agnostic and only asks the parser
 * to (a) confirm the current screen is a transaction detail page and (b) fill
 * the [ScrapedTxn] from the visible/merged screen text.
 */
interface TransactionParser {

    /** True when the current frame is this app's transaction-detail screen. */
    fun isDetailScreen(root: AccessibilityNodeInfo): Boolean

    /**
     * Fills [txn] from the screen. [merged] is the scroll-merged text buffer
     * (one frame per line), or null when the screen fits on a single page.
     * [root] is the live node tree, used by parsers that read resource-ids.
     */
    fun parse(root: AccessibilityNodeInfo?, merged: List<String>?, txn: ScrapedTxn)

    /**
     * Whether this app's detail screen is scrollable and must be merged first.
     * Single-page screens (e.g. Razorpay) override this to false.
     */
    fun needsScroll(): Boolean = true

    /**
     * Optional per-app interaction that reveals text not shown statically on the
     * detail screen. For example Paytm masks its transaction id and only exposes
     * the full value as a short-lived toast when the row's "Copy" button is
     * tapped. Called by the capture scaffold (for scrollable apps) on the initial
     * frame before parsing begins. Default: no interaction.
     */
    fun surfaceHiddenText(root: AccessibilityNodeInfo?) {}
}

/** Maps an app package name to its [AppKind]. */
fun detectAppKind(pkg: String): AppKind = when {
    pkg.contains("razorpay") -> AppKind.RAZORPAY
    pkg.contains("paytm") -> AppKind.PAYTM
    pkg.contains("nbu.paisa") -> AppKind.GPAY
    else -> AppKind.GENERIC
}

/** Resolves the parser for an [AppKind]. GPay is also the generic fallback. */
fun parserFor(kind: AppKind, svc: ScraperAccessibilityService): TransactionParser = when (kind) {
    AppKind.RAZORPAY -> RazorpayParser(svc)
    AppKind.PAYTM -> PaytmParser(svc)
    AppKind.GPAY -> GpayParser(svc)
    AppKind.GENERIC -> GpayParser(svc)
}
