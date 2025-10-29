import { useState, useCallback } from 'react';

export interface ModalOptions {
  onOpen?: () => void;
  onClose?: () => void;
}

export function useModal<T = any>(options: ModalOptions = {}) {
  const { onOpen, onClose } = options;

  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [selectedItem, setSelectedItem] = useState<T | null>(null);
  const [modalData, setModalData] = useState<any>(null);

  const openModal = useCallback((item?: T, data?: any) => {
    setSelectedItem(item || null);
    setModalData(data || null);
    setIsOpen(true);
    onOpen?.();
  }, [onOpen]);

  const closeModal = useCallback(() => {
    setIsOpen(false);
    setSelectedItem(null);
    setModalData(null);
    onClose?.();
  }, [onClose]);

  const updateModalData = useCallback((data: any) => {
    setModalData(data);
  }, []);

  return {
    isOpen,
    selectedItem,
    modalData,
    openModal,
    closeModal,
    updateModalData,
  };
}


