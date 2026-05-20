/**
 * VoidMind SDK — Basic Usage Example
 */

const { VoidMindClient } = require('../src/client');

async function main() {
  const client = new VoidMindClient({
    baseUrl: 'http://localhost:3000',
    apiKey: 'vm_YOUR_API_KEY_HERE',
  });

  // Simple chat
  const response = await client.chat({
    model: 'qwen2.5:3b',
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'What is the capital of France?' },
    ],
    maxTokens: 256,
  });

  console.log('Response:', response.choices[0].message.content);
  console.log('Tokens used:', response.usage.total_tokens);
  console.log('Session ID:', response.session_id);

  // Continue the same session
  const response2 = await client.chat({
    model: 'qwen2.5:3b',
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'What is the capital of France?' },
      { role: 'assistant', content: response.choices[0].message.content },
      { role: 'user', content: 'And what about Germany?' },
    ],
    sessionId: response.session_id, // Reuse session
    maxTokens: 256,
  });

  console.log('Follow-up:', response2.choices[0].message.content);

  // End session explicitly
  await client.endSession(response.session_id);
  console.log('Session ended.');
}

main().catch(console.error);
