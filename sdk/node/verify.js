/**
 * VoidMind Node.js SDK — Installation Verification
 * Run: node verify.js
 */

const path = require('path');

console.log('=== VoidMind Node.js SDK Verification ===\n');

// 1. Check package.json
let pkg;
try {
  pkg = require('./package.json');
  console.log('✅ package.json found');
  console.log('   Name:', pkg.name);
  console.log('   Version:', pkg.version);
} catch (e) {
  console.error('❌ Failed to load package.json:', e.message);
  process.exit(1);
}

// 2. Check client module loads
let client;
try {
  client = require('./src/client');
  console.log('✅ Client module loads');
  console.log('   Exports:', Object.keys(client).join(', '));
} catch (e) {
  console.error('❌ Failed to load client:', e.message);
  process.exit(1);
}

// 3. Check error classes
let errors;
try {
  errors = require('./src/errors');
  console.log('✅ Error classes load');
  console.log('   Errors:', Object.keys(errors).join(', '));
} catch (e) {
  console.error('❌ Failed to load errors:', e.message);
  process.exit(1);
}

// 4. Check TypeScript definitions exist
const fs = require('fs');
const typesPath = path.join(__dirname, 'types', 'index.d.ts');
if (fs.existsSync(typesPath)) {
  console.log('✅ TypeScript definitions found');
} else {
  console.log('⚠️  TypeScript definitions not found');
}

// 5. Instantiate client without network
const { VoidMindClient } = client;
try {
  const c = new VoidMindClient({ baseUrl: 'http://localhost:3000', apiKey: 'vm_test' });
  console.log('✅ Client instantiates');
  console.log('   Base URL:', c.baseUrl);
  console.log('   Timeout:', c.timeout);
  console.log('   Max retries:', c.maxRetries);
} catch (e) {
  console.error('❌ Failed to instantiate client:', e.message);
  process.exit(1);
}

// 6. Check admin client
try {
  const { VoidMindAdminClient } = client;
  const a = new VoidMindAdminClient('http://localhost:3000', 'test_token');
  console.log('✅ Admin client instantiates');
} catch (e) {
  console.error('❌ Failed to instantiate admin client:', e.message);
  process.exit(1);
}

console.log('\n=== All checks passed! SDK is ready. ===');
