import {Router} from 'express';
import {pushSubscriptionRepository} from '../../storage/pushSubscriptionRepository.js';

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
    } else {
      pushSubscriptionRepository.deleteByEndpoint(endpoint);
    }
    res.status(200).json({status: 'ok'});
  });

  return router;
}
