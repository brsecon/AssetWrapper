// src/components/Header.tsx
'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import Link from 'next/link';

export default function Header() {
  return (
    <header className="py-4 px-6 bg-gray-800 text-white shadow-md">
      <div className="container mx-auto flex justify-between items-center">
        <Link href="/" className="text-2xl font-bold">
          AssetWrapper
        </Link>
        <nav className="space-x-4">
          <Link href="/wrap" className="hover:text-gray-300">
            Wrap Assets
          </Link>
          <Link href="/marketplace" className="hover:text-gray-300">
            Marketplace
          </Link>
          <Link href="/my-assets" className="hover:text-gray-300">
            My Assets
          </Link>
        </nav>
        <ConnectButton />
      </div>
    </header>
  );
}