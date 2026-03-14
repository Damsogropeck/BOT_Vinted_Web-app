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

const deleteStmt = db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?');
const listStmt = db.prepare('SELECT endpoint, subscription_json FROM push_subscriptions');

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
};
