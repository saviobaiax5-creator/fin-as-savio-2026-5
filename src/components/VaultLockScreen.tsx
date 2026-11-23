import React, { useState } from 'react';
import { Lock, ShieldCheck, AlertCircle } from 'lucide-react';
import { verifyAndUnlockVault } from '../core/security/secureVault';

interface VaultLockScreenProps {
  onUnlocked: (key: CryptoKey, decryptedDatasetJson?: string) => void;
}

export const VaultLockScreen: React.FC<VaultLockScreenProps> = ({ onUnlocked }) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (pin.trim().length < 4) {
      setError('Digite seu PIN de pelo menos 4 caracteres.');
      return;
    }

    setChecking(true);
    try {
      const res = await verifyAndUnlockVault(pin);
      if (!res.ok || !res.key) {
        setError(res.error || 'PIN incorreto.');
        return;
      }
      setPin('');
      onUnlocked(res.key, res.decryptedDatasetJson);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="min-h-dvh bg-[#061E3E] flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-2xl p-6 shadow-2xl space-y-5">
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-[#ECFDF5] dark:bg-emerald-950/60 text-[#059669] dark:text-[#10B981] grid place-items-center">
            <Lock className="w-7 h-7" />
          </div>
          <h1 className="font-display text-xl font-extrabold text-[#0F172A] dark:text-white">
            Sávio Finanças Protegido
          </h1>
          <p className="text-xs text-[#64748B] dark:text-slate-400">
            Digite seu PIN para descriptografar o cofre local e acessar seus saldos.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs font-semibold flex items-center gap-2">
              <AlertCircle size={15} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label
              htmlFor="vault-pin-input"
              className="block text-xs font-semibold text-[#64748B] dark:text-slate-400 mb-1"
            >
              PIN de Segurança
            </label>
            <input
              id="vault-pin-input"
              type="password"
              inputMode="numeric"
              autoFocus
              required
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="••••"
              className="w-full text-center tracking-[0.4em] text-lg font-extrabold border border-[#E2E8F0] dark:border-slate-700 rounded-xl px-4 py-3 bg-[#F8FAFC] dark:bg-slate-800 text-[#0F172A] dark:text-white min-h-12 outline-none focus:border-[#059669]"
            />
          </div>

          <button
            type="submit"
            disabled={checking}
            className="w-full min-h-12 bg-[#061E3E] hover:bg-[#0F172A] dark:bg-[#059669] dark:hover:bg-emerald-700 disabled:opacity-60 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 cursor-pointer"
          >
            <ShieldCheck size={17} />
            {checking ? 'Verificando chave...' : 'Desbloquear cofre'}
          </button>
        </form>
      </div>
    </div>
  );
};
