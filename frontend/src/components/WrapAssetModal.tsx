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
  fetchNfts,
}: WrapAssetModalProps) {

  const handleWrapSuccess = () => {
    onWrapSuccess(); 
    onClose(); // Close modal on successful wrap
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog
        as="div"
        className="relative z-50"
        static // Keep static to indicate manual close management
        onClose={() => {
          // With static, Headless UI should not call this for backdrop clicks.
          // It will call this for the ESC key.
          // To prevent ESC from closing, we do nothing here.
          // If you want ESC to close, call `onClose()` here.
          console.log('WrapAssetModal Dialog onClose triggered (e.g., by ESC key). Modal will not close unless explicitly told.');
        }}
      >
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
              <Dialog.Panel className="w-full max-w-3xl transform overflow-hidden rounded-2xl bg-gray-800 p-6 text-left align-middle shadow-xl transition-all relative">
                <Dialog.Title
                  as="h3"
                  className="text-xl font-semibold leading-6 text-purple-200 mb-6"
                >
                  Yeni Varlık Paketi Oluştur
                </Dialog.Title>
                
                <button
                  type="button"
                  onClick={onClose} // Call the original onClose from ProfilePage
                  className="absolute top-5 right-5 text-gray-400 hover:text-gray-200 p-1 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500"
                  aria-label="Kapat"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>

                <AssetWrapperForm 
                  onWrapSuccess={handleWrapSuccess} 
                  onCloseModal={onClose} // Pass the original onClose for the form to use if needed
                />
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
