#!/usr/bin/env node
/**
 * VoidMind — Benchmark Suite
 * Load tests the gateway and reports latency percentiles, throughput, and RAM usage.
 * Usage: node scripts/benchmark.js [url] [concurrency] [total_requests]
 */

const http = require('http');

const TARGET = process.argv[2] || 'http://127.0.0.1:3000';
const CONCURRENCY = parseInt(process.argv[3], 10) || 5;
const TOTAL = parseInt(process.argv[4], 10) || 50;
const API_KEY = process.env.BENCHMARK_API_KEY || '';

const results = [];
let completed = 0;
let errors = 0;

function makeRequest() {
  return new Promise((resolve) => {
    const start = Date.now();
    const payload = JSON.stringify({
      model: 'qwen2.5:3b',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Say hello in one word.' },
      ],
      max_tokens: 10,
    });

    const url = new URL('/api/v1/chat/completions', TARGET);
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}),
      },
      timeout: 60000,
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        const latency = Date.now() - start;
        if (res.statusCode === 200) {
          try {
            const json = JSON.parse(data);
            const tokens = json.usage?.total_tokens || 0;
            results.push({ latency, tokens, status: res.statusCode });
          } catch {
            results.push({ latency, tokens: 0, status: res.statusCode });
          }
        } else {
          errors++;
          results.push({ latency, tokens: 0, status: res.statusCode });
        }
        resolve();
      });
    });

    req.on('error', () => { errors++; resolve(); });
    req.on('timeout', () => { req.destroy(); errors++; resolve(); });
    req.write(payload);
    req.end();
  });
}

async function runBenchmark() {
  console.log(`\n========================================`);
  console.log(`  VoidMind Benchmark`);
  console.log(`  Target: ${TARGET}`);
  console.log(`  Concurrency: ${CONCURRENCY}`);
  console.log(`  Total Requests: ${TOTAL}`);
  console.log(`========================================\n`);

  const startMem = process.memoryUsage();
  const startTime = Date.now();

  const queue = [];
  for (let i = 0; i < TOTAL; i++) {
    queue.push(makeRequest());
    if (queue.length >= CONCURRENCY) {
      await Promise.all(queue);
      queue.length = 0;
      completed += CONCURRENCY;
      process.stdout.write(`\r  Progress: ${completed}/${TOTAL}`);
    }
  }
  if (queue.length > 0) {
    await Promise.all(queue);
    completed += queue.length;
  }

  const totalTime = Date.now() - startTime;
  const endMem = process.memoryUsage();

  // Calculate stats
  const latencies = results.filter(r => r.status === 200).map(r => r.latency).sort((a, b) => a - b);
  const totalTokens = results.reduce((sum, r) => sum + r.tokens, 0);

  const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
  const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;
  const avg = latencies.length ? (latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;
  const min = latencies[0] || 0;
  const max = latencies[latencies.length - 1] || 0;

  console.log(`\n\n--- Results ---`);
  console.log(`  Successful:    ${latencies.length}/${TOTAL}`);
  console.log(`  Errors:        ${errors}`);
  console.log(`  Total time:    ${(totalTime / 1000).toFixed(2)}s`);
  console.log(`  Throughput:    ${(TOTAL / (totalTime / 1000)).toFixed(2)} req/s`);
  console.log(`  Tokens total:  ${totalTokens}`);
  console.log(`  Tokens/sec:    ${(totalTokens / (totalTime / 1000)).toFixed(2)}`);
  console.log(`\n  Latency (ms):`);
  console.log(`    Min:  ${min}`);
  console.log(`    Avg:  ${Math.round(avg)}`);
  console.log(`    P50:  ${p50}`);
  console.log(`    P95:  ${p95}`);
  console.log(`    P99:  ${p99}`);
  console.log(`    Max:  ${max}`);
  console.log(`\n  Memory (MB):`);
  console.log(`    RSS:        ${(endMem.rss / 1024 / 1024).toFixed(1)}`);
  console.log(`    Heap used:  ${(endMem.heapUsed / 1024 / 1024).toFixed(1)}`);
  console.log(`    Delta RSS:  ${((endMem.rss - startMem.rss) / 1024 / 1024).toFixed(1)}`);
  console.log(`========================================\n`);
}

runBenchmark().catch(console.error);
