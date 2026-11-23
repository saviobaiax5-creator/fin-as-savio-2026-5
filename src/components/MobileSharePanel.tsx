import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import {
  Smartphone,
  Copy,
  Check,
  Share2,
  ExternalLink,
  MessageCircle,
  QrCode,
} from 'lucide-react';
import { Sheet } from './Sheet';
import {
  buildWhatsAppShareUrl,
  canUseNativeShare,
  copyLinkToClipboard,
  resolveMobileShareInfo,
  triggerNativeMobileShare,
} from '../utils/mobileShare';

interface MobileShareContentProps {
  compact?: boolean;
}

const MobileShareContent: React.FC<MobileShareContentProps> = ({ compact = false }) => {
  const shareInfo = useMemo(() => resolveMobileShareInfo(), []);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [shareFeedback, setShareFeedback] = useState('');
  const nativeShareAvailable = useMemo(() => canUseNativeShare(), []);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(shareInfo.shareUrl, {
      width: 240,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#061E3E',
        light: '#ffffff',
      },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl('');
      });

    return () => {
      cancelled = true;
    };
  }, [shareInfo.shareUrl]);

  const handleCopy = async () => {
    const ok = await copyLinkToClipboard(shareInfo.shareUrl);
    if (ok) {
      setCopied(true);
      setShareFeedback('Link compatível com celular copiado para a área de transferência.');
      setTimeout(() => setCopied(false), 2500);
    } else {
      setShareFeedback('Selecione e copie o link manualmente no campo acima.');
    }
  };

  const handleNativeShare = async () => {
    const result = await triggerNativeMobileShare(shareInfo.shareUrl);
    if (result === 'shared') {
      setShareFeedback('Link compartilhado com sucesso.');
    } else if (result === 'unsupported') {
      await handleCopy();
    }
  };

  return (
    <div className={compact ? 'space-y-4' : 'space-y-5'}>
      <div className="flex flex-col md:flex-row items-center md:items-start gap-5">
        <div className="shrink-0 sf-card p-3 flex flex-col items-center gap-1.5">
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt="QR Code para abrir o Sávio Finanças no celular"
              className="w-40 h-40 rounded-lg"
            />
          ) : (
            <div className="w-40 h-40 rounded-lg bg-slate-100 grid place-items-center text-slate-400">
              <QrCode size={40} />
            </div>
          )}
          <span className="text-[11px] font-semibold text-slate-500">
            Aponte a câmera do celular
          </span>
        </div>

        <div className="flex-1 min-w-0 w-full space-y-3">
          <div>
            <label
              htmlFor="mobile-share-url-input"
              className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1"
            >
              Link compatível para celular (Android, iPhone e WhatsApp)
            </label>
            <div className="flex items-stretch gap-2">
              <input
                id="mobile-share-url-input"
                type="url"
                readOnly
                value={shareInfo.shareUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 min-w-0 px-3 py-2.5 min-h-11 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-800 text-xs sm:text-sm font-mono text-[#0F172A] dark:text-slate-100 outline-none select-all"
              />
              <button
                type="button"
                onClick={() => void handleCopy()}
                className="px-4 min-h-11 rounded-xl bg-[#061E3E] hover:bg-[#0F172A] dark:bg-[#059669] dark:hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                {copied ? <Check size={15} /> : <Copy size={15} />}
                <span>{copied ? 'Copiado!' : 'Copiar'}</span>
              </button>
            </div>
          </div>

          {shareInfo.isPreviewDevUrl && (
            <p className="text-[11px] text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl px-3 py-2">
              Link convertido automaticamente para a rota de compartilhamento (<code>ais-pre-*</code>), evitando bloqueio de sessão do editor ao abrir no celular.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {nativeShareAvailable && (
              <button
                type="button"
                onClick={() => void handleNativeShare()}
                className="px-4 min-h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Share2 size={14} /> Compartilhar no aparelho
              </button>
            )}

            <a
              href={buildWhatsAppShareUrl(shareInfo.shareUrl)}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 min-h-10 rounded-xl bg-[#1f8b4c] hover:bg-[#19743f] text-white text-xs font-bold flex items-center gap-1.5"
            >
              <MessageCircle size={14} /> Enviar pelo WhatsApp
            </a>

            <a
              href={shareInfo.shareUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 min-h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-xs font-bold flex items-center gap-1.5"
            >
              <ExternalLink size={14} /> Abrir link
            </a>
          </div>

          {shareFeedback && (
            <p role="status" className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              {shareFeedback}
            </p>
          )}

          <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed pt-1">
            <strong>Dica para uso contínuo no celular:</strong> abra o link no <strong>Chrome (Android)</strong> ou <strong>Safari (iPhone)</strong>, toque em <em>Adicionar à tela inicial</em> e entre com a mesma conta Google/E-mail para manter os dados sincronizados entre computador e telefone.
          </div>
        </div>
      </div>
    </div>
  );
};

export const MobileShareCard: React.FC = () => {
  return (
    <div className="sf-card p-5 sm:p-6 space-y-4">
      <div className="flex items-start gap-3">
        <span className="sf-icon-badge mt-0.5">
          <Smartphone size={18} strokeWidth={2} />
        </span>
        <div>
          <h3 className="font-display text-sm font-bold text-[#0F172A] dark:text-white">
            Acesso no Celular & Link de Compartilhamento
          </h3>
          <p className="text-xs text-[#64748B] dark:text-slate-400 mt-1">
            Escaneie o QR Code ou envie o link abaixo para abrir o Sávio Finanças diretamente no smartphone sem perder a sincronização da sua conta.
          </p>
        </div>
      </div>
      <MobileShareContent />
    </div>
  );
};

interface MobileShareSheetProps {
  open: boolean;
  onClose: () => void;
}

export const MobileShareSheet: React.FC<MobileShareSheetProps> = ({ open, onClose }) => {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Abrir ou Compartilhar no Celular"
      subtitle="Link compatível com Android, iPhone, WhatsApp e instalação PWA"
      headerVariant="navy"
    >
      <MobileShareContent compact />
    </Sheet>
  );
};
