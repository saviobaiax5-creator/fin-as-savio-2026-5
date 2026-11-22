import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const ROOT_DIR = path.resolve(__dirname, '../../..');

function readRepoFile(relPath: string): string {
  const fullPath = path.join(ROOT_DIR, relPath);
  expect(fs.existsSync(fullPath), `Arquivo esperado não encontrado: ${relPath}`).toBe(true);
  return fs.readFileSync(fullPath, 'utf-8');
}

describe('Prontidão Android Nativo, Capacitor & Pipeline CI/CD', () => {
  it('configura Capacitor com appId, webDir=dist e esquema HTTPS sem tráfego cleartext', () => {
    const capConfig = readRepoFile('capacitor.config.ts');
    expect(capConfig).toContain("appId: 'br.com.financeia.mobile'");
    expect(capConfig).toContain("appName: 'Sávio Finanças'");
    expect(capConfig).toContain("webDir: 'dist'");
    expect(capConfig).toContain("androidScheme: 'https'");
    expect(capConfig).toContain('allowMixedContent: false');
  });

  it('mantém Gradle 8.9, AGP 8.7.2, SDK 35 e Java/Kotlin 17 alinhados no projeto Android', () => {
    const rootGradle = readRepoFile('android/build.gradle');
    const appGradle = readRepoFile('android/app/build.gradle');
    const settingsGradle = readRepoFile('android/settings.gradle');
    const wrapperProps = readRepoFile('android/gradle/wrapper/gradle-wrapper.properties');

    expect(rootGradle).toContain('compileSdkVersion = 35');
    expect(rootGradle).toContain('targetSdkVersion = 35');
    expect(rootGradle).toContain('minSdkVersion = 24');
    expect(rootGradle).toContain('com.android.tools.build:gradle:8.7.2');

    expect(appGradle).toContain('namespace = "br.com.financeia.mobile"');
    expect(appGradle).toContain('JavaVersion.VERSION_17');
    expect(appGradle).toContain("jvmTarget = '17'");
    expect(appGradle).toContain("implementation project(':capacitor-android')");
    expect(appGradle).toContain('proguard-rules.pro');

    expect(settingsGradle).toContain("include ':app'");
    expect(settingsGradle).toContain("include ':capacitor-android'");
    expect(wrapperProps).toContain('gradle-8.9-bin.zip');
  });

  it('garante AndroidManifest seguro sem permissões de SMS e com NotificationListenerService declarado', () => {
    const manifest = readRepoFile('android/app/src/main/AndroidManifest.xml');
    const stringsXml = readRepoFile('android/app/src/main/res/values/strings.xml');
    const proguard = readRepoFile('android/app/proguard-rules.pro');

    expect(manifest).not.toContain('android.permission.READ_SMS');
    expect(manifest).not.toContain('android.permission.RECEIVE_SMS');
    expect(manifest).toContain('android:allowBackup="false"');
    expect(manifest).toContain('android:usesCleartextTraffic="false"');
    expect(manifest).toContain('android.permission.BIND_NOTIFICATION_LISTENER_SERVICE');
    expect(manifest).toContain('android.service.notification.NotificationListenerService');

    expect(stringsXml).toContain('<string name="app_name">Sávio Finanças</string>');
    expect(stringsXml).toContain('<string name="package_name">br.com.financeia.mobile</string>');

    expect(proguard).toContain('-keep class br.com.financeia.mobile.** { *; }');
    expect(proguard).toContain('-keep public class * extends com.getcapacitor.Plugin');
    expect(proguard).toContain('NotificationListenerService');
  });

  it('inclui workflow de GitHub Actions completo para Debug APK e Release AAB/APK condicional + auditoria de 2º plano', () => {
    const workflow = readRepoFile('.github/workflows/android-build.yml');
    const bgAudit = readRepoFile('docs/ANDROID_BACKGROUND_AUDIT.md');

    expect(workflow).toContain('npm run lint');
    expect(workflow).toContain('npm test');
    expect(workflow).toContain('npm run build');
    expect(workflow).toContain('npx cap sync android');
    expect(workflow).toContain("java-version: '17'");
    expect(workflow).toContain('platforms;android-35');
    expect(workflow).toContain("gradle-version: '8.9'");
    expect(workflow).toContain('gradle assembleDebug --no-daemon');
    expect(workflow).toContain('gradle assembleRelease bundleRelease --no-daemon');

    expect(bgAudit).toContain('NotificationListenerService');
    expect(bgAudit).toContain('Doze Mode');
    expect(bgAudit).toContain('Restricted Settings');
  });
});
