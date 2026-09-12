"use client";

import { useEffect, useRef, type ReactNode } from "react";

interface DocumentEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function DocumentEditModal({
  isOpen,
  onClose,
  children,
}: DocumentEditModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.showModal();
    } else {
      dialogRef.current?.close();
    }
  }, [isOpen]);

  const handleBackdropClick = (
    e: React.MouseEvent<HTMLDialogElement>,
  ) => {
    if (e.target === dialogRef.current) {
      onClose();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="fixed inset-0 max-h-screen max-w-2xl p-4 rounded-xl backdrop:bg-black/50"
      onClose={onClose}
      onClick={handleBackdropClick}
    >
      <div className="relative max-h-[calc(100vh-2rem)] overflow-y-auto rounded-xl bg-avend-surface">
        <div className="sticky top-0 flex items-center justify-between border-b border-avend-border bg-avend-surface p-4">
          <h2 className="text-xl font-bold">Editar datos del documento</h2>
          <button
            className="ml-auto inline-flex items-center justify-center rounded-md p-2 text-avend-text-muted hover:bg-avend-soft-blue"
            onClick={onClose}
            type="button"
          >
            <span className="sr-only">Cerrar</span>
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                d="M6 18L18 6M6 6l12 12"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
              />
            </svg>
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </dialog>
  );
}
