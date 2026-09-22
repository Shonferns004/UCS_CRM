package com.beingsevak.beneficiaries

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import android.os.Build
import android.util.Log
import io.flutter.embedding.android.FlutterFragmentActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterFragmentActivity(), MethodChannel.MethodCallHandler, EventChannel.StreamHandler {

    companion object {
        private const val TAG = "BiometricPlugin"
        private const val METHOD_CHANNEL = "com.beingsevak.biometric"
        private const val EVENT_CHANNEL = "com.beingsevak.biometric/events"
    }

    private var methodChannel: MethodChannel? = null
    private var eventChannel: EventChannel? = null
    private var eventSink: EventChannel.EventSink? = null
    private var usbReceiver: BroadcastReceiver? = null
    private val rawUsb by lazy { SecugenRawUsb(this) }
    private val sdkUsb by lazy { SecugenSdkLib(this) }

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
            "getDeviceStatus" -> getDeviceStatus(result)
            "diagnose" -> diagnose(result)
            "stopCapture" -> stopCapture(result)
            "rawConnect" -> sdkUsb.connect(result)
            "rawDisconnect" -> sdkUsb.disconnect(result)
            "rawCapture" -> sdkUsb.capture(call.argument("timeout_seconds") as? Int ?: 30, result)
            "rawGetInfo" -> rawUsb.getInfo(object : MethodChannel.Result {
                override fun success(o: Any?) {
                    val m = ((o as? Map<*, *>) ?: emptyMap<Any, Any>()).toMutableMap()
                    m["connected"] = sdkUsb.isConnected
                    result.success(m)
                }

                override fun error(errorCode: String, errorMessage: String?, errorDetails: Any?) =
                    result.error(errorCode, errorMessage, errorDetails)

                override fun notImplemented() = result.notImplemented()
            })
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

    // ─── Device Detection ─────────────────────────────────────────────

    private fun detectDevices(result: MethodChannel.Result) {
        try {
            if (rawUsb.getDevice() != null) {
                result.success(listOf(mapOf(
                    "type" to "secugenHamsterPro20",
                    "display_name" to "SecuGen Hamster Pro 20 (Raw USB)",
                    "package_name" to "",
                    "rd_service_package" to "",
                    "is_available" to true,
                )))
            } else {
                result.success(emptyList<Map<String, Any>>())
            }
        } catch (e: Exception) {
            Log.e(TAG, "detectDevices failed", e)
            result.success(emptyList<Map<String, Any>>())
        }
    }

    // ─── Device Status / Diagnostics ──────────────────────────────────

    private fun getDeviceStatus(result: MethodChannel.Result) {
        val device = rawUsb.getDevice()
        result.success(mapOf(
            "connected" to (rawUsb.isConnected || sdkUsb.isConnected),
            "device_type" to "secugenHamsterPro20",
            "device_present" to (device != null),
            "has_permission" to (device?.let { usbManager().hasPermission(it) } ?: false),
            "vendor_id_hex" to (device?.let { "0x" + Integer.toHexString(it.vendorId).uppercase() } ?: ""),
            "product_id_hex" to (device?.let { "0x" + Integer.toHexString(it.productId).uppercase() } ?: ""),
        ))
    }

    private fun diagnose(result: MethodChannel.Result) {
        try {
            val usbDevices = usbManager().deviceList.values.map { device ->
                mapOf(
                    "name" to getDeviceName(device),
                    "vendor_id" to device.vendorId,
                    "product_id" to device.productId,
                    "vendor_id_hex" to "0x" + Integer.toHexString(device.vendorId).uppercase(),
                    "product_id_hex" to "0x" + Integer.toHexString(device.productId).uppercase(),
                )
            }
            result.success(mapOf(
                "usb_devices" to usbDevices,
                "detected_device" to (if (rawUsb.getDevice() != null) "secugenHamsterPro20" else null),
            ))
        } catch (e: Exception) {
            result.success(mapOf("error" to e.message))
        }
    }

    private fun usbManager(): UsbManager =
        getSystemService(Context.USB_SERVICE) as UsbManager

    private fun getDeviceName(device: UsbDevice): String {
        val productName = device.productName
        val vendorName = device.manufacturerName
        return when {
            !productName.isNullOrBlank() -> productName
            !vendorName.isNullOrBlank() -> "$vendorName Device"
            else -> "USB Device (${device.vendorId.toString(16)}:${device.productId.toString(16)})"
        }
    }

    // ─── Capture control ──────────────────────────────────────────────

    private fun stopCapture(result: MethodChannel.Result) {
        try {
            sendEvent(mapOf("type" to "capture_stopped"))
            result.success(true)
        } catch (e: Exception) {
            result.success(false)
        }
    }

    // ─── Utility ──────────────────────────────────────────────────────

    private fun sendEvent(event: Map<String, Any?>) {
        try {
            eventSink?.success(event)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to send event", e)
        }
    }

    private fun registerUsbReceiver() {
        usbReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                when (intent.action) {
                    UsbManager.ACTION_USB_DEVICE_ATTACHED -> {
                        sendEvent(mapOf("type" to "device_connected"))
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
        sdkUsb.dispose()
        try {
            usbReceiver?.let { unregisterReceiver(it) }
        } catch (_: Exception) {}
        methodChannel?.setMethodCallHandler(null)
        eventChannel?.setStreamHandler(null)
    }
}