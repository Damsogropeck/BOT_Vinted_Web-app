import {Router} from 'express';
import {pushSubscriptionRepository} from '../../storage/pushSubscriptionRepository.js';

export function createPushRoutes() {
  const router = Router();

  router.post('/subscribe', (req, res) => {
    const subscription = req.body;
    if (!subscription || !subscription.endpoint) {
      res.status(400).json({error: 'Subscription invalide.'});
      return;
    }

    pushSubscriptionRepository.upsert({
      endpoint: subscription.endpoint,
      subscription,
      userAgent: req.get('user-agent'),
    });

    res.status(201).json({status: 'ok'});
  });

  router.post('/unsubscribe', (req, res) => {
    const {endpoint} = req.body ?? {};
    if (!endpoint) {
      res.status(400).json({error: 'Endpoint manquant.'});
      return;
    }
    pushSubscriptionRepository.deleteByEndpoint(endpoint);
    res.status(200).json({status: 'ok'});
  });

  return router;
}
