// src/App.tsx
import React from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi'; // Profil linkini göstermek için

import './App.css'; // Ana stiller
import HomePage from './pages/HomePage';
import ProfilePage from './pages/ProfilePage';
// Gerekirse diğer sayfalar import edilir
// import UnwrapPage from './pages/UnwrapPage'; // Örneğin

// Basit bir Navigasyon Bileşeni
function Navbar() {
    const { isConnected } = useAccount();
    const location = useLocation(); // Aktif linki belirlemek için

    const linkStyle = (path: string): React.CSSProperties => ({
        margin: '0 var(--spacing-md)',
        padding: 'var(--spacing-sm) 0',
        textDecoration: 'none',
        fontWeight: location.pathname === path ? 'bold' : 'normal',
        color: location.pathname === path ? 'var(--color-primary)' : 'var(--color-text)',
        borderBottom: location.pathname === path ? '2px solid var(--color-primary)' : '2px solid transparent',
        transition: 'var(--transition-base)',
    });

    return (
        <nav style={{ marginBottom: 'var(--spacing-md)', paddingBottom: 'var(--spacing-md)' }}>
            <Link to="/" style={linkStyle('/')}>Ana Sayfa</Link>
            {isConnected && (
                <Link to="/profile" style={linkStyle('/profile')}>Profil</Link>
            )}
            {/* Başka linkler eklenebilir */}
        </nav>
    );
}


function App() {
  return (
    <BrowserRouter> {/* Yönlendiriciyi başlat */}
        <>
          <header className="app-header">
            <h1 style={{ cursor: 'pointer' }} onClick={() => window.location.href='/'}>Asset Wrapper</h1> {/* Ana sayfaya link */}
            <div>
                 <Navbar /> {/* Navigasyon menüsü */}
                 <ConnectButton />
            </div>
          </header>

          {/* Ana içerik alanı - Rotalar burada render edilecek */}
          <main className="app-main">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/profile" element={<ProfilePage />} />
              {/* Başka rotalar eklenebilir, örneğin NFT detay/unwrap sayfası */}
              {/* <Route path="/wrapper/:tokenId" element={<UnwrapPage />} /> */}
              {/* 404 Not Found sayfası eklenebilir */}
              {/* <Route path="*" element={<NotFoundPage />} /> */}
            </Routes>
          </main>

          <footer className="app-footer">
            <p><small>Asset Wrapper Frontend</small></p>
          </footer>
        </>
    </BrowserRouter>
  );
}

export default App;