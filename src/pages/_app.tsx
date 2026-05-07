import '@/i18n';

import "@/styles/globals.css";
import "@charcoal-ui/icons";
import type { AppProps } from "next/app";
import { useEffect } from "react";
export default function App({ Component, pageProps }: AppProps) {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') {
      return;
    }

    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    navigator.serviceWorker.getRegistrations()
      .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
      .catch(() => {});
  }, []);

  return (
    <Component {...pageProps} />
  );
}
