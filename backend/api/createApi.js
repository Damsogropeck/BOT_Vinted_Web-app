import express from 'express';
import {createSearchRoutes} from './routes/searchRoutes.js';
import {createItemRoutes} from './routes/itemRoutes.js';
import {createStatusRoutes} from './routes/statusRoutes.js';
import {toHttpError} from '../utils/errors.js';
import {createLogger} from '../utils/logger.js';

const logger = createLogger('api');

export function createApi({searchService, itemService, statusService}) {
  const app = express();

  app.use(express.json());

  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.status(204).send();
      return;
    }
    next();
  });

  app.get('/health', (_req, res) => {
    res.json({ok: true, timestamp: new Date().toISOString()});
  });

  app.use('/api/searches', createSearchRoutes(searchService));
  app.use('/api/items', createItemRoutes(itemService));
  app.use('/api/status', createStatusRoutes(statusService));

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
