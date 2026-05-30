import path from 'node:path';
import {fileURLToPath} from 'node:url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const isProduction = String(process.env.NODE_ENV ?? '').toLowerCase() === 'production';
if (!isProduction) {
  dotenv.config({quiet: true});
}

function toInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toLogLevel(value) {
  const normalized = String(value ?? '').toLowerCase().trim();
  if (normalized === 'debug' || normalized === 'info' || normalized === 'warn' || normalized === 'error') {
    return normalized;
  }
  return 'info';
}

const scraperMinDelayMs = toInt(process.env.SCRAPER_MIN_DELAY_MS, 900);
const scraperMaxDelayMs = Math.max(scraperMinDelayMs, toInt(process.env.SCRAPER_MAX_DELAY_MS, 1800));

export const config = {
  projectRoot,
  port: toInt(process.env.PORT ?? process.env.BACKEND_PORT, 3000),
  dbPath: path.resolve(projectRoot, process.env.DB_PATH ?? 'backend/storage/vinted-bot.db'),
  scrapeIntervalSeconds: toInt(process.env.SCRAPE_INTERVAL_SECONDS, 45),
  scraperDelayMs: toInt(process.env.SCRAPER_DELAY_MS, 1200),
  scraperMinDelayMs,
  scraperMaxDelayMs,
  maxItemsPerSearch: toInt(process.env.MAX_ITEMS_PER_SEARCH, 20),
  maxDetailRequestsPerRun: toInt(process.env.MAX_DETAIL_REQUESTS_PER_RUN, 2),
  maxHttpRequestsPerSearch: toInt(process.env.MAX_HTTP_REQUESTS_PER_SEARCH, 6),
  httpRetries: toInt(process.env.HTTP_RETRIES, 2),
  httpTimeoutMs: toInt(process.env.HTTP_TIMEOUT_MS, 12000),
  httpRetryBaseDelayMs: toInt(process.env.HTTP_RETRY_BASE_DELAY_MS, 350),
  logLevel: toLogLevel(process.env.LOG_LEVEL),
  enableDetailEnrichment: String(process.env.ENABLE_DETAIL_ENRICHMENT ?? 'false').toLowerCase() === 'true',
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY,
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY,
  vapidSubject: process.env.VAPID_SUBJECT,
  // Sécurité et limites
  allowedOrigin: process.env.ALLOWED_ORIGIN ?? null,
  apiToken: process.env.API_TOKEN || null,
  // Nettoyage automatique de la base de données
  maxItemAgeDays: toInt(process.env.MAX_ITEM_AGE_DAYS, 30),
  cleanupIntervalHours: toInt(process.env.CLEANUP_INTERVAL_HOURS, 24),
};
