import Image from "next/image";
import { ConnectButton } from '@rainbow-me/rainbowkit'; 
import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 text-white flex flex-col font-[family-name:var(--font-geist-sans)]">
      {/* Header */}
      <header className="py-6 px-4 sm:px-8 flex justify-between items-center w-full">
        <div className="text-2xl font-bold">
          <Link href="/">AssetWrapper</Link>
        </div>
        <div className="flex items-center gap-4">
          <ConnectButton />
          <Link href="/profile" className="hidden sm:block px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors">
            Profilim
          </Link>
        </div>
      </header>

      {/* Main Content - Hero Section */}
      <main className="flex-grow flex flex-col items-center justify-center text-center p-4">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-5xl sm:text-6xl md:text-7xl font-extrabold mb-6 leading-tight">
            Dijital Varlıklarınızı
            <span className="block bg-clip-text text-transparent bg-gradient-to-r from-purple-400 via-pink-500 to-red-500 mt-2">
              Yeniden Şekillendirin
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-gray-300 mb-10 max-w-xl mx-auto">
            AssetWrapper, NFT'lerinizi ve diğer dijital hazinelerinizi güvenle birleştirip yönetmenizi sağlar. Varlıklarınızın gerçek potansiyelini keşfedin ve portföyünüzü kolayca organize edin.
          </p>
          <div className="flex flex-col sm:flex-row justify-center items-center gap-4">
            <Link 
              href="/profile" 
              className="px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-bold rounded-lg text-xl shadow-xl transition-all duration-300 ease-in-out transform hover:scale-105"
            >
              Hemen Başla
            </Link>
            <Link 
              href="#learn-more" // Örnek: Daha fazla bilgi bölümüne link
              className="px-8 py-4 bg-gray-700 hover:bg-gray-600 text-gray-200 font-semibold rounded-lg text-xl shadow-lg transition-colors"
            >
              Daha Fazla Bilgi
            </Link>
          </div>
        </div>
      </main>

      {/* Optional: Learn More Section (Placeholder) */}
      <section id="learn-more" className="py-16 bg-gray-800/50 backdrop-blur-md">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-8">AssetWrapper Nasıl Çalışır?</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-gray-700/70 p-6 rounded-lg shadow-lg">
              <h3 className="text-xl font-semibold mb-3 text-purple-300">1. Varlıklarınızı Seçin</h3>
              <p className="text-gray-300">Paketlemek istediğiniz NFT'leri ve diğer uyumlu dijital varlıkları kolayca seçin.</p>
            </div>
            <div className="bg-gray-700/70 p-6 rounded-lg shadow-lg">
              <h3 className="text-xl font-semibold mb-3 text-purple-300">2. Tek Tıkla Paketleyin</h3>
              <p className="text-gray-300">Seçtiğiniz varlıkları güvenli bir şekilde tek bir NFT paketine dönüştürün.</p>
            </div>
            <div className="bg-gray-700/70 p-6 rounded-lg shadow-lg">
              <h3 className="text-xl font-semibold mb-3 text-purple-300">3. Kolayca Yönetin</h3>
              <p className="text-gray-300">Oluşturduğunuz paketleri profil sayfanızdan görüntüleyin ve yönetin.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 text-center text-gray-400 border-t border-gray-700">
        <p>&copy; {new Date().getFullYear()} AssetWrapper. Tüm hakları saklıdır.</p>
        <div className="mt-2">
          <a href="https://vercel.com?utm_source=assetwrapper&utm_medium=footer&utm_campaign=deployment" target="_blank" rel="noopener noreferrer" className="inline-block mx-2 hover:text-purple-300 transition-colors">
            Vercel ile Dağıtıldı
          </a>
          <span className="mx-1">|</span>
          <a href="https://nextjs.org?utm_source=assetwrapper&utm_medium=footer&utm_campaign=framework" target="_blank" rel="noopener noreferrer" className="inline-block mx-2 hover:text-purple-300 transition-colors">
            Next.js ile Güçlendirildi
          </a>
        </div>
        <div className="fixed bottom-0 left-0 flex h-12 w-full items-end justify-center bg-gradient-to-t from-white via-white dark:from-black dark:via-black lg:static lg:size-auto lg:bg-none print:hidden">
          <a
            className="pointer-events-none flex place-items-center gap-2 p-8 lg:pointer-events-auto lg:p-0"
            href="https://vercel.com?utm_source=create-next-app&utm_medium=appdir-template&utm_campaign=create-next-app"
            target="_blank"
            rel="noopener noreferrer"
          >
            By{' '}
            <Image
              src="/vercel.svg"
              alt="Vercel Logo"
              className="dark:invert"
              width={100}
              height={24}
              priority
            />
          </a>
        </div>
      </footer>
    </div>
  );
}
