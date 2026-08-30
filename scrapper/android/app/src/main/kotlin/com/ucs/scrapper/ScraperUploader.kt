package com.ucs.scrapper

import org.json.JSONArray
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

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

    fun knownRefs(backendUrl: String, apiKey: String, projectId: String): List<String> {
        val base = backendUrl.trim().trimEnd('/')
        return try {
            val q = URLEncoder.encode(projectId, StandardCharsets.UTF_8.toString())
            val url = URL("$base/api/accounts/scraper/known-refs?projectId=$q&days=3")
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "GET"
            conn.setRequestProperty("X-Scraper-Key", apiKey)
            conn.connectTimeout = 10000
            conn.readTimeout = 20000
            val code = conn.responseCode
            if (code !in 200..299) return emptyList()
            val txt = conn.inputStream.bufferedReader().use { it.readText() }
            val obj = try { JSONObject(txt) } catch (e: Exception) { return emptyList() }
            val arr = obj.optJSONArray("refs") ?: return emptyList()
            return (0 until arr.length()).map { arr.getString(it).trim() }.filter { it.isNotEmpty() }
        } catch (e: Exception) {
            emptyList()
        }
    }
}