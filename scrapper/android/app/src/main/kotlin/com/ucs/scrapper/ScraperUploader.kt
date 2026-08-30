package com.ucs.scrapper

import org.json.JSONArray
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

object ScraperUploader {
    data class Result(val ok: Boolean, val message: String, val payload: JSONObject? = null)

    fun upload(
        backendUrl: String,
        apiKey: String,
        projectId: String,
        runId: String,
        deviceLabel: String,
        txns: List<ScrapedTxn>
    ): Result {
        val base = backendUrl.trim().trimEnd('/')
        return try {
            val url = URL("$base/api/accounts/scraper/device-import")
            val body = JSONObject()
            body.put("project_id", projectId)
            body.put("run_id", runId)
            body.put("device_label", deviceLabel)
            val arr = JSONArray()
            for (t in txns) arr.put(t.toJson())
            body.put("transactions", arr)

            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "POST"
            conn.setRequestProperty("Content-Type", "application/json")
            conn.setRequestProperty("X-Scraper-Key", apiKey)
            conn.connectTimeout = 15000
            conn.readTimeout = 60000
            conn.doOutput = true
            OutputStreamWriter(conn.outputStream, Charsets.UTF_8).use { it.write(body.toString()) }
            val code = conn.responseCode
            val txt = (if (code in 200..299) conn.inputStream else conn.errorStream)
                ?.bufferedReader()?.use { it.readText() } ?: ""
            Result(
                code in 200..299,
                "$code ${txt.take(400)}",
                if (txt.isNotBlank()) { try { JSONObject(txt) } catch (e: Exception) { null } } else null
            )
        } catch (e: Exception) {
            Result(false, e.message ?: "upload error")
        }
    }
}