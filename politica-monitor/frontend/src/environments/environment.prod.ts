export const environment = {
  production: true,
  // La API vive en Render (capa gratuita). Firebase Hosting sirve solo el
  // frontend: las Cloud Functions necesitan el plan Blaze y la facturacion del
  // proyecto esta cerrada.
  apiUrl: 'https://politica-monitor-api.onrender.com',
  // Sin Cloud Function: el panel de prueba pega a la misma API de Render, que
  // no tiene el corte de 60s del rewrite de Hosting.
  functionUrl: '',
  firebase: {
    apiKey: 'AIzaSyCXAzIzz6L2vaThnKOFalaApo1BSMHqKiA',
    authDomain: 'muni-8ed74.firebaseapp.com',
    projectId: 'muni-8ed74',
    storageBucket: 'muni-8ed74.firebasestorage.app',
    messagingSenderId: '462228401596',
    appId: '1:462228401596:web:b1d1270f048bc964f24fb9',
  },
};
