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

scheduler.start();

const server = app.listen(config.port, '0.0.0.0', () => {
  logger.info('API started', {
    url: `http://0.0.0.0:${config.port}`,
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
