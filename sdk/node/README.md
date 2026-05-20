# VoidMind Node.js SDK

Official Node.js client for the VoidMind Zero-Knowledge AI Gateway.

**Repository:** https://github.com/MBAS89/voidmind

## Install

```bash
npm install voidmind-sdk
```

## Quick Start

```javascript
const { VoidMindClient } = require('voidmind-sdk');

const client = new VoidMindClient({
  baseUrl: 'https://your-domain.com',
  apiKey: 'vm_YOUR_API_KEY',
});

// Simple chat
const response = await client.chat({
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Hello!' },
  ],
});

console.log(response.choices[0].message.content);
```

## Streaming

```javascript
const stream = client.streamChat({
  messages: [{ role: 'user', content: 'Tell me a story.' }],
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content || '');
}
```

## Session Management

```javascript
// First message
const res1 = await client.chat({ messages: [...] });
const sessionId = res1.session_id;

// Continue conversation
const res2 = await client.chat({
  messages: [...],
  sessionId, // Reuse session for context
});

// End session explicitly
await client.endSession(sessionId);
```

## Admin Operations

```javascript
const admin = VoidMindClient.createAdminClient(
  'https://your-domain.com',
  'YOUR_ADMIN_JWT'
);

const keys = await admin.listKeys();
const newKey = await admin.createKey({ name: 'My App', daily_limit: 2000 });
await admin.wipeAllSessions();
```

## Error Handling

```javascript
const { AuthenticationError, RateLimitError } = require('voidmind-sdk');

try {
  await client.chat({ messages: [...] });
} catch (err) {
  if (err instanceof AuthenticationError) {
    console.error('Invalid API key');
  } else if (err instanceof RateLimitError) {
    console.error('Rate limited. Retry after:', err.retryAfter);
  } else {
    console.error('Error:', err.message);
  }
}
```

## TypeScript

TypeScript definitions are included. No `@types/` package needed.

```typescript
import { VoidMindClient, ChatMessage } from 'voidmind-sdk';

const client = new VoidMindClient({ baseUrl: '...', apiKey: '...' });
const messages: ChatMessage[] = [{ role: 'user', content: 'Hi' }];
const response = await client.chat({ messages });
```

## License

MIT
