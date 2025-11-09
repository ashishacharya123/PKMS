import { useState, useCallback } from 'react';

export interface ModalOptions {
  onOpen?: () => void;
  onClose?: () => void;
}

// Add generic for modal data
export function useModal<T = unknown, D = Record<string, unknown>>(options: ModalOptions = {}) {
  const { onOpen, onClose } = options;

  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [selectedItem, setSelectedItem] = useState<T | null>(null);
  const [modalData, setModalData] = useState<D | null>(null);

  const openModal = useCallback((item?: T, data?: D) => {
    setSelectedItem(item ?? null);
    setModalData(data ?? null);
    setIsOpen(true);
    onOpen?.();
  }, [onOpen]);

  const closeModal = useCallback(() => {
    setIsOpen(false);
    setSelectedItem(null);
    setModalData(null);
    onClose?.();
  }, [onClose]);

  const updateModalData = useCallback((data: D) => {
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


