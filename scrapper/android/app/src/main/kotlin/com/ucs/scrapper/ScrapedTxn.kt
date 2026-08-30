package com.ucs.scrapper

import org.json.JSONObject

data class ScrapedTxn(
    var paymentId: String? = null,
    var amount: Double = 0.0,
    var payerName: String? = null,
    var transactionDate: String? = null,
    var paymentTime: String? = null,
    var received: Boolean = true
) {
    val mop: String get() = "UPI"

    fun fingerprint(): String = buildString {
        append(String.format("%.2f", amount).replace(".", ""))
        append("|").append((transactionDate ?: "").trim())
        append("|").append((payerName ?: "").trim().lowercase())
    }

    fun toJson(): JSONObject {
        val o = JSONObject()
        o.put("payment_id", paymentId ?: JSONObject.NULL)
        o.put("amount", amount)
        o.put("payer_name", payerName ?: JSONObject.NULL)
        o.put("transaction_date", transactionDate ?: JSONObject.NULL)
        o.put("payment_time", paymentTime ?: JSONObject.NULL)
        o.put("mop", mop)
        return o
    }
}