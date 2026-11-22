package br.com.financeia.mobile.notifications

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import java.util.UUID

/**
 * Android NotificationListenerService capturing notifications exclusively from
 * user-authorized banking packages after explicit consent.
 * Security guarantees:
 * - Never reads SMS.
 * - Never logs raw banking notification text/title.
 * - Stores minimized & masked payload into encrypted NotificationQueue even when app is closed.
 */
class BankNotificationListener : NotificationListenerService() {

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        if (sbn == null) return

        // 1. Require explicit opt-in consent before inspecting or persisting anything
        if (!NotificationAccess.hasExplicitConsent(applicationContext)) return

        // 2. Enforce authorized banking package allowlist + format validation
        val pkg = sbn.packageName?.trim().orEmpty()
        if (!BankPackageRegistry.isAuthorized(applicationContext, pkg)) return

        // 3. Filter non-financial noise (ongoing, summary, pure OTP, promos)
        if (!NotificationFilter.shouldCapture(sbn)) return

        val extras = sbn.notification?.extras ?: return
        val rawTitle = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
        val rawText = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString().orEmpty()
        val rawBigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString().orEmpty()
        val rawSubText = extras.getCharSequence(Notification.EXTRA_SUB_TEXT)?.toString().orEmpty()

        val channelId = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            sbn.notification?.channelId.orEmpty()
        } else {
            ""
        }

        val postTime = if (sbn.postTime > 0L) sbn.postTime else System.currentTimeMillis()
        val sourceKey = "${pkg}|${sbn.key}|${postTime}"

        val event = NotificationEvent(
            eventId = "ev-${UUID.randomUUID()}",
            sourceEventKey = sourceKey,
            packageName = pkg,
            appLabel = BankPackageRegistry.resolveAppLabel(applicationContext, pkg),
            title = NotificationEvent.sanitizeAndMinimize(rawTitle, 90),
            text = NotificationEvent.sanitizeAndMinimize(rawText, 240),
            bigText = NotificationEvent.sanitizeAndMinimize(rawBigText, 260),
            subText = NotificationEvent.sanitizeAndMinimize(rawSubText, 90),
            receivedAt = postTime,
            channelId = channelId
        )

        NotificationQueue.enqueue(applicationContext, event)
    }
}
