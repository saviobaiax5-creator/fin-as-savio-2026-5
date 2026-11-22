package br.com.financeia.mobile

import android.os.Bundle
import br.com.financeia.mobile.notifications.FinanceNotificationPlugin
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(FinanceNotificationPlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}
