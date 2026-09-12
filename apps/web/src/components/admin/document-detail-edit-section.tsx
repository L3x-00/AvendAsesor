"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { DocumentEditModal } from "./document-edit-modal";

interface DocumentDetailEditSectionProps {
  children: ReactNode;
  id?: string;
}

export function DocumentDetailEditSection({
  children,
  id,
}: DocumentDetailEditSectionProps) {
  const searchParams = useSearchParams();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted) return;
    setIsModalOpen(searchParams.get("edit") === "1");
  }, [searchParams, isMounted]);

  const handleClose = () => {
    setIsModalOpen(false);
    const url = new URL(window.location.href);
    url.searchParams.delete("edit");
    window.history.replaceState({}, "", url.toString());
  };

  if (!isMounted) {
    return null;
  }

  return (
    <>
      <DocumentEditModal isOpen={isModalOpen} onClose={handleClose}>
        {children}
      </DocumentEditModal>
    </>
  );
}
