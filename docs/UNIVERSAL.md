# Using VoidMind for Any Application

VoidMind is designed to be universal. Any application that needs AI responses without storing conversation data can use it.

## Integration Pattern

```
Your App Server          VoidMind VPS
------------             ------------
1. Receive user message
2. Anonymize (strip PII)
3. Build context
4. Send to /api/v1/chat/completions
                         5. Store session in RAM
                         6. Call Ollama (local)
                         7. Return response
                         8. Auto-wipe session
9. Receive response
10. Display to user
```

## Anonymization

Your app server is responsible for anonymizing data before sending to VoidMind:

```javascript
function anonymize(message) {
  return message
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]')
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN]')
    .replace(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, '[PHONE]');
}
```

## Example: Healthcare

```javascript
const response = await fetch('https://voidmind.your-domain.com/api/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer vm_xxxxxxxx',
  },
  body: JSON.stringify({
    session_id: patientSessionId,
    model: 'qwen2.5:3b',
    messages: [
      { role: 'system', content: 'You are a dental clinic assistant.' },
      { role: 'user', content: anonymize(patientMessage) },
    ],
  }),
});
```

## Example: E-commerce

```javascript
const response = await fetch('https://voidmind.your-domain.com/api/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer vm_xxxxxxxx',
  },
  body: JSON.stringify({
    model: 'qwen2.5:3b',
    messages: [
      { role: 'system', content: 'You are a support agent for an electronics store.' },
      { role: 'user', content: 'Does this laptop support USB-C charging?' },
    ],
  }),
});
```

## Best Practices

1. **Always anonymize** before sending to VoidMind
2. **Store user data** on your own server, encrypted
3. **Use HTTPS** for all communication
4. **Rotate API keys** quarterly
5. **Monitor usage** via admin dashboard
6. **Force-wipe sessions** if you suspect issues
