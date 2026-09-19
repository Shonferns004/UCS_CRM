package com.ucs.scrapper

import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale

data class ScrapedTxn(
    var paymentId: String? = null,
    var amount: Double = 0.0,
    var payerName: String? = null,
    var transactionDate: String? = null,
    var paymentTime: String? = null,
    var received: Boolean = true,
    var source: String? = null,
    var mop: String? = null,
    var bankName: String? = null
) {

    fun fingerprint(): String = buildString {
        append(String.format("%.2f", amount).replace(".", ""))
        append("|").append((transactionDate ?: "").trim())
        append("|").append((payerName ?: "").trim().lowercase())
    }

    fun toJson(): JSONObject {
        val o = JSONObject()
        // Never send an invalid/blank transaction date - the backend rejects
        // import without a valid yyyy-MM-dd date. If the scraped value is blank
        // OR not in yyyy-MM-dd form, fall back to today so the row is never
        // silently dropped by the backend's date validation.
        val d = transactionDate?.trim()?.takeIf { it.isNotEmpty() }
        val date = if (d != null && Regex("""\d{4}-\d{2}-\d{2}""").matches(d))
            d
        else
            SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Calendar.getInstance().time)
        o.put("payment_id", paymentId ?: JSONObject.NULL)
        o.put("amount", amount)
        o.put("payer_name", payerName ?: JSONObject.NULL)
        o.put("transaction_date", date)
        o.put("payment_time", paymentTime ?: JSONObject.NULL)
        if (!mop.isNullOrBlank()) o.put("mop", mop)
        if (!bankName.isNullOrBlank()) o.put("bank_name", bankName)
        if (!source.isNullOrBlank()) o.put("source", source)
        return o
    }
}