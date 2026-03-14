import {Router} from 'express';
import {pushSubscriptionRepository} from '../../storage/pushSubscriptionRepository.js';
import {sendPushNotification} from '../../services/pushService.js';
import {createLogger} from '../../utils/logger.js';

const logger = createLogger('api.push');

export function createPushRoutes() {
  const router = Router();

  router.post('/subscribe', (req, res) => {
    const {subscription, searchId, enabled = true} = req.body ?? {};
    if (!subscription || !subscription.endpoint) {
      res.status(400).json({error: 'Subscription invalide.'});
      return;
    }
    if (!searchId || !Number.isFinite(Number(searchId))) {
      res.status(400).json({error: 'searchId manquant ou invalide.'});
      return;
    }

    pushSubscriptionRepository.upsert({
      endpoint: subscription.endpoint,
      subscription,
      userAgent: req.get('user-agent'),
    });

    pushSubscriptionRepository.setSearchPreference(subscription.endpoint, Number(searchId), Boolean(enabled));

    logger.info('Push subscribed', {
      endpoint: subscription.endpoint,
      searchId: Number(searchId),
      enabled: Boolean(enabled),
    });

    res.status(201).json({status: 'ok'});
  });

  router.post('/unsubscribe', (req, res) => {
    const {endpoint, searchId} = req.body ?? {};
    if (!endpoint) {
      res.status(400).json({error: 'Endpoint manquant.'});
      return;
    }
    if (searchId && Number.isFinite(Number(searchId))) {
      pushSubscriptionRepository.setSearchPreference(endpoint, Number(searchId), false);
      logger.info('Push unsubscribed from search', {endpoint, searchId: Number(searchId)});
    } else {
      pushSubscriptionRepository.deleteByEndpoint(endpoint);
      logger.info('Push unsubscribed (global)', {endpoint});
    }
    res.status(200).json({status: 'ok'});
  });

  router.post('/push/test', async (req, res) => {
    const {searchId} = req.body ?? {};
    const subscriptions =
      searchId && Number.isFinite(Number(searchId))
        ? pushSubscriptionRepository.listBySearchId(Number(searchId))
        : pushSubscriptionRepository.listAll();

    if (subscriptions.length === 0) {
      res.status(404).json({error: 'Aucune subscription enregistrée.'});
      return;
    }

    const payload = {
      title: 'Test Notification',
      body: 'Ceci est une notification de test.',
      url: '/',
      icon: '/icon-192.png',
    };

    const results = await Promise.allSettled(
      subscriptions.map((sub) => sendPushNotification(sub.subscription, payload)),
    );

    const failed = results.filter((result) => result.status === 'rejected');
    if (failed.length > 0) {
      logger.warn('Push test failed for some subscriptions', {failed: failed.length});
    } else {
      logger.info('Push test delivered', {count: subscriptions.length});
    }

    res.status(200).json({
      status: 'ok',
      sent: subscriptions.length,
      failed: failed.length,
    });
  });

  router.get('/push/diagnostic', (req, res) => {
    const searchId = Number(req.query.searchId);
    const total = pushSubscriptionRepository.listAll().length;
    const bySearch = Number.isFinite(searchId) ? pushSubscriptionRepository.listBySearchId(searchId).length : null;

    res.status(200).json({
      status: 'ok',
      subscriptionsTotal: total,
      subscriptionsForSearch: bySearch,
    });
  });

  return router;
}
