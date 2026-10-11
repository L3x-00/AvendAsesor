"use client";

import { toDateInputValue } from "@/lib/admin-api/access-window";
import styles from "./users-manager.module.css";

const accessDayFormatter = new Intl.DateTimeFormat("es-PE", {
  dateStyle: "medium",
  timeZone: "America/Lima",
});

/**
 * Fecha fin resultante de sumar meses al día de hoy (Lima). El día llega del
 * servidor para que el cálculo coincida entre servidor y navegador.
 */
export function quickValidity(
  today: string,
  months: number,
): { expiresAt: string; label: string; startAt: string } {
  const base = new Date(`${today}T12:00:00.000Z`);
  const year = base.getUTCFullYear();
  const month = base.getUTCMonth() + months;
  const lastDayOfTargetMonth = new Date(
    Date.UTC(year, month + 1, 0),
  ).getUTCDate();
  const target = new Date(
    Date.UTC(
      year,
      month,
      Math.min(base.getUTCDate(), lastDayOfTargetMonth),
      12,
    ),
  );
  return {
    expiresAt: toDateInputValue(target.toISOString()),
    label: accessDayFormatter.format(target),
    startAt: toDateInputValue(base.toISOString()),
  };
}

/** Atajos de vigencia de 3, 6 y 12 meses para las altas y las extensiones. */
export function QuickValidityButtons({
  onApply,
}: {
  onApply: (months: number) => void;
}) {
  return (
    <div
      aria-label="Vigencias rápidas"
      className={styles.validityButtons}
      role="group"
    >
      {[3, 6, 12].map((months) => (
        <button
          className={styles.validityButton}
          key={months}
          onClick={() => onApply(months)}
          type="button"
        >
          {months} meses
        </button>
      ))}
    </div>
  );
}
