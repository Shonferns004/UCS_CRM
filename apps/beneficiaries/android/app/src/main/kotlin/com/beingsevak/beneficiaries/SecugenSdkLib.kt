package com.beingsevak.beneficiaries

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.util.Log
import SecuGen.FDxSDKPro.JSGFPLib
import SecuGen.FDxSDKPro.SGDeviceInfoParam
import SecuGen.FDxSDKPro.SGFDxConstant
import SecuGen.FDxSDKPro.SGFDxDeviceName
import SecuGen.FDxSDKPro.SGFDxErrorCode
import io.flutter.plugin.common.MethodChannel
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * Official SecuGen FDx SDK Pro capture path (JSGFPLib).
 *
 * JDK: FDxSDKProFDAndroid.jar presents SecuGen's proprietary USB protocol so we
 * get real fingerprint frames from a SecuGen Hamster Pro 20 / HU20 / U20-AP
 * without touching the UIDAI RD service. Native driver libs live in jniLibs.
 */
class SecugenSdkLib(private val context: Context) {

    companion object {
        private const val TAG = "SecugenSdkLib"
        private const val ACTION_USB_PERMISSION = "com.beingsevak.beneficiaries.USB_PERMISSION_SDK"
        const val SECUGEN_VENDOR_ID = 0x1162
        private const val CAPTURE_QUALITY = 50
        private const val PERMISSION_TIMEOUT_S = 30
    }

    private val usbManager = context.getSystemService(Context.USB_SERVICE) as UsbManager
    private val executor by lazy {
        Executors.newSingleThreadExecutor { r -> Thread(r, "secugen-sdk").apply { isDaemon = true } }
    }
    private val mainHandler = Handler(Looper.getMainLooper())

    private var sgfplib: JSGFPLib? = null
    private var opened = false
    private var imageWidth = 0
    private var imageHeight = 0
    private var imageDPI = 500

    val isConnected: Boolean get() = sgfplib != null && opened

    fun detectDevice(): UsbDevice? {
        val devices = usbManager.deviceList.values
        return devices.firstOrNull { it.vendorId == SECUGEN_VENDOR_ID } ?: devices.firstOrNull()
    }

    private fun usbSummary(): String {
        val devices = usbManager.deviceList.values
        if (devices.isEmpty()) return "No USB devices visible."
        return "USB seen: " + devices.joinToString("; ") { d ->
            "${d.productName ?: d.deviceName} 0x${Integer.toHexString(d.vendorId).uppercase()}:0x${Integer.toHexString(d.productId).uppercase()}"
        }
    }

    private fun errorText(code: Long): String = when (code) {
        SGFDxErrorCode.SGFDX_ERROR_DEVICE_NOT_FOUND -> "Device not found"
        SGFDxErrorCode.SGFDX_ERROR_DEV_ALREADY_OPEN -> "Device already open"
        SGFDxErrorCode.SGFDX_ERROR_FAKE_FINGER -> "Fake finger detected"
        SGFDxErrorCode.SGFDX_ERROR_DRVLOAD_FAILED -> "Driver load failed"
        SGFDxErrorCode.SGFDX_ERROR_UNSUPPORTED_DEV -> "Unsupported device"
        SGFDxErrorCode.SGFDX_ERROR_LACK_OF_BANDWIDTH -> "Lack of USB bandwidth"
        SGFDxErrorCode.SGFDX_ERROR_TIME_OUT -> "Timed out waiting for a finger"
        else -> "SDK error code $code"
    }

    /** Initialize + open the SecuGen device through the FDx SDK. */
    fun connect(result: MethodChannel.Result) {
        executor.execute {
            if (isConnected) {
                mainHandler.post { result.success(mapOf("connected" to true)) }
                return@execute
            }
            var lib: JSGFPLib? = null
            try {
                lib = JSGFPLib(context, usbManager)
                var err = lib.Init(SGFDxDeviceName.SG_DEV_AUTO)
                if (err != SGFDxErrorCode.SGFDX_ERROR_NONE) {
                    mainHandler.post { result.success(mapOf(
                        "connected" to false,
                        "error" to "SecuGen SDK init failed (${errorText(err)}). ${usbSummary()}",
                    )) }
                    return@execute
                }
                val device = lib.GetUsbDevice()
                if (device == null) {
                    mainHandler.post { result.success(mapOf(
                        "connected" to false,
                        "error" to "No SecuGen device found. ${usbSummary()}",
                    )) }
                    return@execute
                }
                Log.i(TAG, "Device ${device.productName} ${device.vendorId.toString(16)}:${device.productId.toString(16)}")
                if (!usbManager.hasPermission(device)) {
                    val granted = requestPermission(device)
                    if (!granted) {
                        mainHandler.post { result.success(mapOf(
                            "connected" to false,
                            "error" to "USB permission not granted for ${device.productName ?: "SecuGen device"}. Allow access and retry.",
                        )) }
                        return@execute
                    }
                }
                err = lib.OpenDevice(0)
                if (err != SGFDxErrorCode.SGFDX_ERROR_NONE) {
                    mainHandler.post { result.success(mapOf(
                        "connected" to false,
                        "error" to "OpenDevice failed (${errorText(err)}).",
                    )) }
                    return@execute
                }
                // Smart capture: GetImageEx only returns a frame once a good finger is pressed.
                runCatching { lib.WriteData(SGFDxConstant.WRITEDATA_COMMAND_ENABLE_SMART_CAPTURE, 1) }
                val info = SGDeviceInfoParam()
                lib.GetDeviceInfo(info)
                sgfplib = lib
                opened = true
                imageWidth = info.imageWidth
                imageHeight = info.imageHeight
                if (info.imageDPI > 0) imageDPI = info.imageDPI
                Log.i(TAG, "Opened at ${imageWidth}x${imageHeight} @ ${imageDPI} dpi")
                val serial = runCatching { info.deviceSN() ?: byteArrayOf() }.getOrElse { byteArrayOf() }
                mainHandler.post { result.success(mapOf(
                    "connected" to true,
                    "serial" to String(serial),
                    "width" to imageWidth,
                    "height" to imageHeight,
                    "dpi" to imageDPI,
                )) }
            } catch (e: Throwable) {
                Log.e(TAG, "connect failed", e)
                runCatching { lib?.Close() }
                mainHandler.post { result.success(mapOf("connected" to false, "error" to (e.message ?: e.toString()))) }
            }
        }
    }

    /** Capture raw 8-bit grayscale frame (base64) + geometry + quality score. */
    fun capture(timeoutSeconds: Int, result: MethodChannel.Result) {
        executor.execute {
            try {
                val lib = sgfplib
                if (lib == null || !opened) {
                    mainHandler.post { result.success(mapOf(
                        "success" to false,
                        "error" to "SecuGen device not connected. Run rawConnect first.",
                    )) }
                    return@execute
                }
                val timeoutMs = (timeoutSeconds.coerceAtLeast(1)).toLong() * 1000L
                val buffer = ByteArray(imageWidth * imageHeight)
                val err = lib.GetImageEx(buffer, timeoutMs, CAPTURE_QUALITY.toLong())
                if (err != SGFDxErrorCode.SGFDX_ERROR_NONE) {
                    mainHandler.post { result.success(mapOf(
                        "success" to false,
                        "error" to "Capture failed (${errorText(err)}). Place finger on the scanner and retry.",
                    )) }
                    return@execute
                }
                val quality = IntArray(1)
                runCatching { lib.GetImageQuality(imageWidth.toLong(), imageHeight.toLong(), buffer, quality) }
                val b64 = Base64.encodeToString(buffer, Base64.NO_WRAP)
                mainHandler.post { result.success(mapOf(
                    "success" to true,
                    "image_b64" to b64,
                    "width" to imageWidth,
                    "height" to imageHeight,
                    "dpi" to imageDPI.toDouble(),
                    "quality_score" to (quality[0].takeIf { it > 0 } ?: 50),
                )) }
            } catch (e: Throwable) {
                Log.e(TAG, "capture failed", e)
                mainHandler.post { result.success(mapOf("success" to false, "error" to (e.message ?: e.toString()))) }
            }
        }
    }

    fun disconnect(result: MethodChannel.Result) {
        executor.execute {
            try {
                sgfplib?.CloseDevice()
                sgfplib?.Close()
            } catch (e: Throwable) {
                Log.e(TAG, "disconnect error", e)
            }
            sgfplib = null
            opened = false
            mainHandler.post { result.success(mapOf("connected" to false)) }
        }
    }

    fun dispose() {
        try {
            sgfplib?.CloseDevice()
            sgfplib?.Close()
        } catch (_: Exception) {}
        sgfplib = null
        opened = false
    }

    /**
     * The USB bus fired DETACHED (real unplug or a transient re-enumeration).
     * Drop the SDK handle so [isConnected] turns false and the next
     * rawConnect/reconnect performs a full reopen instead of no-opping on a
     * stale handle. Must be called from any thread - runs on the worker.
     */
    fun onUsbDetached() {
        executor.execute {
            try {
                sgfplib?.CloseDevice()
                sgfplib?.Close()
            } catch (_: Exception) {}
            sgfplib = null
            opened = false
        }
    }

    private fun requestPermission(device: UsbDevice): Boolean {
        val latch = CountDownLatch(1)
        var granted = false
        var receiver: BroadcastReceiver? = null
        receiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context, intent: Intent) {
                if (intent.action != ACTION_USB_PERMISSION) return
                granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)
                runCatching { ctx.unregisterReceiver(this) }
                receiver = null
                latch.countDown()
            }
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(receiver, IntentFilter(ACTION_USB_PERMISSION), Context.RECEIVER_EXPORTED)
        } else {
            context.registerReceiver(receiver, IntentFilter(ACTION_USB_PERMISSION))
        }
        val pendingIntent = PendingIntent.getBroadcast(
            context,
            0,
            Intent(ACTION_USB_PERMISSION).setPackage(context.packageName),
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else PendingIntent.FLAG_ONE_SHOT,
        )
        usbManager.requestPermission(device, pendingIntent)
        val released = latch.await(PERMISSION_TIMEOUT_S.toLong(), TimeUnit.SECONDS)
        if (receiver != null) {
            runCatching { context.unregisterReceiver(receiver) }
            receiver = null
        }
        if (!released) return false
        return granted
    }
}