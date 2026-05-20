/**
 * VoidMind Compliance Tests
 * Verify that NO user conversation data persists to disk.
 */

const fs = require('fs');
const path = require('path');
const session = require('../../src/services/session');

describe('Compliance: Zero Data Persistence', () => {
  beforeEach(() => {
    session.wipeAllSessions();
  });

  afterAll(() => {
    session.wipeAllSessions();
  });

  test('sessions exist only in RAM', () => {
    const s = session.createSession(null, { user: 'anon' }, [{ role: 'user', content: 'secret message' }]);
    expect(session.sessions.has(s.id)).toBe(true);

    // Simulate wipe
    session.wipeSession(s.id);
    expect(session.sessions.has(s.id)).toBe(false);
  });

  test('session object is nullified on wipe', () => {
    const s = session.createSession(null, { ctx: 'test' }, [{ role: 'user', content: 'data' }]);
    session.wipeSession(s.id);
    // The original object reference should have been nulled
    expect(s.messages).toBeNull();
    expect(s.anonContext).toBeNull();
    expect(s.id).toBeNull();
  });

  test('no session files written to disk', () => {
    const srcDir = path.join(__dirname, '../../src');
    const dataDir = path.join(__dirname, '../../data');

    // src/ should not contain hardcoded session files
    if (fs.existsSync(srcDir)) {
      const files = fs.readdirSync(srcDir, { recursive: true });
      const sessionFiles = files.filter(f =>
        typeof f === 'string' && f.includes('session') && f.endsWith('.json')
      );
      expect(sessionFiles).toHaveLength(0);
    }

    // data/ should not exist or not contain session dumps
    if (fs.existsSync(dataDir)) {
      const dataFiles = fs.readdirSync(dataDir, { recursive: true });
      const dumpFiles = dataFiles.filter(f =>
        typeof f === 'string' && (f.includes('session') || f.includes('conversation'))
      );
      expect(dumpFiles).toHaveLength(0);
    }
  });

  test('wipeAllSessions clears everything', () => {
    for (let i = 0; i < 10; i++) {
      session.createSession(null, {}, [{ role: 'user', content: `msg ${i}` }]);
    }
    expect(session.sessions.size).toBe(10);
    const count = session.wipeAllSessions();
    expect(count).toBe(10);
    expect(session.sessions.size).toBe(0);
  });
});
