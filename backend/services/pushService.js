import webpush from 'web-push';
import {config} from '../config.js';

let isConfigured = false;

function ensureConfigured() {
  if (isConfigured) {
    return;
  }
  if (!config.vapidPublicKey || !config.vapidPrivateKey || !config.vapidSubject) {
    throw new Error('Clés VAPID manquantes (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT).');
  }
  webpush.setVapidDetails(config.vapidSubject, config.vapidPublicKey, config.vapidPrivateKey);
  isConfigured = true;
}

export async function sendPushNotification(subscription, payload) {
  ensureConfigured();
  const body = JSON.stringify(payload);
  return webpush.sendNotification(subscription, body);
}
