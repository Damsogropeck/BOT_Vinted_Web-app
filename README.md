# BOT_Vinted_webbApp

Web app locale pour surveiller des recherches Vinted sans compte, scraper les nouvelles annonces publiques, et afficher les items dans l'UI existante.

## Stack

- Frontend: React + Vite (UI existante conservée)
- Backend: Node.js + Express
- Persistance: SQLite (`better-sqlite3`)
- Scraping: pages publiques Vinted (HTML + extraction JSON embarqué + fallback DOM)

## Démarrage

Prérequis: Node.js 20+ recommandé.

1. Installer les dépendances

```bash
npm install
```

2. Lancer le backend (terminal 1)

```bash
npm run dev:server
```

3. Lancer le frontend (terminal 2)

```bash
npm run dev:client
```

Frontend: [http://localhost:3000](http://localhost:3000)
Backend: [http://localhost:3001](http://localhost:3001)

## API

- `POST /api/searches`
- `GET /api/searches`
- `PATCH /api/searches/:id`
- `DELETE /api/searches/:id`
- `GET /api/items?limit=30`
- `GET /api/status`

## Variables d'environnement (optionnelles)

- `BACKEND_PORT` (défaut: `3001`)
- `DB_PATH` (défaut: `backend/storage/vinted-bot.db`)
- `SCRAPE_INTERVAL_SECONDS` (défaut: `45`)
- `SCRAPER_DELAY_MS` (défaut: `1200`)
- `SCRAPER_MIN_DELAY_MS` (défaut: `900`)
- `SCRAPER_MAX_DELAY_MS` (défaut: `1800`)
- `MAX_ITEMS_PER_SEARCH` (défaut: `20`)
- `MAX_DETAIL_REQUESTS_PER_RUN` (défaut: `2`)
- `MAX_HTTP_REQUESTS_PER_SEARCH` (défaut: `6`)
- `HTTP_RETRIES` (défaut: `2`)
- `HTTP_TIMEOUT_MS` (défaut: `12000`)
- `HTTP_RETRY_BASE_DELAY_MS` (défaut: `350`)
- `ENABLE_DETAIL_ENRICHMENT` (`true`/`false`, défaut: `false`)
- `LOG_LEVEL` (`debug`/`info`/`warn`/`error`, défaut: `info`)

## Limites de scraping

- Le scraping dépend de la structure HTML/JSON publique de Vinted et peut casser si le site change.
- Les données extraites peuvent être partielles selon les pages.
- L'enrichissement via pages détail est limité pour réduire la charge réseau.
