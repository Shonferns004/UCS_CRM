package com.ucs.scrapper

import android.content.Intent
import android.net.Uri
import android.provider.Settings
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        ScraperConfig.init(this)

        val channel = MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "com.ucs.scrapper/channel")
        ServiceBridge.channel = channel

        channel.setMethodCallHandler { call, result ->
            when (call.method) {
                "getConfig" -> result.success(mapOf("config" to ScraperConfig.getAll()))
                "setConfig" -> {
                    val map = call.arguments as? Map<*, *>
                    val clean = map?.entries?.associate { it.key.toString() to it.value } ?: emptyMap()
                    ScraperConfig.setAll(clean)
                    result.success(true)
                }
                "getServiceState" -> {
                    val svc = ScraperAccessibilityService.instance
                    result.success(mapOf(
                        "connected" to (svc != null),
                        "running" to (svc?.isRunning() ?: false)
                    ))
                }
                "start" -> {
                    val svc = ScraperAccessibilityService.instance
                    if (svc == null) {
                        result.success(mapOf("ok" to false, "message" to "Accessibility service not connected. Enable 'UCS GPay Scraper' in Settings > Accessibility, then tap Start again."))
                    } else {
                        val args = call.arguments as? Map<*, *>
                        val backendUrl = args?.get("backendUrl")?.toString() ?: ""
                        val apiKey = args?.get("apiKey")?.toString() ?: ""
                        svc.startRun(backendUrl, apiKey)
                        val km = getSystemService(android.app.KeyguardManager::class.java)
                        if (km.isKeyguardLocked) km.requestDismissKeyguard(this, null)
                        result.success(mapOf("ok" to true))
                    }
                }
                "stop" -> {
                    ScraperAccessibilityService.instance?.stopRun(uploadCollected = true)
                    result.success(true)
                }
                "openAccessibilitySettings" -> {
                    try {
                        val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        startActivity(intent)
                        result.success(true)
                    } catch (e: Exception) {
                        result.success(false)
                    }
                }
                "getOverlayState" -> {
                    result.success(mapOf(
                        "connected" to (ScraperAccessibilityService.instance != null),
                        "enabled" to ScraperConfig.getBool("overlayEnabled", false),
                        "paymentMethod" to (ScraperConfig.get("paymentMethod") ?: "Google Pay"),
                        "receivedBank" to (ScraperConfig.get("receivedBank") ?: ""),
                        "modeOfPayment" to (ScraperConfig.get("modeOfPayment") ?: ""),
                        "overlayOpacity" to (ScraperConfig.get("overlayOpacity")?.toFloatOrNull() ?: 1.0f)
                    ))
                }
                "setOverlayOpacity" -> {
                    val value = (call.arguments as? Number)?.toFloat() ?: 1.0f
                    val svc = ScraperAccessibilityService.instance
                    if (svc != null) OverlayManager.setOverlayOpacity(svc, value)
                    else ScraperConfig.setAll(mapOf("overlayOpacity" to value.toString()))
                    result.success(true)
                }
                "setOverlay" -> {
                    val on = call.arguments as? Boolean ?: false
                    val svc = ScraperAccessibilityService.instance
                    if (on && svc == null) {
                        result.success(mapOf("ok" to false, "message" to "Accessibility service not connected. Enable it first."))
                    } else {
                        if (on && !Settings.canDrawOverlays(this)) {
                            val intent = Intent(
                                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                                Uri.parse("package:$packageName")
                            )
                            startActivity(intent)
                        }
                        svc?.let { OverlayManager.setEnabled(it, on) }
                        result.success(mapOf("ok" to true))
                    }
                }
                "setPaymentMethod" -> {
                    val m = call.arguments?.toString() ?: "Google Pay"
                    ScraperConfig.setAll(mapOf("paymentMethod" to m))
                    result.success(true)
                }
                "captureNow" -> {
                    val svc = ScraperAccessibilityService.instance
                    if (svc == null) {
                        result.success(mapOf("ok" to false, "message" to "Accessibility service not connected."))
                    } else {
                        svc.captureTransaction()
                        result.success(mapOf("ok" to true))
                    }
                }
                "setInspect" -> {
                    val on = call.arguments as? Boolean ?: false
                    ScraperAccessibilityService.instance?.setInspectMode(on)
                    result.success(true)
                }
                "inspectNow" -> {
                    val lines = ScraperAccessibilityService.instance?.dumpWindow() ?: listOf("accessibility service not connected")
                    result.success(mapOf("lines" to lines))
                }
                "trainStart" -> {
                    val svc = ScraperAccessibilityService.instance
                    if (svc == null) {
                        result.success(mapOf("ok" to false, "message" to "Accessibility service not connected. Enable 'UCS GPay Scraper' first."))
                    } else {
                        val km = getSystemService(android.app.KeyguardManager::class.java)
                        val locked = km.isKeyguardLocked
                        svc.startTraining()
                        if (locked) km.requestDismissKeyguard(this, null)
                        result.success(mapOf("ok" to true))
                    }
                }
                "trainStop" -> {
                    result.success(ScraperAccessibilityService.instance?.stopTraining() ?: 0)
                }
                "trainState" -> {
                    val svc = ScraperAccessibilityService.instance
                    result.success(mapOf(
                        "connected" to (svc != null),
                        "training" to (svc?.isTraining() ?: false),
                        "steps" to (svc?.trainedCount() ?: 0)
                    ))
                }
                else -> result.notImplemented()
            }
        }
    }

    override fun onDestroy() {
        ServiceBridge.channel = null
        super.onDestroy()
    }
}