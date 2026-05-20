/**
 * VoidMind SDK — Streaming Usage Example
 */

const { VoidMindClient } = require('../src/client');

async function main() {
  const client = new VoidMindClient({
    baseUrl: 'http://localhost:3000',
    apiKey: 'vm_YOUR_API_KEY_HERE',
  });

  const stream = client.streamChat({
    model: 'qwen2.5:3b',
    messages: [
      { role: 'system', content: 'You are a creative writer.' },
      { role: 'user', content: 'Write a haiku about silence.' },
    ],
    maxTokens: 256,
  });

  process.stdout.write('AI: ');
  for await (const chunk of stream) {
    const content = chunk.choices?.[0]?.delta?.content;
    if (content) {
      process.stdout.write(content);
    }
  }
  process.stdout.write('\n');
}

main().catch(console.error);
