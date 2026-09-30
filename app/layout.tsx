import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'GEMINI3D — Jumeau numérique impression 3D',
  description: 'Visualisation temps réel : pièce désirée (G-code) vs pièce en cours d\u2019impression (trace EGM)',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
