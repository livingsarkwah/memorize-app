import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../../../src/infrastructure';

describe('sha256Hex', () => {
  it('matches a known SHA-256 vector', async () => {
    // sha256("abc")
    expect(await sha256Hex(new TextEncoder().encode('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('is deterministic and sensitive to every byte', async () => {
    const a = await sha256Hex(new TextEncoder().encode('hello'));
    const b = await sha256Hex(new TextEncoder().encode('hello'));
    const c = await sha256Hex(new TextEncoder().encode('hellp'));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});
