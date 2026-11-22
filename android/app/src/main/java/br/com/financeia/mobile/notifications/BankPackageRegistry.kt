package br.com.financeia.mobile.notifications

import android.content.Context
import android.content.pm.PackageManager
import java.util.Locale

/**
 * Validated registry of authorized Brazilian banking applications.
 * Never assumes package IDs without format validation and explicit authorization checks.
 */
object BankPackageRegistry {
    private val PACKAGE_REGEX = Regex("""^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z0-9_]+)+$""")

    val DEFAULT_VERIFIED_PACKAGES: Map<String, String> = mapOf(
        "com.nu.production" to "Nubank",
        "com.itau" to "Itaú",
        "br.com.intermedium" to "Banco Inter",
        "com.bradesco" to "Bradesco",
        "com.santander.app" to "Santander",
        "br.com.bb.android" to "Banco do Brasil",
        "br.com.gabba.Caixa" to "Caixa Econômica",
        "com.c6bank.app" to "C6 Bank",
        "com.picpay" to "PicPay",
        "com.mercadopago.wallet" to "Mercado Pago",
        "com.btg.pactual.digital.mobile" to "BTG Pactual",
        "br.com.uol.ps.myaccount" to "PagBank",
        "br.com.neon" to "Neon"
    )

    fun isValidPackageFormat(packageName: String?): Boolean {
        if (packageName.isNullOrBlank()) return false
        val trimmed = packageName.trim()
        return trimmed.length in 5..140 && PACKAGE_REGEX.matches(trimmed)
    }

    fun isAuthorized(context: Context, packageName: String?): Boolean {
        if (!isValidPackageFormat(packageName)) return false
        val clean = packageName!!.trim().lowercase(Locale.ROOT)
        // Must be explicitly enabled in the user's authorized package list stored by NotificationAccess
        val userAllowed = NotificationAccess.getAuthorizedPackages(context)
        if (!userAllowed.contains(clean)) return false
        return isPackageInstalled(context, packageName.trim())
    }

    fun isPackageInstalled(context: Context, packageName: String): Boolean {
        return try {
            context.packageManager.getApplicationInfo(packageName, 0)
            true
        } catch (_: PackageManager.NameNotFoundException) {
            false
        } catch (_: Exception) {
            false
        }
    }

    fun resolveAppLabel(context: Context, packageName: String): String {
        val clean = packageName.trim().lowercase(Locale.ROOT)
        DEFAULT_VERIFIED_PACKAGES[clean]?.let { return it }
        return try {
            val info = context.packageManager.getApplicationInfo(packageName, 0)
            context.packageManager.getApplicationLabel(info).toString()
        } catch (_: Exception) {
            packageName
        }
    }
}
