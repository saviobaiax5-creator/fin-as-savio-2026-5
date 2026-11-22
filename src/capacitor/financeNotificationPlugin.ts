import { Capacitor, registerPlugin } from '@capacitor/core';
import type {
  NotificationPermissionStatus,
  NotificationPlatform,
  RawNotificationEvent,
} from '../domain/notifications/notification.types';

export interface NativePermissionStatusResult {
  listenerEnabled: boolean;
  consentGranted: boolean;
  pendingCount: number;
}

export interface NativePendingEventsResult {
  events: RawNotificationEvent[];
}

export interface FinanceNotificationPluginContract {
  openNotificationSettings(): Promise<{ opened: boolean }>;
  getPermissionStatus(): Promise<NativePermissionStatusResult>;
  getPendingEvents(): Promise<NativePendingEventsResult>;
  acknowledgeEvents(options: { eventIds: string[] }): Promise<{ acknowledged: number }>;
  setCaptureConsent(options: {
    consentGranted: boolean;
    authorizedPackages: string[];
  }): Promise<{ saved: boolean }>;
  clearNativeQueue(): Promise<{ cleared: boolean }>;
}

const FinanceNotificationNative = registerPlugin<FinanceNotificationPluginContract>(
  'FinanceNotification'
);

export function getRuntimeNotificationPlatform(): NotificationPlatform {
  const platform = Capacitor.getPlatform();
  if (platform === 'android') return 'android';
  if (platform === 'ios') return 'ios';
  return 'web';
}

export function isAndroidNativeRuntime(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

export const financeNotificationBridge = {
  async getPermissionStatus(localConsentGranted: boolean): Promise<NotificationPermissionStatus> {
    const platform = getRuntimeNotificationPlatform();

    if (platform === 'web') {
      return {
        platform: 'web',
        supported: false,
        listenerEnabled: false,
        consentGranted: localConsentGranted,
        pendingNativeCount: 0,
        unsupportedReason: 'WEB_UNSUPPORTED',
      };
    }

    if (platform === 'ios') {
      return {
        platform: 'ios',
        supported: false,
        listenerEnabled: false,
        consentGranted: localConsentGranted,
        pendingNativeCount: 0,
        unsupportedReason: 'IOS_UNSUPPORTED',
      };
    }

    try {
      const res = await FinanceNotificationNative.getPermissionStatus();
      return {
        platform: 'android',
        supported: true,
        listenerEnabled: Boolean(res.listenerEnabled),
        consentGranted: Boolean(res.consentGranted ?? localConsentGranted),
        pendingNativeCount: Number(res.pendingCount) || 0,
      };
    } catch {
      return {
        platform: 'android',
        supported: false,
        listenerEnabled: false,
        consentGranted: localConsentGranted,
        pendingNativeCount: 0,
        unsupportedReason: 'PLUGIN_UNAVAILABLE',
      };
    }
  },

  async openNotificationSettings(): Promise<{ opened: boolean; error?: string }> {
    if (!isAndroidNativeRuntime()) {
      return {
        opened: false,
        error:
          getRuntimeNotificationPlatform() === 'ios'
            ? 'O iOS não permite acesso de terceiros às notificações de aplicativos bancários.'
            : 'A captura automática exige o aplicativo Android nativo (NotificationListenerService).',
      };
    }

    try {
      const res = await FinanceNotificationNative.openNotificationSettings();
      return { opened: Boolean(res.opened) };
    } catch {
      return {
        opened: false,
        error: 'Não foi possível abrir as configurações de acesso a notificações do Android.',
      };
    }
  },

  async getPendingEvents(): Promise<RawNotificationEvent[]> {
    if (!isAndroidNativeRuntime()) {
      return [];
    }
    try {
      const res = await FinanceNotificationNative.getPendingEvents();
      return Array.isArray(res?.events) ? res.events : [];
    } catch {
      return [];
    }
  },

  async acknowledgeEvents(eventIds: string[]): Promise<number> {
    if (!isAndroidNativeRuntime() || eventIds.length === 0) {
      return 0;
    }
    try {
      const res = await FinanceNotificationNative.acknowledgeEvents({ eventIds });
      return Number(res?.acknowledged) || 0;
    } catch {
      return 0;
    }
  },

  async syncNativeConsentAndPackages(params: {
    consentGranted: boolean;
    authorizedPackages: string[];
  }): Promise<boolean> {
    if (!isAndroidNativeRuntime()) {
      return false;
    }
    try {
      const res = await FinanceNotificationNative.setCaptureConsent(params);
      return Boolean(res?.saved);
    } catch {
      return false;
    }
  },

  async clearNativeQueue(): Promise<boolean> {
    if (!isAndroidNativeRuntime()) {
      return false;
    }
    try {
      const res = await FinanceNotificationNative.clearNativeQueue();
      return Boolean(res?.cleared);
    } catch {
      return false;
    }
  },
};
