const request = require('supertest');
const express = require('express');

// Mock the database and services for integration tests
jest.mock('../../src/config/database', () => ({
  db: {},
  initSchema: jest.fn(),
  runAsync: jest.fn().mockResolvedValue({}),
  getAsync: jest.fn().mockResolvedValue(null),
  allAsync: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../src/services/ollama', () => ({
  chatCompletion: jest.fn().mockResolvedValue({
    content: 'Hello from Ollama',
    promptTokens: 10,
    completionTokens: 5,
    totalTokens: 15,
    latency: 100,
  }),
  listModels: jest.fn().mockResolvedValue([
    { name: 'qwen2.5:3b', details: { parameter_size: '3.8B' } },
  ]),
}));

const apiRoutes = require('../../src/routes/api');

const app = express();
app.use(express.json());
app.use('/api/v1', apiRoutes);

describe('User API Integration', () => {
  test('GET /api/v1/health returns ok', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('voidmind');
  });

  test('GET /api/v1/models requires auth', async () => {
    const res = await request(app).get('/api/v1/models');
    expect(res.status).toBe(401);
  });

  test('POST /api/v1/chat/completions requires auth', async () => {
    const res = await request(app)
      .post('/api/v1/chat/completions')
      .send({ messages: [{ role: 'user', content: 'hi' }] });
    expect(res.status).toBe(401);
  });
});
