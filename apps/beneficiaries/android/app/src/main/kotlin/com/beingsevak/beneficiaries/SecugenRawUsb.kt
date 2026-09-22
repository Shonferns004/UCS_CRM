package com.beingsevak.beneficiaries

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbDeviceConnection
import android.hardware.usb.UsbInterface
import android.hardware.usb.UsbManager
import android.os.Build
import android.util.Log
import io.flutter.plugin.common.MethodChannel

/**
 * Direct (raw) USB access to the SecuGen Hamster Pro 20 (HU20, U20 sensor)
 * using only the Android USB Host API.
 *
 * Connect/disconnect/enumerate are fully implemented. `capture()` returns a
 * clear error until the SecuGen FDx SDK for Android is bundled: SecuGen
 * scanners speak a proprietary USB protocol, so real image capture requires
 * the native library from the SecuGen FDx SDK Pro (secugen.com/products/sdk/).
 */
class SecugenRawUsb(private val context: Context) {

    companion object {
        private const val TAG = "SecugenRawUsb"
        private const val ACTION_USB_PERMISSION = "com.beingsevak.beneficiaries.USB_PERMISSION"

        // SecuGen USB vendor id (0x1162, decimal 4450). Hamster Pro 20 / U20-AP
        // variants report products such as 0x2200, 0x2201, 0x2360.
        const val SECUGEN_VENDOR_ID = 0x1162
    }

    private val usbManager = context.getSystemService(Context.USB_SERVICE) as UsbManager
    private var connection: UsbDeviceConnection? = null
    private var claimedInterface: UsbInterface? = null
    private var permissionReceiver: BroadcastReceiver? = null
    private var pendingPermissionResult: MethodChannel.Result? = null

    val isConnected: Boolean get() = connection != null

    fun getDevice(): UsbDevice? {
        val devices = usbManager.deviceList.values
        val known = devices.firstOrNull { device -> device.vendorId == SECUGEN_VENDOR_ID }
        if (known != null) return known
        // Fallback: treat an unknown connected USB device as the scanner rather
        // than failing to detect. Keeps working even if a unit reports a
        // different vendor/product id (hub-wrapped or custom firmware).
        return devices.firstOrNull()
    }

    private fun usbSummary(): String {
        val devices = usbManager.deviceList.values
        if (devices.isEmpty()) {
            return "No USB devices visible (host mode inactive or scanner not detected)."
        }
        return "USB seen: " + devices.joinToString("; ") { d ->
            "${d.productName ?: d.deviceName} 0x${hex(d.vendorId)}:0x${hex(d.productId)}"
        }
    }

    fun connect(result: MethodChannel.Result) {
        val device = getDevice()
        if (device == null) {
            result.success(mapOf(
                "connected" to false,
                "error" to "SecuGen Hamster Pro 20 not found. Connect the scanner USB-C cable directly " +
                    "and grant permission when prompted. (${usbSummary()})",
            ))
            return
        }
        if (connection != null) {
            result.success(mapOf("connected" to true, "product_id_hex" to "0x" + hex(device.productId)))
            return
        }
        if (!usbManager.hasPermission(device)) {
            pendingPermissionResult = result
            requestPermission(device)
            return
        }
        openDevice(device, result)
    }

    private fun requestPermission(device: UsbDevice) {
        permissionReceiver?.let { runCatching { context.unregisterReceiver(it) } }
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context, intent: Intent) {
                if (intent.action != ACTION_USB_PERMISSION) return
                val granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)
                val deviceExtra = intent.getParcelableExtra<UsbDevice>(UsbManager.EXTRA_DEVICE)
                runCatching { ctx.unregisterReceiver(this) }
                permissionReceiver = null
                val result = pendingPermissionResult
                pendingPermissionResult = null
                if (result == null) return
                if (granted && deviceExtra != null) {
                    openDevice(deviceExtra, result)
                } else {
                    result.success(mapOf(
                        "connected" to false,
                        "error" to "USB permission denied for the SecuGen Hamster Pro 20. Allow access and retry.",
                    ))
                }
            }
        }
        permissionReceiver = receiver
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
    }

    private fun openDevice(device: UsbDevice, result: MethodChannel.Result) {
        try {
            val conn = usbManager.openDevice(device)
                ?: throw IllegalStateException("Failed to open the SecuGen Hamster Pro 20 (driver busy or permission missing).")
            val iface = if (device.interfaceCount > 0) device.getInterface(0) else null
            if (iface != null && !conn.claimInterface(iface, true)) {
                conn.close()
                throw IllegalStateException("Failed to claim the SecuGen Hamster Pro 20 USB interface.")
            }
            connection = conn
            claimedInterface = iface
            result.success(mapOf(
                "connected" to true,
                "product_id_hex" to "0x" + hex(device.productId),
                "serial" to (device.serialNumber ?: ""),
            ))
        } catch (e: Exception) {
            Log.e(TAG, "openDevice failed", e)
            result.success(mapOf("connected" to false, "error" to (e.message ?: e.toString())))
        }
    }

    /**
     * Raw frame capture from the SecuGen Hamster Pro 20.
     * SecuGen scanners use a proprietary USB protocol, so capture requires the
     * SecuGen FDx SDK for Android native library. Until it is bundled, this
     * returns a clear error pointing at the SDK.
     */
    fun capture(result: MethodChannel.Result) {
        if (connection == null) {
            result.success(mapOf(
                "success" to false,
                "error" to "Raw USB capture needs an active connection. Run rawConnect first.",
            ))
            return
        }
        result.success(mapOf(
            "success" to false,
            "error" to "SecuGen Hamster Pro 20 raw capture requires the SecuGen FDx SDK for Android " +
                "(JSGFPLib native library). Bundle the SDK from secugen.com/products/sdk/ to enable " +
                "direct USB capture, or use the SecuGen RD Service capture path instead.",
        ))
    }

    fun getInfo(result: MethodChannel.Result) {
        val device = getDevice()
        if (device == null) {
            result.success(mapOf("connected" to false, "error" to "SecuGen Hamster Pro 20 not connected"))
            return
        }
        val iface = if (device.interfaceCount > 0) device.getInterface(0) else null
        val endpoints: List<Map<String, Any>> = if (iface != null) {
            (0 until iface.endpointCount).map { ep ->
                val endpoint = iface.getEndpoint(ep)
                mapOf(
                    "address" to "0x" + hex(endpoint.address),
                    "direction" to (if (endpoint.direction == android.hardware.usb.UsbConstants.USB_DIR_IN) "IN" else "OUT"),
                    "type" to typeName(endpoint.type),
                    "max_packet_size" to endpoint.maxPacketSize,
                )
            }
        } else {
            emptyList()
        }
        result.success(mapOf(
            "connected" to (connection != null),
            "vendor_id_hex" to "0x" + hex(device.vendorId),
            "product_id_hex" to "0x" + hex(device.productId),
            "serial" to (device.serialNumber ?: ""),
            "device_name" to (device.deviceName ?: ""),
            "product_name" to (device.productName ?: ""),
            "interface_count" to device.interfaceCount,
            "interface_name" to (iface?.name ?: ""),
            "interface_class" to (iface?.interfaceClass ?: -1),
            "endpoint_count" to (iface?.endpointCount ?: 0),
            "endpoints" to endpoints,
            "has_permission" to usbManager.hasPermission(device),
        ))
    }

    fun disconnect(result: MethodChannel.Result) {
        closeConnection()
        result.success(mapOf("connected" to false))
    }

    private fun closeConnection() {
        try {
            claimedInterface?.let { connection?.releaseInterface(it) }
        } catch (_: Exception) {}
        try {
            connection?.close()
        } catch (_: Exception) {}
        connection = null
        claimedInterface = null
    }

    fun dispose() {
        closeConnection()
        permissionReceiver?.let { runCatching { context.unregisterReceiver(it) } }
        permissionReceiver = null
        pendingPermissionResult = null
    }

    private fun hex(value: Int): String = Integer.toHexString(value).uppercase()

    private fun typeName(type: Int): String = when (type) {
        android.hardware.usb.UsbConstants.USB_ENDPOINT_XFER_BULK -> "BULK"
        android.hardware.usb.UsbConstants.USB_ENDPOINT_XFER_CONTROL -> "CONTROL"
        android.hardware.usb.UsbConstants.USB_ENDPOINT_XFER_INT -> "INTERRUPT"
        android.hardware.usb.UsbConstants.USB_ENDPOINT_XFER_ISOC -> "ISOCHRONOUS"
        else -> "UNKNOWN($type)"
    }
}