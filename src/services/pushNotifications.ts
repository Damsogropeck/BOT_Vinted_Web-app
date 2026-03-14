const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

function isStandaloneMode() {
  const isStandaloneMatch = window.matchMedia?.('(display-mode: standalone)').matches;
  const isIosStandalone = (window.navigator as {standalone?: boolean}).standalone;
  return Boolean(isStandaloneMatch || isIosStandalone);
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Service worker non supporté par ce navigateur.');
  }
  return navigator.serviceWorker.register('/sw.js');
}

export async function subscribeUserToPush() {
  if (!VAPID_PUBLIC_KEY) {
    throw new Error('Clé VAPID publique manquante (VITE_VAPID_PUBLIC_KEY).');
  }
  if (!('Notification' in window)) {
    throw new Error('Notifications non supportées sur ce navigateur.');
  }
  if (!isStandaloneMode()) {
    throw new Error('Sur iOS, les notifications Web Push ne fonctionnent que depuis l’app ajoutée à l’écran d’accueil.');
  }

  const registration = await registerServiceWorker();
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Permission de notifications refusée.');
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });

  const response = await fetch('/api/subscribe', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(subscription),
  });

  if (!response.ok) {
    throw new Error('Impossible d’enregistrer la souscription côté serveur.');
  }

  return subscription;
}

export async function unsubscribeUserFromPush() {
  if (!('serviceWorker' in navigator)) {
    return;
  }
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) {
    return;
  }
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    return;
  }
  await subscription.unsubscribe();
  await fetch('/api/unsubscribe', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({endpoint: subscription.endpoint}),
  });
}
