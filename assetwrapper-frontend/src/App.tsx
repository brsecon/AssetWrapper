// src/App.tsx

import { ConnectButton } from '@rainbow-me/rainbowkit';
import './App.css'; // Vite ile gelen App stilleri
import WrapForm from './components/WrapForm'; // WrapForm bileşenini import et

function App() {
  return (
    <>
      {/* Başlık alanı ve bağlantı butonu */}
      <header style={{
        padding: '1rem',
        display: 'flex',
        justifyContent: 'space-between', // Başlığı ve butonu ayırmak için
        alignItems: 'center',
        borderBottom: '1px solid #eee' // Ayrım çizgisi
      }}>
        <h1>Asset Wrapper</h1>
        <ConnectButton /> {/* RainbowKit Bağlantı Butonu */}
      </header>

      {/* Ana içerik alanı */}
      <main style={{ padding: '1rem' }}>
        {/* WrapForm bileşenini burada çağırıyoruz */}
        <WrapForm />

        {/* İstersen altına veya üstüne başka içerikler ekleyebilirsin */}
        <hr style={{ margin: '2rem 0' }} /> {/* Görsel ayırıcı */}
        {/* Buraya belki sahip olunan paketleri listeleyen başka bir bileşen gelir */}

      </main>

      <footer style={{ padding: '1rem', marginTop: '2rem', textAlign: 'center', borderTop: '1px solid #eee' }}>
        <p><small>Asset Wrapper Frontend</small></p>
      </footer>
    </>
  );
}

export default App;