// src/App.tsx

import { ConnectButton } from '@rainbow-me/rainbowkit';
import './App.css';
import WrapForm from './components/WrapForm';
import UnwrapSection from './components/UnwrapSection'; // UnwrapSection'ı import et

function App() {
  return (
    <>
      <header /* ... (header aynı) ... */ >
        <h1>Asset Wrapper</h1>
        <ConnectButton />
      </header>

      <main style={{ padding: '1rem' }}>
        <WrapForm />

        <hr style={{ margin: '2rem 0', border: 0, borderTop: '1px solid #ccc' }} /> {/* Ayırıcı */}

        {/* Unwrap bileşenini buraya ekle */}
        <UnwrapSection />

      </main>

      <footer /* ... (footer aynı) ... */ >
        <p><small>Asset Wrapper Frontend</small></p>
      </footer>
    </>
  );
}

export default App;