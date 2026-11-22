package br.com.financeia.mobile.notifications

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import org.json.JSONArray
import org.json.JSONObject

/**
 * Persistent AES-256 encrypted notification queue backed by Android Keystore.
 * Survives app termination and device reboot; never logs banking contents.
 */
object NotificationQueue {
    private const val PREFS_NAME = "finance_ia_encrypted_notif_queue"
    private const val KEY_EVENTS_JSON = "pending_events_v1"
    private const val MAX_QUEUE_SIZE = 200
    private const val RETENTION_MS = 30L * 24L * 60L * 60L * 1000L

    private val lock = Any()

    private fun getEncryptedPrefs(context: Context): SharedPreferences {
        val appCtx = context.applicationContext
        val masterKey = MasterKey.Builder(appCtx)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()

        return EncryptedSharedPreferences.create(
            appCtx,
            PREFS_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    private fun readAllLocked(prefs: SharedPreferences, nowMs: Long): MutableList<NotificationEvent> {
        val raw = prefs.getString(KEY_EVENTS_JSON, null) ?: return mutableListOf()
        val list = mutableListOf<NotificationEvent>()
        try {
            val arr = JSONArray(raw)
            for (i in 0 until arr.length()) {
                val obj = arr.optJSONObject(i) ?: continue
                val ev = NotificationEvent.fromJson(obj) ?: continue
                if (nowMs - ev.receivedAt <= RETENTION_MS) {
                    list.add(ev)
                }
            }
        } catch (_: Exception) {
            return mutableListOf()
        }
        return list
    }

    private fun writeAllLocked(prefs: SharedPreferences, events: List<NotificationEvent>) {
        val arr = JSONArray()
        events.takeLast(MAX_QUEUE_SIZE).forEach { arr.put(it.toJson()) }
        prefs.edit().putString(KEY_EVENTS_JSON, arr.toString()).apply()
    }

    fun enqueue(context: Context, event: NotificationEvent): Boolean {
        synchronized(lock) {
            return try {
                val prefs = getEncryptedPrefs(context)
                val now = System.currentTimeMillis()
                val current = readAllLocked(prefs, now)
                // Deduplicate by sourceEventKey or eventId before queueing
                val exists = current.any {
                    it.eventId == event.eventId ||
                        (event.sourceEventKey.isNotBlank() && it.sourceEventKey == event.sourceEventKey)
                }
                if (exists) return false
                current.add(event)
                writeAllLocked(prefs, current)
                true
            } catch (_: Exception) {
                false
            }
        }
    }

    fun getPendingEvents(context: Context): List<NotificationEvent> {
        synchronized(lock) {
            return try {
                val prefs = getEncryptedPrefs(context)
                readAllLocked(prefs, System.currentTimeMillis())
            } catch (_: Exception) {
                emptyList()
            }
        }
    }

    fun getPendingCount(context: Context): Int {
        return getPendingEvents(context).size
    }

    fun acknowledge(context: Context, eventIds: List<String>): Int {
        if (eventIds.isEmpty()) return 0
        synchronized(lock) {
            return try {
                val prefs = getEncryptedPrefs(context)
                val current = readAllLocked(prefs, System.currentTimeMillis())
                val idSet = eventIds.toSet()
                val remaining = current.filterNot { idSet.contains(it.eventId) }
                val removed = current.size - remaining.size
                writeAllLocked(prefs, remaining)
                removed
            } catch (_: Exception) {
                0
            }
        }
    }

    fun clearAll(context: Context): Boolean {
        synchronized(lock) {
            return try {
                val prefs = getEncryptedPrefs(context)
                prefs.edit().remove(KEY_EVENTS_JSON).apply()
                true
            } catch (_: Exception) {
                false
            }
        }
    }
}
