import path from 'node:path';
import {fileURLToPath} from 'node:url';
import express from 'express';
import {config} from './config.js';
import {createApi} from './api/createApi.js';
import {searchService} from './services/searchService.js';
import {itemService} from './services/itemService.js';
import {createStatusService} from './services/statusService.js';
import {MonitorScheduler} from './scheduler/monitorScheduler.js';
import {searchRepository} from './storage/searchRepository.js';
import {itemRepository} from './storage/itemRepository.js';
import {vintedScraper} from './scraper/vintedScraper.js';
import {createLogger} from './utils/logger.js';
import './storage/database.js';

const logger = createLogger('server');
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, '../dist');

const scheduler = new MonitorScheduler({
  searchRepository,
  itemRepository,
  scraper: vintedScraper,
  intervalMs: config.scrapeIntervalSeconds * 1000,
  delayBetweenSearchesMs: config.scraperDelayMs,
  minDelayBetweenSearchesMs: config.scraperMinDelayMs,
  maxDelayBetweenSearchesMs: config.scraperMaxDelayMs,
  maxItemsPerSearch: config.maxItemsPerSearch,
});

const statusService = createStatusService(scheduler);
const app = createApi({searchService, itemService, statusService});

app.use(express.static(distPath));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    next();
    return;
  }
  res.sendFile(path.join(distPath, 'index.html'));
});

scheduler.start();

const PORT = config.port;
const server = app.listen(PORT, '0.0.0.0', () => {
  logger.info('API started', {
    url: `http://0.0.0.0:${PORT}`,
    scrapeIntervalSeconds: config.scrapeIntervalSeconds,
    maxItemsPerSearch: config.maxItemsPerSearch,
  });
});

function shutdown() {
  logger.info('Shutdown requested');
  scheduler.stop();
  server.close(() => {
    logger.info('HTTP server stopped');
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
