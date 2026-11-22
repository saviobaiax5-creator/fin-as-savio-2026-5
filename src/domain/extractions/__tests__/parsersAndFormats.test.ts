import { describe, it, expect, vi, afterEach } from 'vitest';
import * as XLSX from 'xlsx';
import { parseOfxStatement, decodeTextBuffer } from '../parsers/ofxParser';
import { parseCsvStatement } from '../parsers/csvParser';
import { parseSpreadsheetStatement } from '../parsers/xlsxParser';
import { parseJsonStatement, parseXmlStatement } from '../parsers/structuredParser';
import { deflateSync } from 'node:zlib';
import {
  extractTextFromPdfBuffer,
  extractTextFromPdfBufferAsync,
  parseTextualPdfContent,
  requestRemoteOcrParse,
} from '../parsers/pdfAndImageParser';

function buildFlateCompressedPdf(lines: string[]): ArrayBuffer {
  const escaped = lines
    .map((line, i) => `BT /F1 10 Tf 40 ${760 - i * 16} Td (${line.replace(/[()\\]/g, '')}) Tj ET`)
    .join('\n');
  const compressed = deflateSync(Buffer.from(escaped, 'utf8'));

  const objects: Array<string | Buffer> = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    Buffer.concat([
      Buffer.from(`5 0 obj\n<< /Length ${compressed.length} /Filter /FlateDecode >>\nstream\n`, 'ascii'),
      compressed,
      Buffer.from('\nendstream\nendobj\n', 'ascii'),
    ]),
  ];

  const chunks: Buffer[] = [Buffer.from('%PDF-1.4\n', 'ascii')];
  const offsets: number[] = [];
  let cursor = chunks[0].length;
  for (const obj of objects) {
    offsets.push(cursor);
    const buf = typeof obj === 'string' ? Buffer.from(obj, 'ascii') : obj;
    chunks.push(buf);
    cursor += buf.length;
  }

  const xrefOffset = cursor;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    xref += `${String(off).padStart(10, '0')} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  chunks.push(Buffer.from(xref, 'ascii'));

  const full = Buffer.concat(chunks);
  return full.buffer.slice(full.byteOffset, full.byteOffset + full.byteLength);
}

function strToArrayBuffer(str: string): ArrayBuffer {
  return new TextEncoder().encode(str).buffer;
}

describe('Extractions Parsers — OFX, CSV, XLSX, XML, JSON, PDF & OCR', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('parses valid OFX with FITID, ACCTID, BANKID, LEDGERBAL, AVAILBAL and CURDEF', () => {
    const ofx = `OFXHEADER:100
DATA:OFXSGML
<OFX>
<SIGNONMSGSRSV1><SONRS><LANGUAGE>POR</LANGUAGE></SONRS></SIGNONMSGSRSV1>
<BANKMSGSRSV1><STMTTRNRS><STMTRS>
<CURDEF>BRL</CURDEF>
<BANKACCTFROM><BANKID>0341</BANKID><BRANCHID>1234</BRANCHID><ACCTID>56789-0</ACCTID><ACCTTYPE>CHECKING</ACCTTYPE></BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>20261101</DTSTART><DTEND>20261130</DTEND>
<STMTTRN><TRNTYPE>CREDIT</TRNTYPE><DTPOSTED>20261105120000</DTPOSTED><TRNAMT>4500.50</TRNAMT><FITID>FITID-001</FITID><MEMO>PIX RECEBIDO CLIENTE ACME</MEMO></STMTTRN>
<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20261106120000</DTPOSTED><TRNAMT>-120.75</TRNAMT><FITID>FITID-002</FITID><MEMO>TARIFA MANUTENCAO</MEMO></STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>5379.75</BALAMT><DTASOF>20261130</DTASOF></LEDGERBAL>
<AVAILBAL><BALAMT>5100.00</BALAMT><DTASOF>20261130</DTASOF></AVAILBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>`;

    const parsed = parseOfxStatement(ofx, 'itau_nov_2026.ofx');
    expect(parsed.format).toBe('OFX');
    expect(parsed.errors).toHaveLength(0);
    expect(parsed.identifiedAccount.bankCode).toBe('0341');
    expect(parsed.identifiedAccount.agency).toBe('1234');
    expect(parsed.identifiedAccount.maskedAccountNumber).toContain('9-0');
    expect(parsed.identifiedAccount.currency).toBe('BRL');
    expect(parsed.reportedEndingBalanceCents).toBe(537975);
    expect(parsed.availableBalanceCents).toBe(510000);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0].bankTransactionId).toBe('FITID-001');
    expect(parsed.rows[0].amountSignedCents).toBe(450050);
    expect(parsed.rows[1].amountSignedCents).toBe(-12075);
  });

  it('warns on incomplete OFX missing LEDGERBAL and FITID', () => {
    const incompleteOfx = `<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20261110</DTPOSTED><TRNAMT>-50.00</TRNAMT><MEMO>COMPRA SEM FITID</MEMO></STMTTRN>
</BANKTRANLIST>
</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

    const parsed = parseOfxStatement(incompleteOfx, 'incompleto.ofx');
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.warnings.length).toBeGreaterThan(0);
    expect(parsed.reportedEndingBalanceCents).toBeUndefined();
  });

  it('parses CSV with semicolon (BR decimals) and comma (US decimals), plus Windows-1252 decoding', () => {
    const csvBr = [
      'Data;Descrição;Valor;Saldo',
      '05/11/2026;PIX ENVIADO FORNECEDOR;-1.234,56;3.765,44',
      '06/11/2026;RECEBIMENTO SERVICO;2.500,00;6.265,44',
    ].join('\n');
    const resBr = parseCsvStatement(csvBr, 'extrato_br.csv');
    expect(resBr.rows).toHaveLength(2);
    expect(resBr.rows[0].date).toBe('2026-11-05');
    expect(resBr.rows[0].amountSignedCents).toBe(-123456);
    expect(resBr.rows[1].amountSignedCents).toBe(250000);

    const csvUs = [
      'Date,Description,Amount,Currency',
      '2026-11-08,APPLE.COM BILL,-19.99,USD',
      '2026-11-09,DIVIDEND AAPL,45.50,USD',
    ].join('\n');
    const resUs = parseCsvStatement(csvUs, 'avenue_us.csv');
    expect(resUs.rows).toHaveLength(2);
    expect(resUs.rows[0].currency).toBe('USD');
    expect(resUs.rows[0].amountSignedCents).toBe(-1999);
    expect(resUs.rows[1].amountSignedCents).toBe(4550);

    // Latin-1 / Windows-1252 bytes for "Café Açaí" (0xE9 = é, 0xE7 = ç, 0xED = í)
    const latinBytes = new Uint8Array([
      0x43, 0x61, 0x66, 0xe9, 0x20, 0x41, 0xe7, 0x61, 0xed,
    ]);
    const decoded = decodeTextBuffer(latinBytes.buffer);
    expect(decoded).toContain('Café Açaí');
  });

  it('parses multi-sheet XLSX dynamically and honors selected sheet without executing formulas', () => {
    const wb = XLSX.utils.book_new();
    const wsResumo = XLSX.utils.aoa_to_sheet([
      ['Resumo Mensal', 'Total'],
      ['Saldo', '1000'],
    ]);
    const wsExtrato = XLSX.utils.aoa_to_sheet([
      ['Data', 'Histórico', 'Valor'],
      ['10/11/2026', 'PIX RECEBIDO CLIENTE', '1500,00'],
      ['11/11/2026', 'BOLETO ENERGIA', '-280,40'],
    ]);
    XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo');
    XLSX.utils.book_append_sheet(wb, wsExtrato, 'Lançamentos');

    const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

    const firstPass = parseSpreadsheetStatement(out, 'planilha_multi.xlsx');
    expect(firstPass.tabularPreview?.sheetNames).toEqual(['Resumo', 'Lançamentos']);

    const secondPass = parseSpreadsheetStatement(out, 'planilha_multi.xlsx', 'Lançamentos');
    expect(secondPass.tabularPreview?.selectedSheet).toBe('Lançamentos');
    expect(secondPass.rows).toHaveLength(2);
    expect(secondPass.rows[0].amountSignedCents).toBe(150000);
    expect(secondPass.rows[1].amountSignedCents).toBe(-28040);
  });

  it('rejects XML XXE payloads and parses valid XML & JSON crypto/bank statements', () => {
    const maliciousXml = `<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><root>&xxe;</root>`;
    const xxeRes = parseXmlStatement(maliciousXml, 'evil.xml');
    expect(xxeRes.errors.length).toBeGreaterThan(0);
    expect(xxeRes.rows).toHaveLength(0);

    const validXml = `<extrato><banco>Nubank</banco><movimentacoes>
      <movimento><data>2026-11-12</data><descricao>PIX ENVIADO MERCADO</descricao><valor>-89.90</valor></movimento>
    </movimentacoes></extrato>`;
    const xmlRes = parseXmlStatement(validXml, 'nubank.xml');
    expect(xmlRes.errors).toHaveLength(0);
    expect(xmlRes.rows).toHaveLength(1);
    expect(xmlRes.rows[0].amountSignedCents).toBe(-8990);

    const jsonCrypto = JSON.stringify({
      exchange: 'Binance',
      transactions: [
        {
          date: '2026-11-14',
          description: 'Compra BTC Spot',
          amount: -2500.0,
          currency: 'BRL',
          assetSymbol: 'BTC',
          quantity: 0.00451234,
          network: 'Bitcoin',
          txHash: '0xabc123456',
        },
      ],
    });
    const jsonRes = parseJsonStatement(jsonCrypto, 'binance.json');
    expect(jsonRes.rows).toHaveLength(1);
    expect(jsonRes.rows[0].cryptoMeta?.assetSymbol).toBe('BTC');
    expect(jsonRes.rows[0].cryptoMeta?.quantity).toBeCloseTo(0.00451234, 8);
    expect(jsonRes.rows[0].cryptoMeta?.network).toBe('Bitcoin');
  });

  it('extracts textual PDF locally and deduplicates repeated page-break lines', () => {
    const fakePdfText = `(Extrato Bancario Banco do Brasil) Tj
(Saldo Anterior R$ 1.000,00) Tj
(05/11/2026 PIX RECEBIDO MARIA 500,00 C) Tj
(05/11/2026 PIX RECEBIDO MARIA 500,00 C) Tj
(06/11/2026 PAGTO BOLETO LUZ -150,00 D) Tj
(Saldo Final R$ 1.350,00) Tj`;
    const extracted = extractTextFromPdfBuffer(strToArrayBuffer(fakePdfText));
    const parsed = parseTextualPdfContent(extracted, 'bb_extrato.pdf');
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.openingBalanceCents).toBe(100000);
    expect(parsed.reportedEndingBalanceCents).toBe(135000);
  });

  it('handles legible and illegible images/scanned PDFs through explicit-consent remote OCR', async () => {
    const illegibleFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ transactions: [] }),
    }) as unknown as typeof fetch;

    const illegible = await requestRemoteOcrParse({
      fileName: 'borrado.jpg',
      mimeType: 'image/jpeg',
      base64Data: 'ZmFrZQ==',
      format: 'IMAGE',
      knownAccounts: [],
      fetcher: illegibleFetch,
    });
    expect(illegible.rows).toHaveLength(0);
    expect(illegible.warnings.length + illegible.errors.length).toBeGreaterThan(0);

    const legibleFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        transactions: [
          {
            date: '2026-11-15',
            description: 'COMPRA SUPERMERCADO EXTRA',
            amount: 215.4,
            direction: 'EXPENSE',
            operationType: 'CARTAO',
          },
        ],
      }),
    }) as unknown as typeof fetch;

    const legible = await requestRemoteOcrParse({
      fileName: 'comprovante.png',
      mimeType: 'image/png',
      base64Data: 'ZmFrZQ==',
      format: 'IMAGE',
      knownAccounts: [],
      fetcher: legibleFetch,
    });
    expect(legible.parseSource).toBe('OCR_IA');
    expect(legible.rows).toHaveLength(1);
    expect(legible.rows[0].amountSignedCents).toBe(-21540);
  });

  it('extracts compressed FlateDecode PDF locally via PDF.js and strips trailing running balance', async () => {
    const compressedPdf = buildFlateCompressedPdf([
      'Extrato Mensal Itau 11/2026',
      'Saldo Anterior R$ 2.000,00',
      '05/11 PIX ENVIADO PADARIA -42,50 1.957,50',
      '06/11 PIX RECEBIDO CLIENTE 500,00 2.457,50',
      'Saldo Final R$ 2.457,50',
    ]);

    const extracted = await extractTextFromPdfBufferAsync(compressedPdf);
    expect(extracted.engine).toBe('PDFJS');
    const parsed = parseTextualPdfContent(extracted.text, 'itau_nov_2026.pdf');
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0].date).toBe('2026-11-05');
    expect(parsed.rows[0].amountSignedCents).toBe(-4250);
    expect(parsed.rows[1].amountSignedCents).toBe(50000);
    expect(parsed.openingBalanceCents).toBe(200000);
    expect(parsed.reportedEndingBalanceCents).toBe(245750);
  });

  it('distinguishes HTML 413/504 server responses from genuine offline network errors in OCR', async () => {
    const html413Fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 413,
      text: async () => '<html><body>Payload Too Large</body></html>',
    }) as unknown as typeof fetch;

    const payloadTooLarge = await requestRemoteOcrParse({
      fileName: 'grande.pdf',
      mimeType: 'application/pdf',
      base64Data: 'ZmFrZQ==',
      format: 'PDF',
      knownAccounts: [],
      fetcher: html413Fetch,
    });
    expect(payloadTooLarge.warnings[0]).toContain('limite de tamanho');
    expect(payloadTooLarge.warnings[0]).not.toContain('Sem conexão');

    const html504Fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 504,
      text: async () => '<html><body>Gateway Timeout</body></html>',
    }) as unknown as typeof fetch;

    const gatewayTimeout = await requestRemoteOcrParse({
      fileName: 'lento.pdf',
      mimeType: 'application/pdf',
      base64Data: 'ZmFrZQ==',
      format: 'PDF',
      knownAccounts: [],
      fetcher: html504Fetch,
    });
    expect(gatewayTimeout.warnings[0]).toContain('demorou mais que o esperado');
    expect(gatewayTimeout.warnings[0]).not.toContain('Sem conexão');

    const networkErrFetch = vi
      .fn()
      .mockRejectedValue(new TypeError('Failed to fetch')) as unknown as typeof fetch;

    const netFailure = await requestRemoteOcrParse({
      fileName: 'offline.pdf',
      mimeType: 'application/pdf',
      base64Data: 'ZmFrZQ==',
      format: 'PDF',
      knownAccounts: [],
      fetcher: networkErrFetch,
    });
    expect(netFailure.warnings[0]).toContain('Sem conexão com o serviço de OCR');
  });
});
