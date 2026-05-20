/**
 * VoidMind — RAM-Only Session Manager
 * Sessions exist ONLY in a JavaScript Map. No disk, no Redis, no database.
 * Auto-expire after idle TTL or absolute max age.
 * On server restart: all sessions are lost (by design).
 */

const constants = require('../config/constants');
const logger = require('../utils/logger');
const { generateSessionId } = require('../utils/crypto');

// RAM-ONLY storage — this Map is the sole session store
const sessions = new Map();

// Track stats for admin dashboard (no content, just counts)
let sessionsCreatedToday = 0;
let todayDate = new Date().toISOString().slice(0, 10);

function resetDailyStats() {
  const now = new Date().toISOString().slice(0, 10);
  if (now !== todayDate) {
    todayDate = now;
    sessionsCreatedToday = 0;
  }
}

// Periodic cleanup every 30 seconds
setInterval(() => {
  cleanupExpiredSessions();
  resetDailyStats();
}, 30000);

function createSession(sessionId, anonContext = {}, messages = []) {
  resetDailyStats();
  const id = sessionId || generateSessionId();
  const now = Date.now();

  const session = {
    id,
    anonContext,
    messages: [...messages],
    createdAt: now,
    lastActivity: now,
    tokenCount: 0,
    maxAge: constants.SESSION_MAX_AGE_MS,
  };

  sessions.set(id, session);
  sessionsCreatedToday += 1;

  logger.safeLog('info', 'Session created', {
    session_id: id,
    total_active: sessions.size,
  });

  return session;
}

function getSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return null;

  // Check absolute max age
  if (Date.now() - session.createdAt > session.maxAge) {
    wipeSession(sessionId);
    return null;
  }

  // Check idle TTL
  if (Date.now() - session.lastActivity > constants.SESSION_IDLE_TTL_MS) {
    wipeSession(sessionId);
    return null;
  }

  return session;
}

function updateSession(sessionId, messages, tokenCount) {
  const session = sessions.get(sessionId);
  if (!session) return null;

  session.messages = messages;
  session.tokenCount += tokenCount;
  session.lastActivity = Date.now();

  return session;
}

function appendMessage(sessionId, message) {
  const session = sessions.get(sessionId);
  if (!session) return null;

  session.messages.push(message);
  session.lastActivity = Date.now();

  // Enforce max messages
  if (session.messages.length > constants.SESSION_MAX_MESSAGES) {
    // Keep system message if present, then trim oldest
    const systemMessages = session.messages.filter(m => m.role === 'system');
    const otherMessages = session.messages.filter(m => m.role !== 'system');
    const keepCount = constants.SESSION_MAX_MESSAGES - systemMessages.length;
    session.messages = [...systemMessages, ...otherMessages.slice(-keepCount)];
  }

  return session;
}

function wipeSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return false;

  // Secure deletion pattern — overwrite sensitive fields
  session.messages = null;
  session.anonContext = null;
  session.id = null;
  session.createdAt = null;
  session.lastActivity = null;
  session.tokenCount = null;

  // Remove from Map
  sessions.delete(sessionId);

  // Force garbage collection hint (V8)
  if (global.gc) global.gc();

  logger.safeLog('info', 'Session wiped', {
    session_id: sessionId,
    total_active: sessions.size,
  });

  return true;
}

function wipeAllSessions() {
  let count = 0;
  for (const [id, session] of sessions.entries()) {
    session.messages = null;
    session.anonContext = null;
    session.id = null;
    session.createdAt = null;
    session.lastActivity = null;
    session.tokenCount = null;
    sessions.delete(id);
    count++;
  }
  if (global.gc) global.gc();

  logger.safeLog('info', 'All sessions force-wiped', { count });
  return count;
}

function cleanupExpiredSessions() {
  const now = Date.now();
  let count = 0;
  for (const [id, session] of sessions.entries()) {
    const idle = now - session.lastActivity;
    const age = now - session.createdAt;
    if (idle > constants.SESSION_IDLE_TTL_MS || age > session.maxAge) {
      wipeSession(id);
      count++;
    }
  }
  if (count > 0) {
    logger.safeLog('info', 'Expired sessions cleaned up', { count });
  }
}

/**
 * Summarize old messages to compress session context.
 * Keeps the most recent N messages intact, summarizes older ones into a single system message.
 * Returns the compressed message array.
 */
function summarizeSessionMessages(messages, keepRecent = 6) {
  if (messages.length <= keepRecent + 1) return messages;

  const systemMessages = messages.filter(m => m.role === 'system');
  const recentMessages = messages.slice(-keepRecent);
  const oldMessages = messages.slice(systemMessages.length, -keepRecent);

  if (oldMessages.length === 0) return messages;

  // Create a summary placeholder (actual summarization would require an LLM call)
  // For now, we compress by collapsing old user/assistant pairs into a brief context
  const topicHint = oldMessages[0]?.content?.slice(0, 80) || 'previous conversation';
  const summaryMsg = {
    role: 'system',
    content: `[Context: ${oldMessages.length} earlier messages about "${topicHint}..." omitted for brevity.]`,
  };

  return [...systemMessages, summaryMsg, ...recentMessages];
}

function getSessionStats() {
  const now = Date.now();
  let oldestAge = 0;
  let totalTokens = 0;
  const sessionList = [];

  for (const [id, session] of sessions.entries()) {
    const age = Math.floor((now - session.createdAt) / 1000);
    if (age > oldestAge) oldestAge = age;
    totalTokens += session.tokenCount || 0;
    sessionList.push({
      session_id: id,
      age_seconds: age,
      message_count: session.messages?.length || 0,
      token_count: session.tokenCount || 0,
    });
  }

  // Rough memory estimate (each session ~ few KB)
  const memoryUsedMb = Math.round((sessions.size * 8) + (totalTokens * 0.004));

  return {
    active_sessions: sessions.size,
    oldest_session_age_seconds: oldestAge,
    total_sessions_today: sessionsCreatedToday,
    memory_used_mb: memoryUsedMb,
    sessions: sessionList,
  };
}

module.exports = {
  sessions,
  createSession,
  getSession,
  updateSession,
  appendMessage,
  wipeSession,
  wipeAllSessions,
  cleanupExpiredSessions,
  summarizeSessionMessages,
  getSessionStats,
};
