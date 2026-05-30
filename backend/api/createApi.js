import express from 'express';
import rateLimit from 'express-rate-limit';
import {config} from '../config.js';
import {createSearchRoutes} from './routes/searchRoutes.js';
import {createItemRoutes} from './routes/itemRoutes.js';
import {createStatusRoutes} from './routes/statusRoutes.js';
import {createPushRoutes} from './routes/pushRoutes.js';
import {toHttpError} from '../utils/errors.js';
import {createLogger} from '../utils/logger.js';

const logger = createLogger('api');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function createCorsMiddleware(allowedOrigin) {
  return (req, res, next) => {
    const origin = allowedOrigin || req.get('origin') || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    if (req.method === 'OPTIONS') {
      res.status(204).send();
      return;
    }
    next();
  };
}

function createAuthMiddleware(token) {
  if (!token) {
    return (_req, _res, next) => next();
  }
  return (req, res, next) => {
    if (SAFE_METHODS.has(req.method)) {
      next();
      return;
    }
    const auth = req.get('authorization') ?? '';
    if (auth !== `Bearer ${token}`) {
      res.status(401).json({error: 'Non autorisé. Token API manquant ou invalide.'});
      return;
    }
    next();
  };
}

const generalLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {error: 'Trop de requêtes. Réessaie dans une minute.'},
  skip: (req) => SAFE_METHODS.has(req.method),
});

const pushTestLimiter = rateLimit({
  windowMs: 60_000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {error: 'Trop de tests push. Réessaie dans une minute.'},
});

export function createApi({searchService, itemService, statusService}) {
  const app = express();

  app.use(express.json());
  app.use(createCorsMiddleware(config.allowedOrigin));
  app.use('/api', generalLimiter);
  app.use('/api', createAuthMiddleware(config.apiToken));

  app.get('/health', (_req, res) => {
    res.json({status: 'ok'});
  });

  app.use('/api/searches', createSearchRoutes(searchService));
  app.use('/api/items', createItemRoutes(itemService));
  app.use('/api/status', createStatusRoutes(statusService));
  app.use('/api', createPushRoutes({pushTestLimiter}));

  app.use((error, _req, res, _next) => {
    const httpError = toHttpError(error);
    logger.error('API request failed', {
      status: httpError.status,
      message: httpError.message,
      cause: httpError.cause?.message,
    });
    res.status(httpError.status).json({error: httpError.message});
  });

  return app;
}
