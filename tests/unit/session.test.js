const session = require('../../src/services/session');

describe('RAM-only Session Manager', () => {
  beforeEach(() => {
    session.wipeAllSessions();
  });

  afterAll(() => {
    session.wipeAllSessions();
  });

  test('createSession stores in RAM Map', () => {
    const s = session.createSession(null, { ctx: 'test' }, [{ role: 'user', content: 'hi' }]);
    expect(s).toHaveProperty('id');
    expect(s.messages).toHaveLength(1);
    expect(session.sessions.has(s.id)).toBe(true);
  });

  test('getSession returns session if not expired', () => {
    const s = session.createSession(null, {}, []);
    const fetched = session.getSession(s.id);
    expect(fetched).not.toBeNull();
    expect(fetched.id).toBe(s.id);
  });

  test('wipeSession removes from Map', () => {
    const s = session.createSession(null, {}, []);
    expect(session.sessions.has(s.id)).toBe(true);
    session.wipeSession(s.id);
    expect(session.sessions.has(s.id)).toBe(false);
  });

  test('wipeAllSessions clears all', () => {
    session.createSession(null, {}, []);
    session.createSession(null, {}, []);
    expect(session.sessions.size).toBe(2);
    session.wipeAllSessions();
    expect(session.sessions.size).toBe(0);
  });

  test('getSessionStats returns counts without content', () => {
    session.createSession(null, {}, [{ role: 'user', content: 'hello' }]);
    const stats = session.getSessionStats();
    expect(stats.active_sessions).toBe(1);
    expect(stats.sessions[0]).toHaveProperty('session_id');
    expect(stats.sessions[0]).toHaveProperty('age_seconds');
    expect(stats.sessions[0]).toHaveProperty('message_count');
    expect(stats.sessions[0]).not.toHaveProperty('messages');
  });
});
