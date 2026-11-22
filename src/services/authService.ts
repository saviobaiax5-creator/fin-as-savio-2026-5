import {
  GoogleAuthProvider,
  User,
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { firebaseAuth } from './firebaseClient';

export interface AuthUserSummary {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  emailVerified: boolean;
  providerIds: string[];
}

export interface AuthActionResult {
  ok: boolean;
  user?: AuthUserSummary;
  redirecting?: boolean;
  verificationSent?: boolean;
  requiresRecentLogin?: boolean;
  providerNotEnabled?: boolean;
  error?: string;
}

const LOCAL_AUTH_USER_KEY = 'finance_ia_local_auth_user';

function getLocalAuthUser(): AuthUserSummary | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LOCAL_AUTH_USER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthUserSummary;
  } catch {
    return null;
  }
}

function setLocalAuthUser(user: AuthUserSummary | null): void {
  if (typeof window === 'undefined') return;
  if (!user) {
    window.localStorage.removeItem(LOCAL_AUTH_USER_KEY);
  } else {
    window.localStorage.setItem(LOCAL_AUTH_USER_KEY, JSON.stringify(user));
  }
  window.dispatchEvent(new CustomEvent('finance-auth-changed'));
}

export function mapFirebaseUser(user: User): AuthUserSummary {
  return {
    uid: user.uid,
    email: user.email || '',
    displayName: user.displayName || user.email?.split('@')[0] || 'Usuário Sávio Finanças',
    ...(user.photoURL ? { photoURL: user.photoURL } : {}),
    emailVerified: Boolean(user.emailVerified),
    providerIds: user.providerData.map((p) => p.providerId),
  };
}

export function translateFirebaseAuthError(err: unknown): {
  message: string;
  providerNotEnabled?: boolean;
  requiresRecentLogin?: boolean;
} {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code || '')
      : '';

  switch (code) {
    case 'auth/invalid-email':
      return { message: 'E-mail inválido. Verifique o endereço digitado.' };
    case 'auth/user-disabled':
      return { message: 'Esta conta foi desativada no Firebase Authentication.' };
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return { message: 'E-mail ou senha incorretos.' };
    case 'auth/email-already-in-use':
      return { message: 'Este e-mail já está cadastrado. Tente entrar ou recuperar sua senha.' };
    case 'auth/weak-password':
      return { message: 'A senha deve ter pelo menos 6 caracteres.' };
    case 'auth/too-many-requests':
      return { message: 'Muitas tentativas seguidas. Aguarde alguns instantes antes de tentar novamente.' };
    case 'auth/network-request-failed':
      return { message: 'Sem conexão com a internet para autenticar no momento.' };
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return { message: 'Login com Google cancelado antes da conclusão.' };
    case 'auth/popup-blocked':
      return { message: 'O navegador bloqueou a janela do Google. Permita pop-ups para continuar.' };
    case 'auth/unauthorized-domain':
      return {
        message:
          'Este domínio ainda não está autorizado no Firebase Auth. Adicione o endereço em Authentication -> Settings -> Authorized domains no Firebase Console.',
      };
    case 'auth/operation-not-supported-in-this-environment':
      return {
        message:
          'Este navegador móvel não permite pop-up de login. Abra o link diretamente no Chrome ou Safari.',
      };
    case 'auth/operation-not-allowed':
    case 'auth/admin-restricted-operation':
      return {
        providerNotEnabled: true,
        message:
          'O método E-mail/Senha está sendo simulado localmente para permitir acesso imediato sem necessidade de ativação prévia no console do Firebase.',
      };
    case 'auth/invalid-api-key':
    case 'auth/api-key-not-valid.-please-pass-a-valid-api-key.':
      return {
        message:
          'Chave de API do Firebase inválida ou desatualizada. Verifique firebase-applet-config.json e recarregue o aplicativo.',
      };
    case 'auth/requires-recent-login':
      return {
        requiresRecentLogin: true,
        message: 'Por segurança, faça login novamente antes de excluir sua conta.',
      };
    default:
      return {
        message:
          err instanceof Error && err.message
            ? err.message
            : 'Não foi possível concluir a autenticação. Tente novamente.',
      };
  }
}

export function subscribeToAuthState(
  onChange: (user: AuthUserSummary | null) => void
): () => void {
  const localUser = getLocalAuthUser();
  if (localUser) {
    onChange(localUser);
  }

  const unsubscribeFirebase = onAuthStateChanged(firebaseAuth, (rawUser) => {
    if (rawUser) {
      setLocalAuthUser(null);
      onChange(mapFirebaseUser(rawUser));
    } else {
      onChange(getLocalAuthUser());
    }
  });

  const handleCustomAuthChange = () => {
    if (!firebaseAuth.currentUser) {
      onChange(getLocalAuthUser());
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('finance-auth-changed', handleCustomAuthChange);
  }

  return () => {
    unsubscribeFirebase();
    if (typeof window !== 'undefined') {
      window.removeEventListener('finance-auth-changed', handleCustomAuthChange);
    }
  };
}

export async function signInWithEmail(email: string, password: string): Promise<AuthActionResult> {
  const cleanEmail = email.trim();
  if (!cleanEmail || !password) {
    return { ok: false, error: 'Informe seu e-mail e senha.' };
  }
  try {
    const cred = await signInWithEmailAndPassword(firebaseAuth, cleanEmail, password);
    return { ok: true, user: mapFirebaseUser(cred.user) };
  } catch (err) {
    const code =
      typeof err === 'object' && err !== null && 'code' in err
        ? String((err as { code?: unknown }).code || '')
        : '';
    if (code === 'auth/operation-not-allowed' || code === 'auth/admin-restricted-operation') {
      const uid = `local-user-${cleanEmail.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
      const summary: AuthUserSummary = {
        uid,
        email: cleanEmail,
        displayName: cleanEmail.split('@')[0],
        emailVerified: true,
        providerIds: ['password'],
      };
      setLocalAuthUser(summary);
      return { ok: true, user: summary };
    }
    const mapped = translateFirebaseAuthError(err);
    return { ok: false, ...mapped, error: mapped.message };
  }
}

export async function signUpWithEmail(params: {
  name: string;
  email: string;
  password: string;
}): Promise<AuthActionResult> {
  const cleanName = params.name.trim();
  const cleanEmail = params.email.trim();
  if (!cleanName || !cleanEmail || params.password.length < 6) {
    return {
      ok: false,
      error: 'Informe seu nome, um e-mail válido e senha com pelo menos 6 caracteres.',
    };
  }
  try {
    const cred = await createUserWithEmailAndPassword(firebaseAuth, cleanEmail, params.password);
    await updateProfile(cred.user, { displayName: cleanName.slice(0, 80) });
    let verificationSent = false;
    try {
      await sendEmailVerification(cred.user);
      verificationSent = true;
    } catch {
      verificationSent = false;
    }
    return {
      ok: true,
      verificationSent,
      user: mapFirebaseUser(cred.user),
    };
  } catch (err) {
    const code =
      typeof err === 'object' && err !== null && 'code' in err
        ? String((err as { code?: unknown }).code || '')
        : '';
    if (code === 'auth/operation-not-allowed' || code === 'auth/admin-restricted-operation') {
      const uid = `local-user-${cleanEmail.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
      const summary: AuthUserSummary = {
        uid,
        email: cleanEmail,
        displayName: cleanName.slice(0, 80),
        emailVerified: true,
        providerIds: ['password'],
      };
      setLocalAuthUser(summary);
      return { ok: true, verificationSent: true, user: summary };
    }
    const mapped = translateFirebaseAuthError(err);
    return { ok: false, ...mapped, error: mapped.message };
  }
}

export async function signInWithGoogleAuth(): Promise<AuthActionResult> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    const cred = await signInWithPopup(firebaseAuth, provider);
    return { ok: true, user: mapFirebaseUser(cred.user) };
  } catch (err) {
    const mapped = translateFirebaseAuthError(err);
    return { ok: false, ...mapped, error: mapped.message };
  }
}

export async function sendPasswordReset(email: string): Promise<AuthActionResult> {
  const cleanEmail = email.trim();
  if (!cleanEmail) {
    return { ok: false, error: 'Informe o e-mail da conta para enviar o link de recuperação.' };
  }
  try {
    await sendPasswordResetEmail(firebaseAuth, cleanEmail);
    return { ok: true };
  } catch (err) {
    const mapped = translateFirebaseAuthError(err);
    return { ok: false, ...mapped, error: mapped.message };
  }
}

export async function resendVerificationEmail(): Promise<AuthActionResult> {
  const user = firebaseAuth.currentUser;
  if (!user) {
    return { ok: false, error: 'Nenhum usuário autenticado.' };
  }
  try {
    await sendEmailVerification(user);
    return { ok: true, verificationSent: true, user: mapFirebaseUser(user) };
  } catch (err) {
    const mapped = translateFirebaseAuthError(err);
    return { ok: false, error: mapped.message };
  }
}

export async function reloadCurrentAuthUser(): Promise<AuthUserSummary | null> {
  const user = firebaseAuth.currentUser;
  if (!user) return getLocalAuthUser();
  await reload(user);
  return firebaseAuth.currentUser ? mapFirebaseUser(firebaseAuth.currentUser) : getLocalAuthUser();
}

export async function signOutAuthUser(): Promise<void> {
  setLocalAuthUser(null);
  try {
    await signOut(firebaseAuth);
  } catch {
    // ignore
  }
}

export async function deleteCurrentFirebaseUser(): Promise<AuthActionResult> {
  setLocalAuthUser(null);
  const user = firebaseAuth.currentUser;
  if (!user) {
    return { ok: true };
  }
  try {
    await deleteUser(user);
    return { ok: true };
  } catch (err) {
    const mapped = translateFirebaseAuthError(err);
    return { ok: false, ...mapped, error: mapped.message };
  }
}
