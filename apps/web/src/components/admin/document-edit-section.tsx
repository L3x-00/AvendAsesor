"use client";

import { type ReactNode, useEffect, useRef } from "react";

interface DocumentEditSectionProps {
  children: ReactNode;
  id?: string;
}

export function DocumentEditSection({
  children,
  id,
}: DocumentEditSectionProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    // El lápiz de la biblioteca enlaza a `#edit-document`: un <details> no se
    // abre solo con el ancla, así que se abre y se lleva a la vista aquí.
    if (!id || window.location.hash !== `#${id}`) return;
    const details = detailsRef.current;
    if (!details) return;
    details.open = true;
    details.scrollIntoView?.({ block: "start" });
  }, [id]);

  return (
    <details
      className="mt-5 rounded-lg border border-avend-border p-4 md:p-5"
      id={id}
      ref={detailsRef}
    >
      <summary className="cursor-pointer text-base font-bold">
        Editar datos del documento
      </summary>
      <div className="mt-4">{children}</div>
    </details>
  );
}
