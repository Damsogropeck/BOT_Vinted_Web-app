import {nowIso} from '../utils/time.js';
import {sleepRandom} from '../utils/http.js';
import {createLogger} from '../utils/logger.js';
import {normalizeVintedUrl} from '../utils/url.js';

const logger = createLogger('scheduler.monitor');

export class MonitorScheduler {
  constructor({
    searchRepository,
    itemRepository,
    scraper,
    intervalMs,
    delayBetweenSearchesMs,
    minDelayBetweenSearchesMs,
    maxDelayBetweenSearchesMs,
    maxItemsPerSearch,
  }) {
    this.searchRepository = searchRepository;
    this.itemRepository = itemRepository;
    this.scraper = scraper;
    this.intervalMs = intervalMs;
    this.delayBetweenSearchesMs = delayBetweenSearchesMs;
    this.minDelayBetweenSearchesMs = minDelayBetweenSearchesMs ?? delayBetweenSearchesMs;
    this.maxDelayBetweenSearchesMs = maxDelayBetweenSearchesMs ?? delayBetweenSearchesMs;
    this.maxItemsPerSearch = maxItemsPerSearch;

    this.timer = null;
    this.running = false;
    this.state = {
      startedAt: null,
      lastRunAt: null,
      lastRunDurationMs: null,
      lastRunSearches: 0,
      lastRunNewItems: 0,
      totalNewItemsDetected: 0,
      lastError: null,
    };
  }

  start() {
    if (this.timer) {
      return;
    }

    this.state.startedAt = nowIso();
    logger.info('Scheduler started', {
      intervalMs: this.intervalMs,
      minDelayBetweenSearchesMs: this.minDelayBetweenSearchesMs,
      maxDelayBetweenSearchesMs: this.maxDelayBetweenSearchesMs,
    });

    this.runCycle().catch((error) => {
      this.state.lastError = error.message;
      logger.error('Scheduler cycle crashed', {error: error.message});
    });

    this.timer = setInterval(() => {
      this.runCycle().catch((error) => {
        this.state.lastError = error.message;
        logger.error('Scheduler cycle crashed', {error: error.message});
      });
    }, this.intervalMs);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info('Scheduler stopped');
    }
  }

  async runCycle() {
    if (this.running) {
      logger.debug('Cycle skipped because previous cycle is still running');
      return;
    }

    this.running = true;
    const started = Date.now();
    const activeSearches = this.searchRepository.listActive();
    let newItemsCount = 0;
    let cycleError = null;

    logger.info('Cycle started', {activeSearches: activeSearches.length});

    try {
      for (let index = 0; index < activeSearches.length; index += 1) {
        const search = activeSearches[index];

        try {
          let scrapeUrl = search.normalizedUrl || search.url;
          try {
            scrapeUrl = normalizeVintedUrl(scrapeUrl);
          } catch {
            // Keep stored URL if normalization fails at runtime.
          }

          const scrapedItems = await this.scraper.scrapeSearch(scrapeUrl, {
            maxItems: this.maxItemsPerSearch,
          });

          const now = nowIso();
          let inserted = 0;

          if (!search.lastCheckAt) {
            this.itemRepository.markItemsAsSeen(search.id, scrapedItems, now);
            logger.info('Search warm-up completed (baseline only)', {
              searchId: search.id,
              label: search.label,
              baselineSeen: scrapedItems.length,
            });
          } else {
            inserted = this.itemRepository.insertNewItems(search.id, scrapedItems, now);
          }

          this.searchRepository.touchLastCheckAt(search.id, now);
          newItemsCount += inserted;

          logger.info('Search cycle completed', {
            searchId: search.id,
            label: search.label,
            scraped: scrapedItems.length,
            inserted,
          });
        } catch (error) {
          cycleError = `Search ${search.id}: ${error.message}`;
          logger.warn('Search cycle failed', {
            searchId: search.id,
            label: search.label,
            error: error.message,
          });
        }

        const hasNextSearch = index < activeSearches.length - 1;
        if (hasNextSearch) {
          await sleepRandom(this.minDelayBetweenSearchesMs, this.maxDelayBetweenSearchesMs);
        }
      }

      this.state.lastError = cycleError;
    } finally {
      this.state.lastRunAt = nowIso();
      this.state.lastRunDurationMs = Date.now() - started;
      this.state.lastRunSearches = activeSearches.length;
      this.state.lastRunNewItems = newItemsCount;
      this.state.totalNewItemsDetected += newItemsCount;
      this.running = false;

      logger.info('Cycle finished', {
        durationMs: this.state.lastRunDurationMs,
        searches: this.state.lastRunSearches,
        newItems: this.state.lastRunNewItems,
        lastError: this.state.lastError,
      });
    }
  }

  getStatus() {
    return {
      running: Boolean(this.timer),
      cycleInProgress: this.running,
      intervalMs: this.intervalMs,
      ...this.state,
    };
  }
}
