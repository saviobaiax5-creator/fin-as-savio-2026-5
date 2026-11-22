package br.com.financeia.mobile.notifications

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import org.json.JSONArray
import java.util.Locale

/**
 * Controls Android NotificationListenerService authorization status,
 * explicit user consent, and authorized bank package allowlist.
 */
object NotificationAccess {
    private const val PREFS_NAME = "finance_ia_notif_access_prefs"
    private const val KEY_CONSENT_GRANTED = "consent_granted"
    private const val KEY_AUTHORIZED_PACKAGES = "authorized_packages_json"

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

    fun isNotificationServiceEnabled(context: Context): Boolean {
        return try {
            val enabledPackages = NotificationManagerCompat.getEnabledListenerPackages(context)
            if (enabledPackages.contains(context.packageName)) {
                return true
            }
            val flat = Settings.Secure.getString(
                context.contentResolver,
                "enabled_notification_listeners"
            ) ?: return false
            val expected = ComponentName(context, BankNotificationListener::class.java).flattenToString()
            flat.split(":").any { it.equals(expected, ignoreCase = true) }
        } catch (_: Exception) {
            false
        }
    }

    fun openNotificationListenerSettings(context: Context): Boolean {
        return try {
            val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
            true
        } catch (_: Exception) {
            false
        }
    }

    fun hasExplicitConsent(context: Context): Boolean {
        return try {
            getEncryptedPrefs(context).getBoolean(KEY_CONSENT_GRANTED, false)
        } catch (_: Exception) {
            false
        }
    }

    fun getAuthorizedPackages(context: Context): Set<String> {
        return try {
            val raw = getEncryptedPrefs(context).getString(KEY_AUTHORIZED_PACKAGES, null)
                ?: return BankPackageRegistry.DEFAULT_VERIFIED_PACKAGES.keys
            val arr = JSONArray(raw)
            val set = mutableSetOf<String>()
            for (i in 0 until arr.length()) {
                val pkg = arr.optString(i, "").trim().lowercase(Locale.ROOT)
                if (BankPackageRegistry.isValidPackageFormat(pkg)) {
                    set.add(pkg)
                }
            }
            set
        } catch (_: Exception) {
            BankPackageRegistry.DEFAULT_VERIFIED_PACKAGES.keys
        }
    }

    fun setCaptureConsent(
        context: Context,
        consentGranted: Boolean,
        authorizedPackages: List<String>
    ): Boolean {
        return try {
            val arr = JSONArray()
            authorizedPackages
                .map { it.trim().lowercase(Locale.ROOT) }
                .filter { BankPackageRegistry.isValidPackageFormat(it) }
                .distinct()
                .forEach { arr.put(it) }

            getEncryptedPrefs(context).edit()
                .putBoolean(KEY_CONSENT_GRANTED, consentGranted)
                .putString(KEY_AUTHORIZED_PACKAGES, arr.toString())
                .apply()

            if (!consentGranted) {
                NotificationQueue.clearAll(context)
            }
            true
        } catch (_: Exception) {
            false
        }
    }
}
