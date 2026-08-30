package com.ucs.scrapper

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