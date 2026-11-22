package br.com.financeia.mobile.notifications

import org.json.JSONObject

/**
 * Minimized notification payload captured from an authorized banking app.
 * Masks sensitive PAN / CPF / verification tokens before persisting to EncryptedSharedPreferences.
 */
data class NotificationEvent(
    val eventId: String,
    val sourceEventKey: String,
    val packageName: String,
    val appLabel: String,
    val title: String,
    val text: String,
    val bigText: String,
    val subText: String,
    val receivedAt: Long,
    val channelId: String
) {
    fun toJson(): JSONObject {
        return JSONObject().apply {
            put("eventId", eventId)
            put("sourceEventKey", sourceEventKey)
            put("packageName", packageName)
            put("appLabel", appLabel)
            put("title", title)
            put("text", text)
            put("bigText", bigText)
            put("subText", subText)
            put("receivedAt", receivedAt)
            put("channelId", channelId)
        }
    }

    companion object {
        private val PAN_REGEX = Regex("""\b(?:\d[ -]*?){13,19}\b""")
        private val CPF_REGEX = Regex("""\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b""")
        private val OTP_REGEX = Regex(
            """\b(c[oó]digo(?:\s+de)?\s+(?:seguran[çc]a|verifica[çc][ãa]o|acesso)|token|otp|senha)\s*[:#-]?\s*[a-zA-Z0-9]{4,12}\b""",
            RegexOption.IGNORE_CASE
        )

        fun sanitizeAndMinimize(raw: String, maxLen: Int = 260): String {
            if (raw.isBlank()) return ""
            var cleaned = raw.replace(Regex("""[\r\n\t]+"""), " ").replace(Regex("""\s+"""), " ").trim()
            cleaned = PAN_REGEX.replace(cleaned) { match ->
                val digits = match.value.filter { it.isDigit() }
                if (digits.length < 13) match.value else "•••• ${digits.takeLast(4)}"
            }
            cleaned = CPF_REGEX.replace(cleaned, "***.***.***-**")
            cleaned = OTP_REGEX.replace(cleaned) { match ->
                val label = match.groupValues.getOrNull(1) ?: "Código"
                "$label: ••••••"
            }
            return if (cleaned.length > maxLen) cleaned.take(maxLen - 1).trimEnd() + "…" else cleaned
        }

        fun fromJson(obj: JSONObject): NotificationEvent? {
            val eventId = obj.optString("eventId", "").trim()
            val packageName = obj.optString("packageName", "").trim()
            if (eventId.isEmpty() || packageName.isEmpty()) return null
            return NotificationEvent(
                eventId = eventId,
                sourceEventKey = obj.optString("sourceEventKey", eventId),
                packageName = packageName,
                appLabel = obj.optString("appLabel", ""),
                title = obj.optString("title", ""),
                text = obj.optString("text", ""),
                bigText = obj.optString("bigText", ""),
                subText = obj.optString("subText", ""),
                receivedAt = obj.optLong("receivedAt", System.currentTimeMillis()),
                channelId = obj.optString("channelId", "")
            )
        }
    }
}
