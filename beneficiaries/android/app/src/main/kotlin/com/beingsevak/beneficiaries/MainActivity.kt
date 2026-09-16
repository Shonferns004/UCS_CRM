package com.beingsevak.beneficiaries

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import android.os.Build
import android.util.Base64
import android.util.Log
import io.flutter.embedding.android.FlutterFragmentActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import org.xmlpull.v1.XmlPullParser
import org.xmlpull.v1.XmlPullParserFactory
import java.io.StringReader
import java.net.Inet4Address
import java.net.NetworkInterface
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.Collections

class MainActivity : FlutterFragmentActivity(), MethodChannel.MethodCallHandler, EventChannel.StreamHandler {

    companion object {
        private const val TAG = "BiometricPlugin"
        private const val METHOD_CHANNEL = "com.beingsevak.biometric"
        private const val EVENT_CHANNEL = "com.beingsevak.biometric/events"
        private const val REQUEST_CAPTURE = 1001
        private const val REQUEST_VERIFY = 1002

        // RD Service package names
        private val RD_SERVICE_PACKAGES = mapOf(
            "mantra_mfs100" to "com.mantra.mfs100.rdservice",
            "mantra_mfs110" to "com.mantra.mfs110.rdservice",
            "mantra_l1" to "com.mantra.MFS110AVDM",
            "morpho_mso1300" to "com.scl.rdservice",
            "morpho_mso1300e3" to "com.idemia.morpho.rdservice",
            "startek_fm2200" to "com.acpl.rdservice",
            "secugen" to "com.secugen.rdservice",
            "precision" to "com.precision.rdservice",
            "zkteco" to "com.zkteco.rdservice",
        )
    }

    private var methodChannel: MethodChannel? = null
    private var eventChannel: EventChannel? = null
    private var eventSink: EventChannel.EventSink? = null
    private var usbReceiver: BroadcastReceiver? = null
    private var detectedDeviceType: String? = null
    private var pendingResult: MethodChannel.Result? = null
    private var pendingVerifyTemplate: String? = null
    private var pendingResultReplied = false
    private val rawUsb by lazy { Mfs110RawUsb(this) }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        methodChannel = MethodChannel(flutterEngine.dartExecutor.binaryMessenger, METHOD_CHANNEL)
        methodChannel?.setMethodCallHandler(this)

        eventChannel = EventChannel(flutterEngine.dartExecutor.binaryMessenger, EVENT_CHANNEL)
        eventChannel?.setStreamHandler(this)

        registerUsbReceiver()
        Log.d(TAG, "Biometric plugin initialized")
    }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "detectDevices" -> detectDevices(result)
            "initializeDevice" -> initializeDevice(call, result)
            "capture" -> captureFingerprint(call, result)
            "verify" -> verifyFingerprint(call, result)
            "stopCapture" -> stopCapture(result)
            "getDeviceStatus" -> getDeviceStatus(result)
            "getLocalIpAddresses" -> getLocalIpAddresses(result)
            "diagnose" -> diagnose(result)
            "rawConnect" -> rawUsb.connect(result)
            "rawDisconnect" -> rawUsb.disconnect(result)
            "rawCapture" -> rawUsb.capture(result)
            "rawGetInfo" -> rawUsb.getInfo(result)
            "sourceafisExtract" -> SourceAfisEngine.extractAsync(call, result)
            "sourceafisVerify" -> SourceAfisEngine.verifyAsync(call, result)
            "sourceafisIdentify" -> SourceAfisEngine.identifyAsync(call, result)
            else -> result.notImplemented()
        }
    }

    override fun onListen(arguments: Any?, events: EventChannel.EventSink?) {
        eventSink = events
    }

    override fun onCancel(arguments: Any?) {
        eventSink = null
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)

        val resolveCapture = requestCode == REQUEST_CAPTURE || requestCode == REQUEST_VERIFY
        if (!resolveCapture) return

        val result = pendingResult ?: return
        val verifyTemplate = pendingVerifyTemplate

        if (resultCode == Activity.RESULT_OK && data != null) {
            val pidData = data.getStringExtra("PID_DATA") ?: data.getStringExtra("OUTPUT") ?: ""
            val quality = data.getStringExtra("QUALITY") ?: data.getStringExtra("FingerQuality") ?: "0"

            if (pidData.isNotEmpty()) {
                val fidData = extractFidFromPid(pidData)
                val timestamp = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US).format(Date())
                val deviceName = getDisplayName(detectedDeviceType ?: "generic")

                sendEvent(mapOf("type" to "capture_completed", "device_type" to (detectedDeviceType ?: "generic")))

                if (verifyTemplate != null) {
                    val matched = compareTemplates(verifyTemplate, fidData)
                    sendEvent(mapOf("type" to "verify_completed", "matched" to matched))
                    replySuccess(result, matched)
                } else {
                    replySuccess(result, mapOf(
                        "success" to true,
                        "pid_data" to pidData,
                        "fid_data" to fidData,
                        "quality_score" to quality,
                        "template" to fidData,
                        "device_info" to deviceName,
                        "timestamp" to timestamp,
                    ))
                }
            } else {
                sendEvent(mapOf("type" to "capture_failed", "error" to "No fingerprint data"))
                replySuccess(result, mapOf("success" to false, "error" to "No fingerprint data captured"))
            }
        } else {
            sendEvent(mapOf("type" to "capture_failed", "error" to "Capture cancelled or failed"))
            replySuccess(result, mapOf("success" to false, "error" to "Capture cancelled or failed"))
        }

        pendingResult = null
        pendingVerifyTemplate = null
        pendingResultReplied = false
    }

    // ─── Device Detection ─────────────────────────────────────────────

    private fun detectDevices(result: MethodChannel.Result) {
        try {
            val devices = mutableListOf<Map<String, Any>>()

            // Direct (raw) USB capture, no vendor/UIDAI stack required.
            if (rawUsb.getDevice() != null) {
                devices.add(mapOf(
                    "type" to "mfs110Raw",
                    "display_name" to "Mantra MFS110 (Raw USB)",
                    "package_name" to "",
                    "rd_service_package" to "",
                    "is_available" to true,
                ))
            }

            val usbManager = getSystemService(Context.USB_SERVICE) as UsbManager

            for ((key, packageName) in RD_SERVICE_PACKAGES) {
                val isInstalled = isPackageInstalled(packageName)
                devices.add(mapOf(
                    "type" to key,
                    "display_name" to getDisplayName(key),
                    "package_name" to packageName,
                    "rd_service_package" to packageName,
                    "is_available" to isInstalled,
                ))
            }

            val connectedDevices = usbManager.deviceList
            for ((_, device) in connectedDevices) {
                if (isBiometricDevice(device)) {
                    val deviceName = getDeviceName(device)
                    if (devices.none { it["display_name"] == deviceName }) {
                        devices.add(mapOf(
                            "type" to "generic",
                            "display_name" to deviceName,
                            "package_name" to "",
                            "rd_service_package" to "",
                            "is_available" to true,
                        ))
                    }
                }
            }

            result.success(devices)
        } catch (e: Exception) {
            Log.e(TAG, "detectDevices failed", e)
            result.success(emptyList<Map<String, Any>>())
        }
    }

    private fun isPackageInstalled(packageName: String): Boolean {
        return try {
            packageManager.getPackageInfo(packageName, 0)
            true
        } catch (e: PackageManager.NameNotFoundException) {
            false
        }
    }

    private fun isBiometricDevice(device: UsbDevice): Boolean {
        val knownBiometricVendors = listOf(
            0x0C2E,  // Mantra (MFS100/MFS110 variants)
            0x2C0F,  // Mantra MFS110 (observed vendor id)
            0x04B4,  // Cypress (used by some biometric devices)
            0x1A86,  // CH340 (USB-serial used by some devices)
            0x10C4,  // CP210x
            0x2342,  // Startek
            0x09DB,  // FlexiScanner
            0x0591,  // SecuGen
            0x04EC,  // STMicroelectronics (Morpho)
        )
        return knownBiometricVendors.contains(device.vendorId)
    }

    private fun getDeviceName(device: UsbDevice): String {
        val productName = device.productName
        val vendorName = device.manufacturerName
        return when {
            !productName.isNullOrBlank() -> productName
            !vendorName.isNullOrBlank() -> "$vendorName Device"
            else -> "USB Device (${device.vendorId.toString(16)}:${device.productId.toString(16)})"
        }
    }

    private fun getDisplayName(key: String): String {
        return when (key) {
            "mantra_mfs100" -> "Mantra MFS100"
            "mantra_mfs110" -> "Mantra MFS110"
            "morpho_mso1300" -> "Morpho MSO1300 E3"
            "startek_fm2200" -> "Startek FM2200"
            "secugen" -> "SecuGen Hamster"
            "precision" -> "Precision PB510"
            "zkteco" -> "ZKTeco"
            else -> "Unknown Device"
        }
    }

    // ─── Device Initialization ─────────────────────────────────────────

    private fun initializeDevice(call: MethodCall, result: MethodChannel.Result) {
        val deviceType = call.argument<String>("device_type") ?: "generic"
        val packageName = RD_SERVICE_PACKAGES[deviceType]

        try {
            if (packageName != null && isPackageInstalled(packageName)) {
                detectedDeviceType = deviceType
                sendEvent(mapOf(
                    "type" to "device_ready",
                    "device_type" to deviceType,
                    "display_name" to getDisplayName(deviceType),
                ))
                result.success(true)
            } else {
                val autoDetected = autoDetectDevice()
                if (autoDetected != null) {
                    result.success(true)
                } else {
                    result.success(false)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "initializeDevice failed", e)
            result.success(false)
        }
    }

    private fun autoDetectDevice(): String? {
        for ((key, packageName) in RD_SERVICE_PACKAGES) {
            if (isPackageInstalled(packageName)) {
                detectedDeviceType = key
                sendEvent(mapOf(
                    "type" to "device_ready",
                    "device_type" to key,
                    "display_name" to getDisplayName(key),
                ))
                return key
            }
        }
        return null
    }

    // ─── Fingerprint Capture ───────────────────────────────────────────

    private fun captureFingerprint(call: MethodCall, result: MethodChannel.Result) {
        val deviceType = call.argument<String>("device_type") ?: detectedDeviceType ?: "generic"
        val timeout = call.argument<Int>("timeout_seconds") ?: 30

        sendEvent(mapOf("type" to "capture_started", "device_type" to deviceType))

        val packageName = RD_SERVICE_PACKAGES[deviceType]
        if (packageName == null || !isPackageInstalled(packageName)) {
            val fallback = autoDetectDevice()
            if (fallback == null) {
                sendEvent(mapOf("type" to "capture_failed", "error" to "No biometric RD Service installed"))
                replySuccess(result, mapOf(
                    "success" to false,
                    "error" to "No biometric RD Service installed. Please install the vendor RD Service app.",
                ))
                return
            }
            captureWithPackage(RD_SERVICE_PACKAGES[fallback]!!, result, REQUEST_CAPTURE, timeout)
            return
        }

        captureWithPackage(packageName, result, REQUEST_CAPTURE, timeout)
    }

    private fun captureWithPackage(packageName: String, result: MethodChannel.Result, requestCode: Int, timeout: Int) {
        try {
            val intent = getCaptureIntent(packageName, timeout)
            if (intent == null) {
                // RD Service app may not expose a CaptureActivity — fall back to broadcast approach
                captureViaBroadcast(packageName, result)
                return
            }

            pendingResult = result
            pendingResultReplied = false
            pendingVerifyTemplate = null
            startActivityForResult(intent, requestCode)

            // Safety timeout in case the RD service returns nothing
            android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                if (!pendingResultReplied) {
                    replySuccess(result, mapOf("success" to false, "error" to "Capture timeout"))
                    pendingResult = null
                    pendingResultReplied = false
                }
            }, (timeout * 1000L) + 5000)
        } catch (e: Exception) {
            Log.e(TAG, "captureWithPackage failed", e)
            val friendly = when (e) {
                is android.content.ActivityNotFoundException ->
                    "RD Service app opened but its capture screen was not found (${e.message}). Please open the vendor app once to initialize, then retry."
                is SecurityException ->
                    "RD Service capture screen is not exported for this app. Please update or reinstall the vendor RD Service app."
                else -> e.message ?: "Unknown capture error"
            }
            replySuccess(result, mapOf("success" to false, "error" to friendly))
        }
    }

    private fun getCaptureIntent(packageName: String, timeout: Int): Intent? {
        return try {
            val resolved = resolveCaptureActivity(packageName)
            val activityName = resolved
                ?: if (packageName.contains("mantra") || packageName.contains("scl") || packageName.contains("acpl")) {
                    "$packageName.activity.CaptureActivity"
                } else {
                    "$packageName.CaptureActivity"
                }

            val intent = Intent(Intent.ACTION_MAIN)
            intent.setClassName(packageName, activityName)

            when {
                packageName.contains("mantra") -> {
                    intent.putExtra("PID_DATA", true)
                    intent.putExtra("TIME_OUT", timeout)
                }
                packageName.contains("scl") -> {
                    intent.putExtra("ISO", false)
                    intent.putExtra("FingerDetect", true)
                    intent.putExtra("QualityThreshold", 40)
                }
                packageName.contains("acpl") -> {
                    intent.putExtra("capture_timeout", timeout * 1000)
                }
            }
            intent
        } catch (e: Exception) {
            Log.e(TAG, "Unable to build capture intent for $packageName", e)
            null
        }
    }

    /// Resolve a real, exported activity inside an installed RD Service app.
    /// Prefers names matching Capture/Host patterns; otherwise any exported
    /// non-main activity. Avoids hard-coding vendor class names across versions.
    private fun resolveCaptureActivity(packageName: String): String? {
        return try {
            val info = packageManager.getPackageInfo(
                packageName,
                PackageManager.GET_ACTIVITIES or PackageManager.MATCH_DISABLED_COMPONENTS
            )
            val activities = info.activities ?: return null
            val exported = activities.filter { it.exported }

            val pick = exported.firstOrNull { it.name.contains("capture", ignoreCase = true) }
                ?: exported.firstOrNull { it.name.contains("host", ignoreCase = true) }
                ?: exported
                    .filter { it.name.contains("activity", ignoreCase = true) && !it.name.contains("main", ignoreCase = true) }
                    .sortedBy { it.name.length }
                    .firstOrNull()
                ?: exported.firstOrNull { !it.name.endsWith("MainActivity") }
            pick?.name
        } catch (e: Exception) {
            Log.e(TAG, "resolveCaptureActivity failed for $packageName", e)
            null
        }
    }

    private fun listActivities(packageName: String): List<Map<String, Any>> {
        return try {
            val info = packageManager.getPackageInfo(
                packageName,
                PackageManager.GET_ACTIVITIES or PackageManager.MATCH_DISABLED_COMPONENTS
            )
            info.activities?.map { act ->
                mapOf("name" to (act.name ?: ""), "exported" to act.exported)
            } ?: emptyList()
        } catch (e: Exception) {
            emptyList()
        }
    }

    private fun captureViaBroadcast(packageName: String, result: MethodChannel.Result) {
        try {
            pendingResult = result
            pendingResultReplied = false
            pendingVerifyTemplate = null

            val intent = Intent("com.beingsevak.CAPTURE_FINGERPRINT")
            intent.setPackage(packageName)
            sendBroadcast(intent)

            val receiver = object : BroadcastReceiver() {
                override fun onReceive(context: Context, intent: Intent) {
                    val pidData = intent.getStringExtra("PID_DATA") ?: ""
                    val quality = intent.getStringExtra("QUALITY") ?: "0"
                    val fidData = extractFidFromPid(pidData)
                    val timestamp = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US).format(Date())

                    replySuccess(result, mapOf(
                        "success" to pidData.isNotEmpty(),
                        "pid_data" to pidData,
                        "fid_data" to fidData,
                        "quality_score" to quality,
                        "template" to fidData,
                        "device_info" to "Generic RD Device",
                        "timestamp" to timestamp,
                    ))

                    try { unregisterReceiver(this) } catch (_: Exception) {}
                }
            }

            val filter = IntentFilter("com.beingsevak.CAPTURE_RESULT")
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                registerReceiver(receiver, filter, RECEIVER_NOT_EXPORTED)
            } else {
                registerReceiver(receiver, filter)
            }

            android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                try {
                    unregisterReceiver(receiver)
                    if (!pendingResultReplied) {
                        replySuccess(result, mapOf("success" to false, "error" to "Capture timeout"))
                        pendingResult = null
                    }
                } catch (_: Exception) {}
            }, 30000)
        } catch (e: Exception) {
            replySuccess(result, mapOf("success" to false, "error" to e.message))
        }
    }

    // ─── Verification ──────────────────────────────────────────────────

    private fun verifyFingerprint(call: MethodCall, result: MethodChannel.Result) {
        val storedTemplate = call.argument<String>("stored_template") ?: ""
        val deviceType = call.argument<String>("device_type") ?: detectedDeviceType ?: "generic"

        sendEvent(mapOf("type" to "verify_started", "device_type" to deviceType))

        val packageName = RD_SERVICE_PACKAGES[deviceType] ?: autoDetectDevice()?.let { RD_SERVICE_PACKAGES[it] }
        if (packageName == null) {
            replySuccess(result, mapOf("success" to false, "error" to "No biometric device available"))
            return
        }

        try {
            val intent = getCaptureIntent(packageName, 30) ?: run {
                replySuccess(result, mapOf("success" to false, "error" to "RD Service capture activity unavailable"))
                return
            }

            pendingResult = result
            pendingResultReplied = false
            pendingVerifyTemplate = storedTemplate
            startActivityForResult(intent, REQUEST_VERIFY)
        } catch (e: Exception) {
            replySuccess(result, mapOf("success" to false, "error" to e.message))
        }
    }

    private fun compareTemplates(template1: String, template2: String): Boolean {
        return try {
            val bytes1 = Base64.decode(template1, Base64.DEFAULT)
            val bytes2 = Base64.decode(template2, Base64.DEFAULT)
            if (bytes1.isEmpty() || bytes2.isEmpty() || bytes1.size != bytes2.size) return false

            var matchCount = 0
            val threshold = bytes1.size * 0.7
            for (i in bytes1.indices) {
                if (bytes1[i] == bytes2[i]) matchCount++
            }
            matchCount >= threshold.toInt()
        } catch (e: Exception) {
            false
        }
    }

    // ─── Utility ───────────────────────────────────────────────────────

    private fun extractFidFromPid(pidData: String): String {
        return try {
            val factory = XmlPullParserFactory.newInstance()
            val parser = factory.newPullParser()
            parser.setInput(StringReader(pidData))

            var eventType = parser.eventType
            while (eventType != XmlPullParser.END_DOCUMENT) {
                if (eventType == XmlPullParser.START_TAG) {
                    when (parser.name) {
                        "BDB", "FMR", "FIR", "FID", "BIN" -> return parser.nextText()
                    }
                }
                eventType = parser.next()
            }

            // Fallback: find a long base64 blob
            val match = Regex(">[A-Za-z0-9+/=]{60,}<").find(pidData)
            match?.groupValues?.get(0)?.removePrefix(">")?.removeSuffix("<") ?: pidData
        } catch (e: Exception) {
            pidData
        }
    }

    private fun sendEvent(event: Map<String, Any?>) {
        try {
            eventSink?.success(event)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to send event", e)
        }
    }

    private fun replySuccess(result: MethodChannel.Result, value: Any) {
        if (pendingResultReplied) return
        pendingResultReplied = true
        result.success(value)
    }

    private fun stopCapture(result: MethodChannel.Result) {
        try {
            sendEvent(mapOf("type" to "capture_stopped"))
            result.success(true)
        } catch (e: Exception) {
            result.success(false)
        }
    }

    private fun getDeviceStatus(result: MethodChannel.Result) {
        val installed = mutableListOf<String>()
        for ((key, packageName) in RD_SERVICE_PACKAGES) {
            if (isPackageInstalled(packageName)) {
                installed.add(key)
            }
        }

        result.success(mapOf(
            "detected_device" to detectedDeviceType,
            "installed_services" to installed,
        ))
    }

    private fun getLocalIpAddresses(result: MethodChannel.Result) {
        try {
            val ips = mutableListOf<String>()
            val interfaces = Collections.list(NetworkInterface.getNetworkInterfaces())
            for (nif in interfaces) {
                if (!nif.isUp || nif.isLoopback) continue
                for (addr in Collections.list(nif.inetAddresses)) {
                    if (addr is Inet4Address) {
                        ips.add(addr.hostAddress)
                    }
                }
            }
            result.success(ips.distinct())
        } catch (e: Exception) {
            Log.w(TAG, "getLocalIpAddresses failed", e)
            result.success(emptyList<String>())
        }
    }

    private fun diagnose(result: MethodChannel.Result) {
        try {
            val installed = mutableListOf<Map<String, Any>>()
            for ((key, packageName) in RD_SERVICE_PACKAGES) {
                if (isPackageInstalled(packageName)) {
                    installed.add(mapOf(
                        "type" to key,
                        "package_name" to packageName,
                        "installed" to true,
                        "activities" to listActivities(packageName),
                    ))
                }
            }

            val usbManager = getSystemService(Context.USB_SERVICE) as UsbManager
            val usbDevices = usbManager.deviceList.values.map { device ->
                mapOf(
                    "name" to getDeviceName(device),
                    "vendor_id" to device.vendorId,
                    "product_id" to device.productId,
                    "vendor_id_hex" to "0x" + Integer.toHexString(device.vendorId).uppercase(),
                    "product_id_hex" to "0x" + Integer.toHexString(device.productId).uppercase(),
                )
            }

            result.success(mapOf(
                "installed_rd_services" to installed,
                "usb_devices" to usbDevices,
                "detected_device_type" to detectedDeviceType,
            ))
        } catch (e: Exception) {
            result.success(mapOf("error" to e.message))
        }
    }

    private fun registerUsbReceiver() {
        usbReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                when (intent.action) {
                    UsbManager.ACTION_USB_DEVICE_ATTACHED -> {
                        sendEvent(mapOf("type" to "device_connected"))
                        autoDetectDevice()
                    }
                    UsbManager.ACTION_USB_DEVICE_DETACHED -> {
                        sendEvent(mapOf("type" to "device_disconnected"))
                    }
                }
            }
        }

        val filter = IntentFilter().apply {
            addAction(UsbManager.ACTION_USB_DEVICE_ATTACHED)
            addAction(UsbManager.ACTION_USB_DEVICE_DETACHED)
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(usbReceiver, filter, RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(usbReceiver, filter)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        rawUsb.dispose()
        try {
            usbReceiver?.let { unregisterReceiver(it) }
        } catch (_: Exception) {}
        methodChannel?.setMethodCallHandler(null)
        eventChannel?.setStreamHandler(null)
    }
}