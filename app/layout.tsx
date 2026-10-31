import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { SideNav, BottomNav } from '@/components/Nav';
import './globals.css';

const sans = Inter({ subsets: ['latin'], variable: '--font-sans' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'Trade Journal',
  description: 'Personal trading journal synced with Interactive Brokers',
  appleWebApp: { capable: true, title: 'Journal', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0a0d14' },
    { media: '(prefers-color-scheme: light)', color: '#f4f6fa' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <div className="shell">
          <SideNav />
          <div>
            {children}
          </div>
        </div>
        <BottomNav />
      </body>
    </html>
  );
}
