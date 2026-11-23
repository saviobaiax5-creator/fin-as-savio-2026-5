import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ALL_INSTITUTION_CATALOG,
  BANKS_REPOSITORY,
  INSTITUICOES_FINANCEIRAS,
  banksRepository,
  clearBrasilApiBankCache,
  detectBankFromStatement,
  detectBankFromStatementAsync,
  findBankVisualBranding,
  lookupBankByCodeWithBrasilApi,
} from '../banksRepository';
import { formatCurrency } from '../../../utils/formatters';

function installMemoryLocalStorage() {
  const store = new Map<string, string>();
  const mockStorage: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
  vi.stubGlobal('localStorage', mockStorage);
  return store;
}

describe('banksRepository, INSTITUICOES_FINANCEIRAS, detectBankFromStatement & formatCurrency', () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    clearBrasilApiBankCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('contains all required traditional banks plus expanded digital banks, wallets and cooperatives', () => {
    expect(banksRepository).toBe(BANKS_REPOSITORY);
    expect(BANKS_REPOSITORY.length).toBeGreaterThanOrEqual(44);

    const fisicos = BANKS_REPOSITORY.filter((b) => b.tipo === 'fisico');
    const digitais = BANKS_REPOSITORY.filter((b) => b.tipo === 'digital');
    expect(fisicos.length).toBeGreaterThanOrEqual(20);
    expect(digitais.length).toBeGreaterThanOrEqual(24);

    const expectedFisicosAndCoops = [
      '001', '104', '237', '341', '033', '422', '748', '756', '041', '070', '004', '003',
      '133', '136', '085', '084', '097', '098', '322',
    ];
    const expectedDigitaisAndWallets = [
      '260', '077', '336', '290', '323', '380', '212', '655', '208', '102', '403', '197', '280',
      '301', '735', '637', '623', '218', '350', '364',
    ];

    for (const code of expectedFisicosAndCoops) {
      const bank = fisicos.find((b) => b.codigo === code);
      expect(bank, `missing physical/cooperative bank ${code}`).toBeDefined();
      expect(bank!.ispb).toMatch(/^\d{8}$/);
      expect(bank!.nome.length).toBeGreaterThan(1);
      expect(bank!.aliases.length).toBeGreaterThan(0);
    }

    for (const code of expectedDigitaisAndWallets) {
      const bank = digitais.find((b) => b.codigo === code);
      expect(bank, `missing digital bank/wallet ${code}`).toBeDefined();
      expect(bank!.ispb).toMatch(/^\d{8}$/);
      expect(bank!.nome.length).toBeGreaterThan(1);
      expect(bank!.aliases.length).toBeGreaterThan(0);
    }
  });

  it('exports all 30 INSTITUICOES_FINANCEIRAS (20 Digital/Wallets + 10 Cooperatives) with offline siglas and colors', () => {
    expect(INSTITUICOES_FINANCEIRAS).toHaveLength(30);
    const digitais = INSTITUICOES_FINANCEIRAS.filter((i) => i.grupo === 'Digital');
    const cooperativas = INSTITUICOES_FINANCEIRAS.filter((i) => i.grupo === 'Cooperativa');
    expect(digitais).toHaveLength(20);
    expect(cooperativas).toHaveLength(10);

    for (const inst of INSTITUICOES_FINANCEIRAS) {
      expect(inst.sigla).toMatch(/^[A-Z0-9]{2}$/);
      expect(inst.cor).toMatch(/^#[0-9A-F]{6}$/i);
      expect(inst.texto).toMatch(/^#[0-9A-F]{6}$/i);
      expect(inst.codigo).toMatch(/^\d{3}$/);
    }

    expect(ALL_INSTITUTION_CATALOG.length).toBeGreaterThanOrEqual(44);

    expect(findBankVisualBranding('99Pay')).toMatchObject({
      sigla: '99',
      cor: '#FFCC00',
      texto: '#1E293B',
      codigo: '301',
    });
    expect(findBankVisualBranding('Sicredi')).toMatchObject({
      sigla: 'SI',
      cor: '#3FA110',
      texto: '#FFFFFF',
      codigo: '748',
    });
    expect(findBankVisualBranding('Cresol')).toMatchObject({
      sigla: 'CR',
      cor: '#F37021',
      texto: '#FFFFFF',
      codigo: '133',
    });
    expect(findBankVisualBranding('Banco do Brasil')).toMatchObject({
      sigla: 'BB',
      cor: '#FFEF00',
      texto: '#003DA5',
      codigo: '001',
    });
    expect(findBankVisualBranding('Cooperativa Alpha Regional')).toMatchObject({
      sigla: 'CA',
      cor: '#061E3E',
      texto: '#FFFFFF',
    });
  });

  it('detects bank via OFX <BANKID> and <ORG> tags including sub-brands like iti Itaú and Next', () => {
    const nubankOfx = `<OFX>
<SIGNONMSGSRSV1><SONRS><FI><ORG>NU PAGAMENTOS S.A.</ORG><FID>260</FID></FI></SONRS></SIGNONMSGSRSV1>
<BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKACCTFROM><BANKID>0260</BANKID><ACCTID>123456</ACCTID></BANKACCTFROM></STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>`;

    const nuResult = detectBankFromStatement(nubankOfx, 'extrato.ofx');
    expect(nuResult.code).toBe('260');
    expect(nuResult.ispb).toBe('18236120');
    expect(nuResult.name).toBe('Nubank');
    expect(nuResult.type).toBe('digital');
    expect(nuResult.confidence).toBe('alta');

    const itauOfx = `<OFX>
<SIGNONMSGSRSV1><SONRS><FI><ORG>ITAU UNIBANCO</ORG></FI></SONRS></SIGNONMSGSRSV1>
<BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKACCTFROM><BANKID>0341</BANKID><ACCTID>998877</ACCTID></BANKACCTFROM></STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>`;

    const itauResult = detectBankFromStatement(itauOfx, 'itau_nov.ofx');
    expect(itauResult.code).toBe('341');
    expect(itauResult.ispb).toBe('60701190');
    expect(itauResult.name).toBe('Itaú Unibanco');
    expect(itauResult.type).toBe('fisico');
    expect(itauResult.confidence).toBe('alta');

    const itiOfx = `<OFX>
<SIGNONMSGSRSV1><SONRS><FI><ORG>ITI ITAU PAGAMENTOS</ORG></FI></SONRS></SIGNONMSGSRSV1>
<BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKACCTFROM><BANKID>0341</BANKID><ACCTID>112233</ACCTID></BANKACCTFROM></STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>`;
    expect(detectBankFromStatement(itiOfx, 'iti.ofx')).toMatchObject({
      code: '341',
      name: 'iti Itaú',
      type: 'digital',
      confidence: 'alta',
    });

    const nextOfx = `<OFX>
<SIGNONMSGSRSV1><SONRS><FI><ORG>BANCO NEXT</ORG></FI></SONRS></SIGNONMSGSRSV1>
<BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKACCTFROM><BANKID>0237</BANKID><ACCTID>445566</ACCTID></BANKACCTFROM></STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>`;
    expect(detectBankFromStatement(nextOfx, 'next.ofx')).toMatchObject({
      code: '237',
      name: 'Next',
      type: 'digital',
      confidence: 'alta',
    });
  });

  it('detects newly added wallets, digital banks, global accounts and cooperatives without false positives', () => {
    const samples: Array<{ content: string; fileName: string; expectedName: string; expectedCode: string; expectedType: 'fisico' | 'digital' }> = [
      { content: '99Pay Instituicao de Pagamento\nData;Valor', fileName: '99pay.csv', expectedName: '99Pay', expectedCode: '301', expectedType: 'digital' },
      { content: 'Banco Sofisa Direto S.A.\nData;Valor', fileName: 'sofisa.csv', expectedName: 'Sofisa Direto', expectedCode: '637', expectedType: 'digital' },
      { content: 'Banco PAN S.A.\nData;Valor', fileName: 'pan.csv', expectedName: 'Banco PAN', expectedCode: '623', expectedType: 'digital' },
      { content: 'Banco BS2 Empresas\nData;Valor', fileName: 'bs2.csv', expectedName: 'Banco BS2', expectedCode: '218', expectedType: 'digital' },
      { content: 'RecargaPay Carteira\nData;Valor', fileName: 'recargapay.csv', expectedName: 'RecargaPay', expectedCode: '350', expectedType: 'digital' },
      { content: 'Ame Digital Extrato\nData;Valor', fileName: 'ame.csv', expectedName: 'Ame Digital', expectedCode: '364', expectedType: 'digital' },
      { content: 'Nomad Global Account USD\nDate,Amount', fileName: 'nomad.csv', expectedName: 'Nomad', expectedCode: '000', expectedType: 'digital' },
      { content: 'Wise Payments TransferWise\nDate,Amount', fileName: 'wise.csv', expectedName: 'Wise', expectedCode: '000', expectedType: 'digital' },
      { content: 'Cooperativa Cresol Extrato\nData;Valor', fileName: 'cresol.csv', expectedName: 'Cresol', expectedCode: '133', expectedType: 'fisico' },
      { content: 'Unicred Cooperativa\nData;Valor', fileName: 'unicred.csv', expectedName: 'Unicred', expectedCode: '136', expectedType: 'fisico' },
      { content: 'Viacredi / Ailos Cooperativa\nData;Valor', fileName: 'ailos.csv', expectedName: 'Ailos / Viacredi', expectedCode: '085', expectedType: 'fisico' },
      { content: 'CrediSIS Extrato\nData;Valor', fileName: 'credisis.csv', expectedName: 'CrediSIS', expectedCode: '097', expectedType: 'fisico' },
      { content: 'Credicoamo Credito Rural\nData;Valor', fileName: 'credicoamo.csv', expectedName: 'Credicoamo', expectedCode: '098', expectedType: 'fisico' },
      { content: 'Cooperativa Sulcredi\nData;Valor', fileName: 'sulcredi.csv', expectedName: 'Sulcredi', expectedCode: '322', expectedType: 'fisico' },
    ];

    for (const sample of samples) {
      expect(detectBankFromStatement(sample.content, sample.fileName)).toMatchObject({
        code: sample.expectedCode,
        name: sample.expectedName,
        type: sample.expectedType,
      });
    }

    const nuCsv = 'Nu Pagamentos S.A.\nData;Descrição;Valor\n2026-11-10;Mercado;-120,50';
    expect(detectBankFromStatement(nuCsv, 'lancamentos.csv')).toMatchObject({
      code: '260',
      name: 'Nubank',
      type: 'digital',
      confidence: 'alta',
    });

    const bbText = 'EXTRATO CONTA CORRENTE - BB S.A.\nData;Historico;Valor';
    expect(detectBankFromStatement(bbText, 'movimento.csv')).toMatchObject({
      code: '001',
      name: 'Banco do Brasil',
      type: 'fisico',
      confidence: 'alta',
    });

    const interText = 'Banco Intermedium S/A - Extrato\n01/11/2026;PIX;-50,00';
    expect(detectBankFromStatement(interText, 'extrato.pdf')).toMatchObject({
      code: '077',
      name: 'Banco Inter',
      type: 'digital',
      confidence: 'alta',
    });

    const itaucardByFilename = 'Data,Lancamento,Valor\n2026-11-05,Supermercado,-210.00';
    expect(detectBankFromStatement(itaucardByFilename, 'Fatura_Itaucard_Nov2026.xlsx')).toMatchObject({
      code: '341',
      name: 'Itaú Unibanco',
      type: 'fisico',
      confidence: 'media',
    });

    // Word-boundary safety: "ambiente" / "basalto" / "cefalosporina" / "coracao" / "panela" / "amendoim" must NOT false-match short aliases
    const unrelatedCsv = 'Data;Descricao;Valor\n2026-11-05;Ambiente basalto cefalosporina coracao panela amendoim;-99,00';
    const unknownRes = detectBankFromStatement(unrelatedCsv, 'ambiente_pessoal.csv');
    expect(unknownRes.type).toBe('desconhecido');
    expect(unknownRes.confidence).toBe('baixa');
    expect(unknownRes.name).toBeUndefined();
  });

  it('uses BrasilAPI fallback with localStorage cache when COMPE code is not in static repository', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ispb: '28195667',
        name: 'BANCO ABC BRASIL S.A.',
        code: 246,
        fullName: 'BANCO ABC BRASIL S.A.',
      }),
    })) as unknown as typeof fetch;

    const customOfx = `<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKACCTFROM><BANKID>0246</BANKID></BANKACCTFROM></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

    const first = await detectBankFromStatementAsync(customOfx, 'custom.ofx', fetchMock);
    expect(first).toMatchObject({
      code: '246',
      ispb: '28195667',
      name: 'BANCO ABC BRASIL S.A.',
      type: 'fisico',
      confidence: 'alta',
      matchedBy: 'BRASIL_API',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const rawCached = localStorage.getItem('savio_financas_brasilapi_cache_v1');
    expect(rawCached).toContain('246');

    const second = await lookupBankByCodeWithBrasilApi('246', fetchMock);
    expect(second?.nome).toBe('BANCO ABC BRASIL S.A.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('formats currency with privacy dots, blur mode, and standard BRL output', () => {
    expect(formatCurrency(1234.56, false)).toContain('1.234,56');
    expect(formatCurrency(1234.56, false)).toContain('R$');

    expect(formatCurrency(1234.56, true)).toBe('R$ •••••');
    expect(formatCurrency(1234.56, true, { maskStyle: 'dots' })).toBe('R$ •••••');
    expect(formatCurrency(1234.56, true, { maskStyle: 'dots', currency: 'USD' })).toBe('USD •••••');

    const blurText = formatCurrency(1234.56, true, { maskStyle: 'blur' });
    expect(blurText).toContain('1.234,56');
    expect(blurText).toContain('R$');
  });
});
