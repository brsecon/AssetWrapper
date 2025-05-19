// src/app/page.tsx

import Link from 'next/link'; // Next.js'in Link bileşenini navigasyon için import ediyoruz

// Bu bileşen ŞİMDİLİK HİÇBİR client-side hook KULLANMIYOR.
// Bu yüzden en başına 'use client'; direktifine İHTİYACI YOKTUR.
// Amacımız, projenin en azından ana sayfayı hatasız açabilmesini sağlamak.

export default function HomePage() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '80vh', // Sayfanın en azından görünür alan kadar olmasını sağlar
      padding: '20px',
      fontFamily: 'Arial, sans-serif',
      textAlign: 'center'
    }}>
      <header style={{ marginBottom: '40px' }}>
        <h1 style={{ fontSize: '2.5rem', color: '#333' }}>
          Asset Wrapper DApp'e Hoş Geldiniz!
        </h1>
        <p style={{ fontSize: '1.2rem', color: '#555', marginTop: '10px' }}>
          Dijital varlıklarınızı kolayca paketleyin, açın ve ticaretini yapın.
        </p>
      </header>

      <nav style={{ display: 'flex', gap: '20px', marginBottom: '40px' }}>
        <Link href="/wrap" legacyBehavior>
          <a style={{
            padding: '12px 25px',
            backgroundColor: '#007bff',
            color: 'white',
            textDecoration: 'none',
            borderRadius: '5px',
            fontSize: '1rem',
            fontWeight: 'bold',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}>
            Varlık Paketle
          </a>
        </Link>
        <Link href="/marketplace" legacyBehavior>
          <a style={{
            padding: '12px 25px',
            backgroundColor: '#28a745',
            color: 'white',
            textDecoration: 'none',
            borderRadius: '5px',
            fontSize: '1rem',
            fontWeight: 'bold',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}>
            Pazar Yerini Keşfet
          </a>
        </Link>
        <Link href="/my-assets" legacyBehavior>
          <a style={{
            padding: '12px 25px',
            backgroundColor: '#ffc107',
            color: '#212529',
            textDecoration: 'none',
            borderRadius: '5px',
            fontSize: '1rem',
            fontWeight: 'bold',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}>
            Varlıklarım
          </a>
        </Link>
      </nav>

      <section>
        <h2 style={{ fontSize: '1.8rem', color: '#333', marginBottom: '15px' }}>
          Neden Asset Wrapper?
        </h2>
        <ul style={{ listStyle: 'none', padding: '0', maxWidth: '600px', margin: '0 auto' }}>
          <li style={{ fontSize: '1.1rem', color: '#555', marginBottom: '10px' }}>
            ✓ Birden fazla token türünü (ERC20, ERC721, ERC1155) tek bir NFT altında toplayın.
          </li>
          <li style={{ fontSize: '1.1rem', color: '#555', marginBottom: '10px' }}>
            ✓ Karmaşık portföyleri basitleştirin ve kolayca transfer edin.
          </li>
          <li style={{ fontSize: '1.1rem', color: '#555', marginBottom: '10px' }}>
            ✓ Paketlediğiniz varlıkları pazar yerimizde güvenle alıp satın.
          </li>
        </ul>
      </section>
    </div>
  );
}