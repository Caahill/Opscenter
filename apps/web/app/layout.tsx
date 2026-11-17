import type { Metadata, Viewport } from 'next';
import { Inter, Plus_Jakarta_Sans, Sometype_Mono } from 'next/font/google';
import type { ReactNode } from 'react';
import { isStaging } from '@/lib/staging-gate';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-jakarta', display: 'swap' });
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const sometype = Sometype_Mono({ subsets: ['latin'], variable: '--font-sometype', display: 'swap' });

export const metadata: Metadata = {
  title: 'SySpree Ops Hub',
  description: 'Client delivery, inbox, capacity and billing in one place.',
  // Installable on phones, so push works there too (PRD 5.3, PWA push).
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg' },
};

// Read APP_ENV when serving, not at build, so the banner follows the environment it runs in.
export const dynamic = 'force-dynamic';

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#202020' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${jakarta.variable} ${inter.variable} ${sometype.variable}`}>
      <body>
        {isStaging() ? (
          <div role="note" data-testid="staging-banner" className="bg-error px-4 py-1.5 text-center text-[13px] font-bold text-white">
            Staging. Demo data only: do not enter real client details.
          </div>
        ) : null}
        {children}
      </body>
    </html>
  );
}
