# Auditoria Android Nativo & Captura em Segundo Plano — FINANCE IA

## 1. Escopo Real da Auditoria
- **Ambiente deste sandbox**: Linux Node.js (sem JDK, sem Android SDK/build-tools, sem Gradle daemon e sem dispositivo físico/emulador ADB).
- **O que foi executado localmente**: build Web de produção (`npm run build`), sincronização Capacitor (`npx cap sync android`), validação de contratos TypeScript, manifesto Android, configurações Gradle e suíte automatizada Vitest.
- **O que requer execução externa (CI ou máquina local com Android Studio)**: compilação nativa Gradle para geração binária do `.apk` / `.aab` e teste em dispositivo físico Android.

## 2. Alinhamento Nativo (Android / Capacitor / Gradle)
- `capacitor.config.ts`: `appId: br.com.financeia.mobile`, `appName: FINANCE IA`, `webDir: dist`, `androidScheme: https`, `allowMixedContent: false`.
- `android/build.gradle`: AGP `8.7.2`, Kotlin `1.9.24`, `compileSdkVersion = 35`, `targetSdkVersion = 35`, `minSdkVersion = 24`, `androidxSecurityCrypto = 1.1.0-alpha06`.
- `android/app/build.gradle`: `JavaVersion.VERSION_17`, `jvmTarget = '17'`, R8/ProGuard configurado com `proguard-rules.pro`.
- `android/gradle/wrapper/gradle-wrapper.properties`: Gradle `8.9`.
- `@capacitor/android` e `@capacitor/cli` (`^8.6.2`) instalados e integrados via `settings.gradle`.

## 3. Segurança & Permissões do Manifesto
- `AndroidManifest.xml` declara apenas `INTERNET` e o serviço `BankNotificationListener` protegido por `android.permission.BIND_NOTIFICATION_LISTENER_SERVICE`.
- Zero permissões de SMS (`READ_SMS` / `RECEIVE_SMS` ausentes intencionalmente).
- `allowBackup="false"`, `fullBackupContent="false"`, `usesCleartextTraffic="false"`.

## 4. Limitações Reais do Android em Segundo Plano
1. **App totalmente fechado / Force Stop**: se o usuário forçar a parada do app nas configurações do sistema, o Android suspende o vínculo do `NotificationListenerService` até nova abertura manual ou reconexão do sistema.
2. **Doze Mode & App Standby (Android 6+)**: em repouso prolongado, o sistema pode atrasar entrega ou hibernar o processo WebView; o `BankNotificationListener` é reiniciado pelo sistema quando ativo, enfileirando eventos em armazenamento criptografado (`EncryptedSharedPreferences`) para leitura quando o app for reaberto.
3. **Otimizações agressivas de fabricantes (Xiaomi/MIUI, Samsung, Motorola, Realme)**: podem encerrar serviços em segundo plano caso o usuário não marque o app em "Sem restrições" nas configurações de bateria.
4. **Android 13+ (API 33+) — Restricted Settings em APK sideloaded**: APKs instalados manualmente fora da Play Store têm o acesso a `NotificationListenerService` bloqueado por padrão ("Configuração restrita") até o usuário liberar em *Informações do App -> Menu -> Permitir configurações restritas*.
5. **Segurança e Privacidade na Captura**:
   - Exige consentimento explícito (`NotificationAccess.hasExplicitConsent`).
   - Filtra estritamente pela allowlist de pacotes bancários autorizados (`BankPackageRegistry`).
   - Ignora notificações `ongoing`, resumos agrupados, mensagens promocionais e OTP/tokens.
   - Aplica minimização e sanitização de payload sem registrar conteúdo bancário em logs (`Log.*`).
   - Nenhuma criação automática de lançamento sem revisão do usuário na Central de Notificações.
