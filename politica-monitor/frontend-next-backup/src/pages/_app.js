// src/pages/_app.js
import Head from 'next/head';
import { AuthProvider } from '../lib/auth';
import { Toaster } from 'react-hot-toast';
import '../styles/globals.css';

export default function App({ Component, pageProps }) {
  return (
    <AuthProvider>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>
      <Component {...pageProps} />
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#1a2235',
            color: '#f1f5f9',
            border: '1px solid #2d4a7a',
            borderRadius: '10px',
            fontSize: '13px',
          },
        }}
      />
    </AuthProvider>
  );
}
