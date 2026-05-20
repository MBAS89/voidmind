const crypto = require('../../src/utils/crypto');

describe('Crypto utilities', () => {
  test('generateApiKey returns key and hash', () => {
    const { key, hash } = crypto.generateApiKey();
    expect(key).toMatch(/^vm_/);
    expect(hash).toHaveLength(64); // sha256 hex
  });

  test('hashApiKey is deterministic', () => {
    const key = 'vm_testkey123';
    const h1 = crypto.hashApiKey(key);
    const h2 = crypto.hashApiKey(key);
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  test('generateId includes prefix', () => {
    const id = crypto.generateId('test_');
    expect(id.startsWith('test_')).toBe(true);
    expect(id.length).toBeGreaterThan(10);
  });

  test('generateSessionId returns UUID format', () => {
    const sid = crypto.generateSessionId();
    expect(sid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });
});
