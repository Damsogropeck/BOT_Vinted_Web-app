import {db} from './database.js';
import {nowIso} from '../utils/time.js';

const upsertStmt = db.prepare(`
  INSERT INTO push_subscriptions (endpoint, subscription_json, user_agent, created_at, updated_at)
  VALUES (@endpoint, @subscriptionJson, @userAgent, @createdAt, @updatedAt)
  ON CONFLICT(endpoint) DO UPDATE SET
    subscription_json = excluded.subscription_json,
    user_agent = excluded.user_agent,
    updated_at = excluded.updated_at
`);

const getByEndpointStmt = db.prepare('SELECT id, endpoint FROM push_subscriptions WHERE endpoint = ?');
const deleteStmt = db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?');
const listStmt = db.prepare('SELECT endpoint, subscription_json FROM push_subscriptions');
const upsertPreferenceStmt = db.prepare(`
  INSERT INTO push_subscription_searches (subscription_id, search_id, enabled, created_at, updated_at)
  VALUES (@subscriptionId, @searchId, @enabled, @createdAt, @updatedAt)
  ON CONFLICT(subscription_id, search_id) DO UPDATE SET
    enabled = excluded.enabled,
    updated_at = excluded.updated_at
`);
const deletePreferenceStmt = db.prepare(`
  DELETE FROM push_subscription_searches
  WHERE subscription_id = ? AND search_id = ?
`);
const listBySearchIdStmt = db.prepare(`
  SELECT ps.endpoint, ps.subscription_json
  FROM push_subscriptions ps
  INNER JOIN push_subscription_searches pss ON pss.subscription_id = ps.id
  WHERE pss.search_id = ? AND pss.enabled = 1
`);

export const pushSubscriptionRepository = {
  upsert({endpoint, subscription, userAgent}) {
    const now = nowIso();
    upsertStmt.run({
      endpoint,
      subscriptionJson: JSON.stringify(subscription),
      userAgent,
      createdAt: now,
      updatedAt: now,
    });

    return getByEndpointStmt.get(endpoint);
  },

  setSearchPreference(endpoint, searchId, enabled) {
    const record = getByEndpointStmt.get(endpoint);
    if (!record) {
      return false;
    }
    const now = nowIso();
    if (enabled) {
      upsertPreferenceStmt.run({
        subscriptionId: record.id,
        searchId,
        enabled: 1,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      deletePreferenceStmt.run(record.id, searchId);
    }
    return true;
  },

  deleteByEndpoint(endpoint) {
    return deleteStmt.run(endpoint).changes > 0;
  },

  listAll() {
    return listStmt.all().map((row) => ({
      endpoint: row.endpoint,
      subscription: JSON.parse(row.subscription_json),
    }));
  },

  listBySearchId(searchId) {
    return listBySearchIdStmt.all(searchId).map((row) => ({
      endpoint: row.endpoint,
      subscription: JSON.parse(row.subscription_json),
    }));
  },
};
