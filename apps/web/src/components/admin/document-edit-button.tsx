"use client";

import { OPEN_DOCUMENT_EDIT_EVENT } from "./document-edit-section";
import styles from "./document-detail-actions.module.css";

export function DocumentEditButton() {
  return (
    <button
      aria-controls="document-edit-dialog"
      aria-haspopup="dialog"
      className={`${styles.tabButton} ${styles.tabActive}`}
      onClick={() => window.dispatchEvent(new Event(OPEN_DOCUMENT_EDIT_EVENT))}
      type="button"
    >
      <span aria-hidden="true" className={styles.tabIcon}>
        <svg viewBox="0 0 24 24">
          <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z" />
          <path d="m13.5 6.5 4 4" />
        </svg>
      </span>
      Editar documento
    </button>
  );
}
