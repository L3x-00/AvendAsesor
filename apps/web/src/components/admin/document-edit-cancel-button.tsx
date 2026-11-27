"use client";

import { CLOSE_DOCUMENT_EDIT_EVENT } from "./document-edit-section";

export function DocumentEditCancelButton() {
  return (
    <button
      className="avend-button"
      onClick={() =>
        window.dispatchEvent(new Event(CLOSE_DOCUMENT_EDIT_EVENT))
      }
      type="button"
    >
      Cancelar
    </button>
  );
}
