// src/pages/HomePage.tsx
import React from 'react';
import { Link } from 'react-router-dom'; // Profil sayfasına link vermek için

function HomePage() {
  return (
    <div className="container">
      <h2 className="section-title">Ana Sayfa</h2>
      <p>Asset Wrapper platformuna hoş geldiniz!</p>
      <p>Burada platform hakkında genel bilgiler veya başka içerikler yer alabilir.</p>
      {/* Örnek profil linki */}
      <p style={{ marginTop: 'var(--spacing-lg)' }}>
        <Link to="/profile">Profil Sayfanıza Gidin</Link>
      </p>
      {/* UnwrapSection'ı buraya koymak istersen: */}
      {/*
      <hr className="section-divider" />
      <UnwrapSection />
      */}
    </div>
  );
}

export default HomePage;