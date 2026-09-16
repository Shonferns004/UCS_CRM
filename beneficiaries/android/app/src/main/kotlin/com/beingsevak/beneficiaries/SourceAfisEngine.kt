package com.beingsevak.beneficiaries

import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.util.Log
import com.machinezoo.sourceafis.FingerprintImage
import com.machinezoo.sourceafis.FingerprintImageOptions
import com.machinezoo.sourceafis.FingerprintMatcher
import com.machinezoo.sourceafis.FingerprintTemplate
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import java.util.concurrent.Executors

/**
 * On-device fingerprint template extraction and matching powered by
 * SourceAFIS for Java (Apache-2.0). No vendor SDK, no encryption, no UIDAI.
 *
 * Templates are SourceAFIS-native serialized bytes (base64 over the bridge).
 * Threshold ~40 corresponds to FMR ~0.01%.
 */
object SourceAfisEngine {

    private const val TAG = "SourceAfisEngine"
    const val DEFAULT_THRESHOLD = 40.0
    private const val DEFAULT_DPI = 500.0

    private val executor = Executors.newSingleThreadExecutor { r ->
        Thread(r, "sourceafis").apply { isDaemon = true }
    }
    private val mainHandler = Handler(Looper.getMainLooper())

    /** Extract a SourceAFIS template (base64) from a raw 8-bit grayscale image. */
    fun extract(pixelsB64: String, width: Int, height: Int, dpi: Double): String {
        val pixels = Base64.decode(pixelsB64, Base64.DEFAULT)
        val expected = width * height
        require(pixels.size == expected) {
            "Image dimensions $width x $height do not match payload size ${pixels.size} (expected $expected)"
        }
        val image = FingerprintImage(
            width,
            height,
            pixels,
            FingerprintImageOptions().dpi(if (dpi > 0) dpi else DEFAULT_DPI)
        )
        val template = FingerprintTemplate(image)
        return Base64.encodeToString(template.toByteArray(), Base64.NO_WRAP)
    }

    /** 1:1 match. Returns matched flag and similarity score. */
    fun verify(probeB64: String, candidateB64: String, threshold: Double): Pair<Boolean, Double> {
        val matcher = FingerprintMatcher(FingerprintTemplate(Base64.decode(probeB64, Base64.DEFAULT)))
        val score = matcher.match(FingerprintTemplate(Base64.decode(candidateB64, Base64.DEFAULT)))
        return (score >= threshold) to score
    }

    /** 1:N match. Returns the index + score of every candidate above the threshold. */
    fun identify(probeB64: String, candidates: List<String>, threshold: Double): List<Map<String, Any>> {
        val matcher = FingerprintMatcher(FingerprintTemplate(Base64.decode(probeB64, Base64.DEFAULT)))
        val results = mutableListOf<Map<String, Any>>()
        candidates.forEachIndexed { index, candidateB64 ->
            try {
                val score = matcher.match(FingerprintTemplate(Base64.decode(candidateB64, Base64.DEFAULT)))
                if (score >= threshold) {
                    results.add(mapOf("index" to index, "score" to score))
                }
            } catch (e: Exception) {
                Log.w(TAG, "skipping candidate $index", e)
            }
        }
        return results
    }

    // ─── Async bridge wrappers (run off the platform thread) ────────────

    fun extractAsync(call: MethodCall, result: MethodChannel.Result) {
        runAsync({ result.success(extractResultPayload(call)) }, result)
    }

    fun verifyAsync(call: MethodCall, result: MethodChannel.Result) {
        runAsync({ result.success(verifyResultPayload(call)) }, result)
    }

    fun identifyAsync(call: MethodCall, result: MethodChannel.Result) {
        runAsync({ result.success(identifyResultPayload(call)) }, result)
    }

    private fun extractResultPayload(call: MethodCall): Map<String, Any> {
        val pixels = call.argument<String>("pixels") ?: ""
        val width = call.argument<Int>("width") ?: 0
        val height = call.argument<Int>("height") ?: 0
        val dpi = (call.argument<Number>("dpi") ?: DEFAULT_DPI).toDouble()
        return mapOf("success" to true, "template" to extract(pixels, width, height, dpi))
    }

    private fun verifyResultPayload(call: MethodCall): Map<String, Any> {
        val probe = call.argument<String>("probe_template") ?: ""
        val candidate = call.argument<String>("candidate_template") ?: ""
        val threshold = (call.argument<Number>("threshold") ?: DEFAULT_THRESHOLD).toDouble()
        val (matched, score) = verify(probe, candidate, threshold)
        return mapOf("matched" to matched, "score" to score)
    }

    private fun identifyResultPayload(call: MethodCall): Map<String, Any> {
        val probe = call.argument<String>("probe_template") ?: ""
        val candidates = call.argument<List<String>>("candidate_templates") ?: emptyList()
        val threshold = (call.argument<Number>("threshold") ?: DEFAULT_THRESHOLD).toDouble()
        return mapOf("matches" to identify(probe, candidates, threshold), "count" to candidates.size)
    }

    private fun runAsync(task: () -> Any, result: MethodChannel.Result) {
        executor.execute {
            try {
                val payload = task()
                mainHandler.post { result.success(payload) }
            } catch (e: Exception) {
                Log.e(TAG, "sourceafis task failed", e)
                mainHandler.post { result.success(mapOf("success" to false, "error" to (e.message ?: e.toString()))) }
            }
        }
    }
}