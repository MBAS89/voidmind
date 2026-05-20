/**
 * VoidMind — Main Server Entry Point
 * Zero-knowledge AI gateway. RAM-only sessions. Local inference.
 */

require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const { initSchema, bootstrapAdmin, db } = require('./config/database');
const constants = require('./config/constants');
const logger = require('./utils/logger');
const { requestIdMiddleware } = require('./middleware/requestId');
const { recordHttpRequest } = require('./services/metricsCollector');
const { startCleanupTasks } = require('./services/cleanup');
const { wipeAllSessions } = require('./services/session');
const { listModels } = require('./services/ollama');
const { startKeepAlive, stopKeepAlive } = require('./services/keepAlive');
const { register } = require('./services/metricsCollector');
const { drainQueue } = require('./services/queue');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');

const apiRoutes = require('./routes/api');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3000;
const HOST = process.env.HOST || '127.0.0.1';

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
}));

// CORS — whitelist only
const corsOrigin = process.env.CORS_ORIGIN;
app.use(cors({
  origin: corsOrigin || false,
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
}));

// Request ID tracing
app.use(requestIdMiddleware);

// Body parsing
app.use(express.json({ limit: constants.MAX_PAYLOAD_SIZE }));
app.use(express.urlencoded({ extended: true, limit: constants.MAX_PAYLOAD_SIZE }));

// Request metrics tracking
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const route = req.route ? req.route.path : req.path;
    recordHttpRequest(req.method, route, res.statusCode, duration);
  });
  next();
});

// Request timeout middleware
app.use((req, res, next) => {
  req.setTimeout(constants.REQUEST_TIMEOUT_MS, () => {
    res.status(408).json({
      error: 'request_timeout',
      message: 'Request took too long',
    });
  });
  next();
});

// Trust proxy (Nginx in front)
app.set('trust proxy', 1);

// --- Routes ---

// Public health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'voidmind',
    version: require('../package.json').version,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Interactive API documentation (Swagger UI)
const openApiPath = require('path').join(__dirname, '../docs/openapi.yaml');
let swaggerDocument;
try {
  swaggerDocument = YAML.load(openApiPath);
} catch (err) {
  logger.warn('Failed to load openapi.yaml for Swagger UI', { error: err.message });
}
if (swaggerDocument) {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
    explorer: true,
    customSiteTitle: 'VoidMind API',
    customCss: '.swagger-ui .topbar { display: none }',
  }));
}

// Prometheus metrics endpoint (for scraping)
app.get('/metrics', async (req, res) => {
  try {
    res.setHeader('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    res.status(500).end(err.message);
  }
});

// API routes
app.use('/api/v1', apiRoutes);

// Admin routes
app.use('/admin', adminRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'not_found',
    message: `Endpoint ${req.method} ${req.path} not found`,
  });
});

// Error handler
app.use((err, req, res, _next) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    request_id: req.requestId,
  });
  res.status(err.status || 500).json({
    error: 'internal_error',
    message: process.env.NODE_ENV === 'production'
      ? 'An internal error occurred'
      : err.message,
  });
});

// --- Startup ---

let server;

async function warmupOllama() {
  const model = process.env.OLLAMA_DEFAULT_MODEL || 'qwen2.5:3b';
  try {
    logger.info('Warming up Ollama model...', { model });
    await listModels();
    logger.info('Ollama is ready', { model });
  } catch (err) {
    logger.warn('Ollama warmup failed — will retry on first request', { error: err.message, model });
  }
}

async function startServer() {
  initSchema();
  await bootstrapAdmin();
  startCleanupTasks();
  startKeepAlive();
  await warmupOllama();

  server = app.listen(PORT, HOST, () => {
    logger.info('VoidMind server started', {
      host: HOST,
      port: PORT,
      env: process.env.NODE_ENV || 'development',
      version: require('../package.json').version,
    });
  });
}

// Graceful shutdown
function gracefulShutdown(signal) {
  logger.info(`Received ${signal}, shutting down gracefully...`);

  // Stop accepting new connections
  if (server) {
    server.close(() => {
      logger.info('HTTP server closed');
    });
  }

  // Stop background services
  stopKeepAlive();

  // Drain inference queue
  const drained = drainQueue();
  if (drained > 0) {
    logger.info('Inference queue drained', { rejected_jobs: drained });
  }

  // Wipe all RAM sessions
  try {
    const count = wipeAllSessions();
    logger.info('All RAM sessions wiped', { count });
  } catch (err) {
    logger.error('Error wiping sessions during shutdown', { error: err.message });
  }

  // Close SQLite
  try {
    db.close((err) => {
      if (err) {
        logger.error('Error closing database', { error: err.message });
      } else {
        logger.info('SQLite database closed');
      }
      process.exit(0);
    });
  } catch (err) {
    logger.error('Error during shutdown', { error: err.message });
    process.exit(1);
  }

  // Force exit after 10 seconds if graceful shutdown hangs
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

startServer();
