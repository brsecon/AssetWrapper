'use client';

import { Dialog, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import AssetWrapperForm from './AssetWrapperForm';

interface WrapAssetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onWrapSuccess: () => void; // Profil sayfasındaki listeyi yenilemek için
  fetchNfts: () => Promise<void>; // fetchNfts prop'u eklendi
}

export default function WrapAssetModal({
  isOpen,
  onClose,
  onWrapSuccess,
  fetchNfts, // Parametre olarak eklendi
}: WrapAssetModalProps) {

  const handleWrapSuccess = () => {
    onWrapSuccess(); // Üst bileşene haber ver (belki fetchNfts burada çağrılabilir)
    // fetchNfts(); // Alternatif olarak doğrudan burada da çağrılabilir
    onClose(); // Modalı kapat
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-3xl transform overflow-hidden rounded-2xl bg-gray-800 text-left align-middle shadow-xl transition-all">
                {/* AssetWrapperForm'u burada kullanıyoruz */}
                <AssetWrapperForm 
                  onWrapSuccess={handleWrapSuccess} 
                  onCloseModal={onClose} 
                />
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
