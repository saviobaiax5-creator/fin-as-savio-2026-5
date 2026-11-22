import { describe, expect, it } from 'vitest';
import { buildDynamicPeriodOptions } from '../dateUtils';
import {
  AiTimeoutError,
  MAX_BASE64_LENGTH,
  ParseDocumentSchema,
  SlidingWindowRateLimiter,
  isOriginAllowedForAi,
  sanitizeTextInput,
  withTimeout,
} from '../../server/aiGuard';

describe('Dynamic Period Selector (P1.6)', () => {
  it('builds a sliding window around current date plus transaction and boleto months + ALL', () => {
    const now = new Date(2026, 10, 21); // 2026-11-21
    const options = buildDynamicPeriodOptions(
      [{ date: '2025-04-10' }],
      [{ vencimento: '2027-02-15' }],
      now
    );

    const values = options.map((o) => o.value);
    expect(values).toContain('2026-11'); // current month
    expect(values).toContain('2026-12'); // +1 month
    expect(values).toContain('2026-08'); // -3 months
    expect(values).toContain('2025-04'); // historical tx
    expect(values).toContain('2027-02'); // upcoming boleto
    expect(values).toContain('2026'); // year aggregate
    expect(values[values.length - 1]).toBe('ALL');
  });
});

describe('AI Security & Quota Guards (P1.5)', () => {
  it('enforces sliding window rate limits and computes retryAfterSec', () => {
    const limiter = new SlidingWindowRateLimiter(2, 60_000);
    const t0 = 1_000_000;

    expect(limiter.check('10.0.0.1', t0)).toEqual({ allowed: true, retryAfterSec: 0, remaining: 1 });
    expect(limiter.check('10.0.0.1', t0 + 1000)).toEqual({ allowed: true, retryAfterSec: 0, remaining: 0 });
    const blocked = limiter.check('10.0.0.1', t0 + 2000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBe(58);
    expect(limiter.check('10.0.0.2', t0 + 2000).allowed).toBe(true);
    expect(limiter.check('10.0.0.1', t0 + 61_000).allowed).toBe(true);
  });

  it('allows matching host/forwardedHost/localhost origins and blocks unknown third-party origins', () => {
    expect(isOriginAllowedForAi({ origin: 'https://app.example.com', host: 'app.example.com' })).toBe(true);
    expect(
      isOriginAllowedForAi({
        origin: 'https://preview.run.app',
        host: '127.0.0.1:3000',
        forwardedHost: 'preview.run.app',
      })
    ).toBe(true);
    expect(isOriginAllowedForAi({ origin: 'http://localhost:3000', host: 'localhost:3000' })).toBe(true);
    expect(isOriginAllowedForAi({ origin: 'https://evil-site.com', host: 'app.example.com' })).toBe(false);
  });

  it('strips control characters and trims text safely', () => {
    expect(sanitizeTextInput('  Pix \u0000teste\u001F  ', 20)).toBe('Pix  teste');
  });

  it('validates ParseDocumentSchema base64 limit and accepted MIME types', () => {
    const valid = ParseDocumentSchema.safeParse({
      fileData: { mimeType: 'application/pdf', base64: 'JVBERi0xLjQK' },
    });
    expect(valid.success).toBe(true);

    const invalidMime = ParseDocumentSchema.safeParse({
      fileData: { mimeType: 'application/x-msdownload', base64: 'JVBERi0xLjQK' },
    });
    expect(invalidMime.success).toBe(false);

    const oversized = ParseDocumentSchema.safeParse({
      fileData: { mimeType: 'image/png', base64: 'A'.repeat(MAX_BASE64_LENGTH + 1) },
    });
    expect(oversized.success).toBe(false);
  });

  it('rejects slow async promises with AiTimeoutError via withTimeout', async () => {
    const slow = new Promise<string>((resolve) => setTimeout(() => resolve('ok'), 200));
    await expect(withTimeout(slow, 10)).rejects.toBeInstanceOf(AiTimeoutError);
  });
});
