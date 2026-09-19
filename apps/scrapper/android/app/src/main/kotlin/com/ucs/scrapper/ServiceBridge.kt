package com.ucs.scrapper

import io.flutter.plugin.common.MethodChannel

object ServiceBridge {
    @Volatile var channel: MethodChannel? = null

    fun emit(map: Map<String, Any?>) {
        try {
            channel?.invokeMethod("onEvent", map)
        } catch (t: Throwable) {
            // channel may be briefly unbound while the UI starts
        }
    }
}