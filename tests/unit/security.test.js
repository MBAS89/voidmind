const security = require('../../src/utils/security');

describe('Security utilities', () => {
  test('detectPII finds email', () => {
    const findings = security.detectPII('Contact me at user@example.com');
    expect(findings.some(f => f.type === 'email')).toBe(true);
  });

  test('detectPII finds phone', () => {
    const findings = security.detectPII('Call me at 555-123-4567');
    expect(findings.some(f => f.type === 'phone')).toBe(true);
  });

  test('stripPII redacts email', () => {
    const sanitized = security.stripPII('Email: user@example.com');
    expect(sanitized).not.toContain('user@example.com');
    expect(sanitized).toContain('[EMAIL_REDACTED]');
  });

  test('validateMessageSize respects limit', () => {
    expect(security.validateMessageSize('short', 100)).toBe(true);
    expect(security.validateMessageSize('x'.repeat(200), 100)).toBe(false);
  });
});
