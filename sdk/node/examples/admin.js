/**
 * VoidMind SDK — Admin Operations Example
 */

const { VoidMindClient } = require('../src/client');

async function main() {
  // Step 1: Login as admin
  const admin = VoidMindClient.createAdminClient(
    'http://localhost:3000',
    null // We'll get the token from login
  );

  const login = await admin.login('admin@voidmind.local', 'your_password');
  console.log('Logged in. Access token expires in', login.expires_in, 'seconds');

  // Step 2: Use the token for all admin operations
  const adminWithToken = VoidMindClient.createAdminClient(
    'http://localhost:3000',
    login.access_token
  );

  // Create a new API key
  const newKey = await adminWithToken.createKey({
    name: 'Production App',
    monthly_limit: 100000,
    daily_limit: 5000,
    requests_per_minute: 120,
  });
  console.log('New key created:', newKey.key); // Save this!

  // List all keys
  const keys = await adminWithToken.listKeys();
  console.log('Active keys:', keys.keys.length);

  // View usage
  const usage = await adminWithToken.getUsage();
  console.log('Tokens today:', usage.total_tokens_today);

  // View performance
  const perf = await adminWithToken.getPerformance();
  console.log('Response cache:', perf.caches.response);
  console.log('Queue:', perf.queue);

  // Force-wipe all sessions
  const wiped = await adminWithToken.wipeAllSessions();
  console.log('Sessions wiped:', wiped.count);
}

main().catch(console.error);
