import React, { useEffect, useState } from 'react';
import { Download, Smartphone } from 'lucide-react';
import { Sheet } from './Sheet';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(isStandalone);

    const ua = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(ua));

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  return {
    isInstallable: Boolean(deferredPrompt),
    isInstalled,
    isIOS,
    install,
  };
}

export const PWAInstallButton: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="flex items-center gap-1.5 rounded-xl bg-[#059669] hover:bg-emerald-700 text-white px-3 min-h-10 text-xs font-bold transition cursor-pointer shrink-0"
        title="Instalar Sávio Finanças como aplicativo"
      >
        <Download size={15} />
        <span>{compact ? 'Instalar' : 'Instalar App'}</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 px-3 min-h-10 text-xs font-semibold cursor-pointer shrink-0"
        >
          <Smartphone size={15} className="text-emerald-600" />
          <span>{compact ? 'App iOS' : 'Instalar no iPhone'}</span>
        </button>

        <Sheet
          open={showIOSGuide}
          onClose={() => setShowIOSGuide(false)}
          title="Instalar no iPhone / iPad"
          subtitle="Acesso rápido na tela inicial com funcionamento offline"
        >
          <ol className="space-y-3 text-sm text-slate-700 dark:text-slate-200 list-decimal pl-5">
            <li>
              Toque no botão <strong>Compartilhar</strong> na barra inferior do Safari.
            </li>
            <li>
              Role para baixo e escolha <strong>Adicionar à Tela de Início</strong>.
            </li>
            <li>
              Confirme em <strong>Adicionar</strong> para abrir em tela cheia sem barra do navegador.
            </li>
          </ol>

          <button
            type="button"
            onClick={() => setShowIOSGuide(false)}
            className="w-full min-h-11 rounded-xl bg-[#061E3E] hover:bg-[#0F172A] dark:bg-[#059669] dark:hover:bg-emerald-700 text-white text-sm font-bold cursor-pointer"
          >
            Entendi
          </button>
        </Sheet>
      </>
    );
  }

  return null;
};
