"use client";

import { type ReactNode } from "react";

interface DocumentEditSectionProps {
  children: ReactNode;
  id?: string;
}

export function DocumentEditSection({
  children,
  id,
}: DocumentEditSectionProps) {
  return (
    <details className="mt-5 rounded-lg border border-avend-border p-4 md:p-5" id={id}>
      <summary className="cursor-pointer text-base font-bold">
        Editar datos del documento
      </summary>
      <div className="mt-4">{children}</div>
    </details>
  );
}
