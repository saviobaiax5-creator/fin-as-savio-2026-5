import React, { useState, useEffect } from 'react';
import { Transaction, Boleto } from '../types';
import { FullBackupPayload } from '../utils/backup';
import {
  signInWithGoogleWorkspace,
  getWorkspaceAccessToken,
  exportToGoogleSheets,
  syncBoletoToCalendar,
  backupToGoogleDrive,
} from '../services/googleWorkspace';
import { FileSpreadsheet, Calendar, HardDrive, CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react';
import { Sheet } from './Sheet';

interface GoogleWorkspacePanelProps {
  transactions: Transaction[];
  boletos: Boleto[];
  fullBackup: FullBackupPayload;
}

export const GoogleWorkspacePanel: React.FC<GoogleWorkspacePanelProps> = ({
  transactions,
  boletos,
  fullBackup,
}) => {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [sheetUrl, setSheetUrl] = useState<string | null>(null);
  const [pendingCalendarBoleto, setPendingCalendarBoleto] = useState<Boleto | null>(null);

  useEffect(() => {
    const activeToken = getWorkspaceAccessToken();
    if (activeToken) {
      setToken(activeToken);
    }
  }, []);

  const handleLogin = async () => {
    setLoading(true);
    setStatusMessage('');
    setErrorMessage('');
    try {
      const res = await signInWithGoogleWorkspace();
      setToken(res.accessToken);
      setStatusMessage('Autenticado com sucesso no Google Workspace!');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      setErrorMessage(`Erro na autenticação com Google Workspace: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const handleExportSheets = async () => {
    if (!token) {
      setErrorMessage('Faça login com Google Workspace primeiro.');
      return;
    }
    setLoading(true);
    setErrorMessage('');
    setSheetUrl(null);
    try {
      const url = await exportToGoogleSheets(token, transactions);
      setSheetUrl(url);
      setStatusMessage('Planilha criada com sucesso no Google Sheets (protegida contra injeção de fórmulas).');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha na exportação.';
      setErrorMessage(`Erro ao exportar para o Google Sheets: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const requestSyncCalendar = (boleto: Boleto) => {
    if (!token) {
      setErrorMessage('Faça login com Google Workspace primeiro.');
      return;
    }
    setPendingCalendarBoleto(boleto);
  };

  const confirmSyncCalendar = async () => {
    if (!token || !pendingCalendarBoleto) return;
    const boleto = pendingCalendarBoleto;
    setPendingCalendarBoleto(null);
    setLoading(true);
    setErrorMessage('');
    try {
      await syncBoletoToCalendar(token, boleto);
      setStatusMessage(`Vencimento de ${boleto.beneficiario} adicionado ao Google Calendar!`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao sincronizar.';
      setErrorMessage(`Erro ao sincronizar com Google Calendar: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDriveBackup = async () => {
    if (!token) {
      setErrorMessage('Faça login com Google Workspace primeiro.');
      return;
    }
    setLoading(true);
    setErrorMessage('');
    try {
      await backupToGoogleDrive(token, fullBackup);
      setStatusMessage('Backup completo salvo com sucesso no Google Drive!');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha no backup.';
      setErrorMessage(`Erro ao salvar backup no Google Drive: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="sf-card p-5 sm:p-6 space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 rounded-md text-[10px] font-bold">
              GOOGLE WORKSPACE
            </span>
            <h3 className="font-display text-base sm:text-lg font-extrabold text-[#0F172A] dark:text-white">
              Integração Drive, Sheets & Calendar
            </h3>
          </div>
          <p className="text-xs sm:text-sm text-[#64748B] dark:text-slate-400">
            Exporte planilhas seguras, agende vencimentos de dia inteiro no calendário e salve backups no Drive.
          </p>
        </div>

        {!token ? (
          <button
            type="button"
            onClick={handleLogin}
            disabled={loading}
            className="bg-white dark:bg-slate-800 border border-[#E2E8F0] dark:border-slate-700 hover:border-[#CBD5E1] hover:bg-[#F8FAFC] dark:hover:bg-slate-700 text-[#0F172A] dark:text-white px-4 min-h-11 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-3 transition-all cursor-pointer"
          >
            <span>Conectar com Google Workspace</span>
          </button>
        ) : (
          <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 px-4 py-2 rounded-xl text-xs text-emerald-800 dark:text-emerald-300">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Conectado ao Google Workspace</span>
          </div>
        )}
      </div>

      {statusMessage && (
        <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs sm:text-sm font-semibold text-emerald-800 dark:text-emerald-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{statusMessage}</span>
          </div>
          {sheetUrl && (
            <a
              href={sheetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300 underline font-bold"
            >
              Abrir planilha <ExternalLink size={14} />
            </a>
          )}
        </div>
      )}

      {errorMessage && (
        <div className="p-3.5 bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 rounded-xl text-xs sm:text-sm font-semibold text-red-700 dark:text-red-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {token && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
          <div className="bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 p-4 rounded-2xl flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-white text-xs mb-1">
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" /> Google Sheets
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Exportar lançamentos para planilha do Google Sheets.
              </p>
            </div>
            <button
              type="button"
              onClick={handleExportSheets}
              disabled={loading}
              className="w-full min-h-11 bg-[#061E3E] hover:bg-[#0F172A] dark:bg-[#059669] dark:hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              Exportar para Sheets
            </button>
          </div>

          <div className="bg-[#F8FAFC] dark:bg-slate-800/80 border border-[#E2E8F0] dark:border-slate-700 p-4 rounded-2xl flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center gap-2 font-bold text-[#0F172A] dark:text-white text-xs mb-1">
                <HardDrive className="w-4 h-4 text-blue-600" /> Google Drive
              </div>
              <p className="text-[11px] text-[#64748B] dark:text-slate-400">
                Salvar backup JSON na pasta da sua conta Google Drive.
              </p>
            </div>
            <button
              type="button"
              onClick={handleDriveBackup}
              disabled={loading}
              className="w-full min-h-11 bg-[#061E3E] hover:bg-[#0F172A] dark:bg-[#059669] dark:hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              Fazer Backup no Drive
            </button>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 p-4 rounded-2xl flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-white text-xs mb-1">
                <Calendar className="w-4 h-4 text-amber-600" /> Google Calendar
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Agendar vencimentos de boletos pendentes.
              </p>
            </div>
            <div className="space-y-1.5 max-h-28 overflow-y-auto">
              {boletos.filter((b) => b.status === 'PENDING').slice(0, 3).map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => requestSyncCalendar(b)}
                  className="w-full text-left px-2.5 min-h-9 bg-white dark:bg-slate-900 hover:bg-amber-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg text-[11px] truncate text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  Agendar: {b.beneficiario} ({b.vencimento})
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <Sheet
        open={Boolean(pendingCalendarBoleto)}
        onClose={() => setPendingCalendarBoleto(null)}
        title="Agendar no Google Calendar"
        subtitle={pendingCalendarBoleto?.beneficiario}
      >
        {pendingCalendarBoleto && (
          <div className="space-y-4">
            <p className="text-sm text-slate-700 dark:text-slate-200">
              Deseja criar um lembrete de vencimento para <strong>{pendingCalendarBoleto.beneficiario}</strong> na data{' '}
              <strong>{pendingCalendarBoleto.vencimento.split('-').reverse().join('/')}</strong>?
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setPendingCalendarBoleto(null)}
                className="flex-1 min-h-12 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmSyncCalendar}
                className="flex-[1.5] min-h-12 bg-[#061E3E] hover:bg-[#0F172A] dark:bg-[#059669] dark:hover:bg-emerald-700 text-white rounded-xl text-sm font-bold cursor-pointer"
              >
                Confirmar agendamento
              </button>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
};
