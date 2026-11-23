import React, { useState } from 'react';
import {
  Lock,
  Mail,
  User,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Database,
  ShieldCheck,
  RefreshCw,
  Smartphone,
} from 'lucide-react';
import {
  sendPasswordReset,
  signInWithEmail,
  signInWithGoogleAuth,
  signUpWithEmail,
} from '../../services/authService';
import { MobileShareSheet } from '../MobileSharePanel';
import SavioFinancasLogo from '../SavioFinancasLogo';

interface AuthScreenProps {
  existingLocalRecordsCount: number;
  onAuthenticated?: () => void;
  onPrepareFreshDevice?: () => { ok: boolean; error?: string } | void;
}

type AuthMode = 'login' | 'signup' | 'reset';

export const AuthScreen: React.FC<AuthScreenProps> = ({
  existingLocalRecordsCount,
  onAuthenticated,
  onPrepareFreshDevice,
}) => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');
  const [shareOpen, setShareOpen] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setInfoMsg('');

    if (mode === 'reset') {
      setBusy(true);
      try {
        const res = await sendPasswordReset(email);
        if (!res.ok) {
          setErrorMsg(res.error || 'Não foi possível enviar o e-mail de recuperação.');
          return;
        }
        setInfoMsg(
          'Enviamos um link de redefinição de senha para o seu e-mail. Verifique também a caixa de spam.'
        );
      } finally {
        setBusy(false);
      }
      return;
    }

    if (mode === 'signup') {
      if (password !== confirmPassword) {
        setErrorMsg('As senhas informadas não conferem.');
        return;
      }
      setBusy(true);
      try {
        const res = await signUpWithEmail({ name, email, password });
        if (!res.ok) {
          setErrorMsg(res.error || 'Não foi possível criar a conta.');
          return;
        }
        onAuthenticated?.();
      } finally {
        setBusy(false);
      }
      return;
    }

    setBusy(true);
    try {
      const res = await signInWithEmail(email, password);
      if (!res.ok) {
        setErrorMsg(res.error || 'Não foi possível entrar.');
        return;
      }
      onAuthenticated?.();
    } finally {
      setBusy(false);
    }
  };

  const handleGoogleLogin = async () => {
    setErrorMsg('');
    setInfoMsg('');
    setBusy(true);
    try {
      const res = await signInWithGoogleAuth();
      if (!res.ok) {
        setErrorMsg(res.error || 'Falha ao autenticar com o Google.');
        return;
      }
      onAuthenticated?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-dvh bg-[#F8FAFC] dark:bg-[#050B42] text-[#0F172A] dark:text-slate-100 flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md sf-card rounded-2xl p-6 sm:p-8 space-y-6">
        <div className="space-y-1">
          <div className="flex items-center justify-between pb-2">
            <SavioFinancasLogo size={44} subtitle />
            <span className="text-[11px] font-bold text-[#059669] dark:text-[#10B981] flex items-center gap-1">
              <ShieldCheck size={14} /> Conta Protegida
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[#64748B] dark:text-slate-400">
            {mode === 'login' &&
              'Entre para acessar seus dados financeiros com sincronização em nuvem e funcionamento offline.'}
            {mode === 'signup' &&
              'Crie sua conta individual. Novos cadastros iniciam totalmente vazios, sem dados fictícios.'}
            {mode === 'reset' &&
              'Informe seu e-mail cadastrado para receber as instruções de recuperação de senha.'}
          </p>
        </div>

        {existingLocalRecordsCount > 0 && (
          <div className="p-3.5 rounded-2xl bg-sky-50 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-800 text-xs text-sky-900 dark:text-sky-200 space-y-2">
            <div className="flex items-start gap-2.5">
              <Database size={16} className="shrink-0 mt-0.5 text-sky-600 dark:text-sky-400" />
              <div>
                <strong>{existingLocalRecordsCount} registro(s) local(is) neste dispositivo</strong>{' '}
                (de uma sessão anterior). Ao entrar em uma nova conta, você poderá escolher começar do zero ou importar.
              </div>
            </div>
            {onPrepareFreshDevice && (
              <button
                type="button"
                onClick={() => {
                  const res = onPrepareFreshDevice();
                  if (res && !res.ok && res.error) {
                    setErrorMsg(res.error);
                  } else {
                    setInfoMsg(
                      'Backup local salvo com segurança e tela zerada. Agora entre na outra conta para começar do zero.'
                    );
                  }
                }}
                className="w-full min-h-9 px-3 rounded-xl bg-white dark:bg-[#11185A] border border-sky-300 dark:border-sky-700 hover:bg-sky-100 dark:hover:bg-sky-900/40 text-sky-900 dark:text-sky-100 font-bold text-[11px] cursor-pointer"
              >
                Salvar backup local e limpar cache para começar do zero
              </button>
            )}
          </div>
        )}

        {errorMsg && (
          <div
            role="alert"
            className="p-3.5 rounded-2xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-xs font-semibold text-red-700 dark:text-red-300 flex items-start gap-2"
          >
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {infoMsg && (
          <div
            role="status"
            className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold text-emerald-800 dark:text-emerald-200 flex items-start gap-2"
          >
            <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
            <span>{infoMsg}</span>
          </div>
        )}

        <button
          type="button"
          disabled={busy}
          onClick={handleGoogleLogin}
          className="w-full min-h-12 px-4 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-[#F8FAFC] dark:hover:bg-slate-700 text-sm font-bold text-[#0F172A] dark:text-white flex items-center justify-center gap-2.5 transition-colors cursor-pointer disabled:opacity-60"
        >
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
            />
            <path
              fill="#FBBC05"
              d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
            />
            <path
              fill="#EA4335"
              d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
            />
          </svg>
          Entrar com Google (escolher conta)
        </button>

        <div className="relative flex items-center justify-center">
          <span className="h-px bg-slate-200 dark:bg-slate-800 w-full" />
          <span className="px-3 text-[11px] font-semibold text-slate-400 bg-white dark:bg-[#11185A] uppercase tracking-wider shrink-0">
            ou com e-mail
          </span>
          <span className="h-px bg-slate-200 dark:bg-slate-800 w-full" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {mode === 'signup' && (
            <div>
              <label
                htmlFor="auth-name"
                className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1"
              >
                Nome completo ou apelido
              </label>
              <div className="relative">
                <User
                  size={16}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  id="auth-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Seu nome"
                  className="w-full pl-10 pr-4 py-2.5 min-h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          )}

          <div>
            <label
              htmlFor="auth-email"
              className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1"
            >
              E-mail
            </label>
            <div className="relative">
              <Mail
                size={16}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                id="auth-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@exemplo.com"
                className="w-full pl-10 pr-4 py-2.5 min-h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {mode !== 'reset' && (
            <div>
              <label
                htmlFor="auth-password"
                className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1"
              >
                Senha
              </label>
              <div className="relative">
                <Lock
                  size={16}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  id="auth-password"
                  type="password"
                  required
                  minLength={6}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full pl-10 pr-4 py-2.5 min-h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          )}

          {mode === 'signup' && (
            <div>
              <label
                htmlFor="auth-password-confirm"
                className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1"
              >
                Confirmar senha
              </label>
              <div className="relative">
                <Lock
                  size={16}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  id="auth-password-confirm"
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repita a senha"
                  className="w-full pl-10 pr-4 py-2.5 min-h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full min-h-12 bg-[#061E3E] hover:bg-[#0F172A] dark:bg-[#059669] dark:hover:bg-emerald-700 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
          >
            {busy ? (
              <>
                <RefreshCw size={16} className="animate-spin" /> Processando...
              </>
            ) : (
              <>
                <span>
                  {mode === 'login' && 'Entrar no Sávio Finanças'}
                  {mode === 'signup' && 'Criar minha conta'}
                  {mode === 'reset' && 'Enviar link de recuperação'}
                </span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
          Dica: o login por <strong>Google</strong> já permite escolher qualquer outra conta Google imediatamente. O acesso por <strong>E-mail/Senha</strong> só funciona após ativar o provedor <em>Email/Password</em> no Firebase Console.
        </p>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
          {mode !== 'login' ? (
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setErrorMsg('');
                setInfoMsg('');
              }}
              className="font-semibold text-[#0F172A] dark:text-[#10B981] hover:underline cursor-pointer"
            >
              Já tenho conta · Entrar
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setMode('signup');
                setErrorMsg('');
                setInfoMsg('');
              }}
              className="font-semibold text-[#0F172A] dark:text-[#10B981] hover:underline cursor-pointer"
            >
              Criar nova conta
            </button>
          )}

          {mode !== 'reset' && (
            <button
              type="button"
              onClick={() => {
                setMode('reset');
                setErrorMsg('');
                setInfoMsg('');
              }}
              className="text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white cursor-pointer"
            >
              Esqueci minha senha
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => setShareOpen(true)}
          className="w-full min-h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center justify-center gap-2 cursor-pointer"
        >
          <Smartphone size={15} className="text-emerald-600" />
          Abrir no celular / Compartilhar link (QR Code)
        </button>
      </div>

      <MobileShareSheet open={shareOpen} onClose={() => setShareOpen(false)} />
    </div>
  );
};
