package br.com.financeia.mobile.notifications

import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "FinanceNotification")
class FinanceNotificationPlugin : Plugin() {

    @PluginMethod
    fun openNotificationSettings(call: PluginCall) {
        val opened = NotificationAccess.openNotificationListenerSettings(context)
        val result = JSObject().apply {
            put("opened", opened)
        }
        call.resolve(result)
    }

    @PluginMethod
    fun getPermissionStatus(call: PluginCall) {
        val listenerEnabled = NotificationAccess.isNotificationServiceEnabled(context)
        val consentGranted = NotificationAccess.hasExplicitConsent(context)
        val pendingCount = NotificationQueue.getPendingCount(context)

        val result = JSObject().apply {
            put("listenerEnabled", listenerEnabled)
            put("consentGranted", consentGranted)
            put("pendingCount", pendingCount)
        }
        call.resolve(result)
    }

    @PluginMethod
    fun getPendingEvents(call: PluginCall) {
        if (!NotificationAccess.hasExplicitConsent(context)) {
            call.resolve(JSObject().apply { put("events", JSArray()) })
            return
        }

        val events = NotificationQueue.getPendingEvents(context)
        val arr = JSArray()
        events.forEach { ev -> arr.put(ev.toJson()) }

        call.resolve(JSObject().apply {
            put("events", arr)
        })
    }

    @PluginMethod
    fun acknowledgeEvents(call: PluginCall) {
        val idsArray = call.getArray("eventIds")
        val ids = mutableListOf<String>()
        if (idsArray != null) {
            for (i in 0 until idsArray.length()) {
                val id = idsArray.optString(i, "").trim()
                if (id.isNotEmpty()) ids.add(id)
            }
        }
        val acknowledged = NotificationQueue.acknowledge(context, ids)
        call.resolve(JSObject().apply {
            put("acknowledged", acknowledged)
        })
    }

    @PluginMethod
    fun setCaptureConsent(call: PluginCall) {
        val consentGranted = call.getBoolean("consentGranted", false) ?: false
        val pkgArray = call.getArray("authorizedPackages")
        val pkgs = mutableListOf<String>()
        if (pkgArray != null) {
            for (i in 0 until pkgArray.length()) {
                val p = pkgArray.optString(i, "").trim()
                if (p.isNotEmpty()) pkgs.add(p)
            }
        }
        val saved = NotificationAccess.setCaptureConsent(context, consentGranted, pkgs)
        call.resolve(JSObject().apply {
            put("saved", saved)
        })
    }

    @PluginMethod
    fun clearNativeQueue(call: PluginCall) {
        val cleared = NotificationQueue.clearAll(context)
        call.resolve(JSObject().apply {
            put("cleared", cleared)
        })
    }
}
