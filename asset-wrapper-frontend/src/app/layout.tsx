// src/app/layout.tsx
import './globals.css';
import '@rainbow-me/rainbowkit/styles.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Providers } from './providers';
import Header from '@/components/Header'; // Header'ı import et

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Asset Wrapper DApp',
  description: 'Wrap and trade your digital assets',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>
          <div className="flex flex-col min-h-screen">
            <Header /> {/* Header'ı buraya ekle */}
            <main className="flex-grow container mx-auto p-4">
              {children}
            </main>
            <footer className="py-4 px-6 bg-gray-700 text-white text-center">
              © {new Date().getFullYear()} Asset Wrapper Inc.
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  );
}