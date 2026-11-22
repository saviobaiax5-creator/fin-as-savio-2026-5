# FINANCE IA ProGuard / R8 Rules
-keepattributes *Annotation*
-keep public class * extends com.getcapacitor.Plugin
-keepclassmembers class * extends com.getcapacitor.Plugin {
    @com.getcapacitor.PluginMethod <methods>;
}
-keep class br.com.financeia.mobile.** { *; }
-keep class * extends android.service.notification.NotificationListenerService { *; }
-dontwarn com.getcapacitor.**
