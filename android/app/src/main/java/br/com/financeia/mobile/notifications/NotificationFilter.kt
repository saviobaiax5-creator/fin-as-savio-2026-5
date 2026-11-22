package br.com.financeia.mobile.notifications

import android.app.Notification
import android.service.notification.StatusBarNotification
import java.text.Normalizer
import java.util.Locale

/**
 * Filters out non-financial noise (ongoing notifications, group summaries,
 * pure 2FA/OTP codes, promotional banners) before persisting to the encrypted queue.
 */
object NotificationFilter {
    private val OTP_ONLY_REGEX = Regex(
        """\b(codigo\s+(de\s+)?(verificacao|seguranca|acesso)|token\s+(de\s+)?(acesso|seguranca)|chave\s+de\s+seguranca|nao\s+compartilhe\s+este\s+codigo)\b"""
    )

    private val PROMO_NOISE_REGEX = Regex(
        """\b(baixe\s+agora|aproveite\s+a\s+promocao|cashback\s+especial|emprestimo\s+pre-aprovado|convide\s+seus\s+amigos)\b"""
    )

    private val FINANCIAL_OR_PRIVACY_HINT_REGEX = Regex(
        """(r\$|\bpix\b|\bcompra\b|\bcartao\b|\bfatura\b|\bdebito\b|\bcredito\b|\btransferencia\b|\bboleto\b|\bestorno\b|\btarifa\b|\bsaque\b|\bpagamento\b|\brecusad[ao]\b|\bnegad[ao]\b|conteudo\s+oculto|content\s+hidden)"""
    )

    private fun normalize(input: String): String {
        val nfd = Normalizer.normalize(input.lowercase(Locale.ROOT), Normalizer.Form.NFD)
        return nfd.replace(Regex("""\p{InCombiningDiacriticalMarks}+"""), "").replace(Regex("""\s+"""), " ").trim()
    }

    fun shouldCapture(sbn: StatusBarNotification?): Boolean {
        if (sbn == null) return false
        val notification = sbn.notification ?: return false

        // Ignore ongoing service/foreground notifications and container group summaries
        if ((notification.flags and Notification.FLAG_ONGOING_EVENT) != 0) return false
        if ((notification.flags and Notification.FLAG_GROUP_SUMMARY) != 0) return false

        val extras = notification.extras ?: return false
        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty().trim()
        val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString().orEmpty().trim()
        val bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString().orEmpty().trim()

        val combined = listOf(title, text, bigText).filter { it.isNotEmpty() }.joinToString(" ")
        if (combined.isBlank()) return false

        val norm = normalize(combined)
        val hasMoneyOrFinancialKeyword = FINANCIAL_OR_PRIVACY_HINT_REGEX.containsMatchIn(norm)

        // Block pure OTP codes unless accompanied by an actual currency amount / transaction
        if (OTP_ONLY_REGEX.containsMatchIn(norm) && !norm.contains("r$")) {
            return false
        }

        if (PROMO_NOISE_REGEX.containsMatchIn(norm) && !hasMoneyOrFinancialKeyword) {
            return false
        }

        return hasMoneyOrFinancialKeyword
    }
}
