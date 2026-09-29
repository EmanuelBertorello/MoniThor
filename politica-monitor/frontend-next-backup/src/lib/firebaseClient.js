// src/lib/firebaseClient.js
import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyCXAzIzz6L2vaThnKOFalaApo1BSMHqKiA',
  authDomain: 'muni-8ed74.firebaseapp.com',
  projectId: 'muni-8ed74',
  storageBucket: 'muni-8ed74.firebasestorage.app',
  messagingSenderId: '462228401596',
  appId: '1:462228401596:web:b1d1270f048bc964f24fb9',
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const auth = getAuth(app);
