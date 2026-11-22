import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import { firebaseAuth } from './firebaseClient';
import { sanitizeCellForSheet } from '../utils/sheetGuard';
import { todayLocal, todayDisplayPtBr, addDaysLocal } from '../utils/dateLocal';

const auth = firebaseAuth;

const provider = new GoogleAuthProvider();
// Minimum required scopes as requested in Phase 0
provider.addScope('https://www.googleapis.com/auth/drive.file');
provider.addScope('https://www.googleapis.com/auth/calendar.events');

let cachedAccessToken: string | null = null;
let isSigningIn = false;

export const initGoogleAuth = (
  onSuccess: (user: User, token: string) => void,
  onFailure: () => void
) => {
  return onAuthStateChanged(auth, async (user) => {
    if (user && cachedAccessToken) {
      onSuccess(user, cachedAccessToken);
    } else {
      cachedAccessToken = null;
      onFailure();
    }
  });
};

export const signInWithGoogleWorkspace = async (): Promise<{ user: User; accessToken: string }> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Falha ao obter token de acesso do Google Workspace.');
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } finally {
    isSigningIn = false;
  }
};

export const getWorkspaceAccessToken = () => cachedAccessToken;

// Google Sheets Export with formula injection protection
export const exportToGoogleSheets = async (token: string, transactions: any[]) => {
  const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      properties: { title: `Sávio Finanças - Relatório ${todayDisplayPtBr()}` }
    })
  });
  if (!createRes.ok) {
    throw new Error('Falha ao criar planilha no Google Sheets');
  }
  const spreadsheet = await createRes.json();
  const spreadsheetId = spreadsheet.spreadsheetId;

  const rows = [
    ['Data', 'Descrição', 'Categoria', 'Vínculo', 'Conta', 'Direção', 'Valor (R$)'].map(sanitizeCellForSheet),
    ...transactions.map(t => [
      sanitizeCellForSheet(t.date),
      sanitizeCellForSheet(t.description),
      sanitizeCellForSheet(t.category),
      sanitizeCellForSheet(t.entityId),
      sanitizeCellForSheet(t.account),
      sanitizeCellForSheet(t.direction === 'INCOME' ? 'Receita' : 'Despesa'),
      sanitizeCellForSheet(t.amount)
    ])
  ];

  const appendRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A1:append?valueInputOption=USER_ENTERED`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      range: 'A1',
      majorDimension: 'ROWS',
      values: rows
    })
  });

  if (!appendRes.ok) {
    throw new Error('Falha ao inserir dados no Google Sheets');
  }

  return spreadsheet.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
};

// Google Calendar Event Sync with exclusive end date for all-day events and res.ok check
export const syncBoletoToCalendar = async (token: string, boleto: { beneficiario: string; valorOriginal: number; vencimento: string; descricao: string }) => {
  const exclusiveEndDate = addDaysLocal(boleto.vencimento, 1);

  const event = {
    summary: `[Sávio Finanças] Vencimento: ${boleto.beneficiario} - R$ ${boleto.valorOriginal}`,
    description: `Boleto / Conta a pagar: ${boleto.descricao}`,
    start: { date: boleto.vencimento },
    end: { date: exclusiveEndDate },
    reminders: {
      useDefault: false,
      overrides: [{ method: 'popup', minutes: 1440 }]
    }
  };

  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(event)
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error?.message || 'Falha ao sincronizar com Google Calendar');
  }
  return await res.json();
};

// Google Drive Backup with res.ok check
export const backupToGoogleDrive = async (token: string, financialData: any) => {
  const fileContent = JSON.stringify(financialData, null, 2);
  const metadata = {
    name: `Savio_Financas_Backup_${todayLocal()}.json`,
    mimeType: 'application/json'
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', new Blob([fileContent], { type: 'application/json' }));

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: form
  });

  if (!res.ok) {
    throw new Error('Falha ao enviar backup para o Google Drive');
  }
  return await res.json();
};
