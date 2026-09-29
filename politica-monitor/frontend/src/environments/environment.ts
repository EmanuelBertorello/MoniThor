export const environment = {
  production: false,
  apiUrl: 'http://localhost:4000',
  // En local la API es la misma; en prod apunta a la Cloud Function directa.
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
