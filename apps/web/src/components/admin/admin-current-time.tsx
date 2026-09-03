"use client";

import { useEffect, useState } from "react";
import styles from "./admin-dashboard.module.css";

const ADMIN_TIME_ZONE = "America/Lima";

const timeFormatter = new Intl.DateTimeFormat("es-PE", {
  hour: "numeric",
  hour12: true,
  minute: "2-digit",
  second: "2-digit",
  timeZone: ADMIN_TIME_ZONE,
});

const dateFormatter = new Intl.DateTimeFormat("es-PE", {
  day: "numeric",
  month: "long",
  timeZone: ADMIN_TIME_ZONE,
  weekday: "long",
  year: "numeric",
});

function formatDayPeriod(value: string): string {
  return value.toLocaleLowerCase("es-PE").startsWith("a")
    ? "a. m."
    : "p. m.";
}

export function formatAdminTime(date: Date): string {
  const parts = new Map(
    timeFormatter
      .formatToParts(date)
      .map((part) => [part.type, part.value] as const),
  );

  return `${parts.get("hour")}:${parts.get("minute")}:${parts.get("second")} ${formatDayPeriod(parts.get("dayPeriod") ?? "a")}`;
}

export function formatAdminDate(date: Date): string {
  const value = dateFormatter.format(date).replace(/^\p{Ll}/u, (letter) =>
    letter.toLocaleUpperCase("es-PE"),
  );

  return value;
}

export function AdminCurrentTime({ initialNow }: { initialNow: string }) {
  const [now, setNow] = useState(() => new Date(initialNow));

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(new Date()), 1_000);
    return () => window.clearInterval(intervalId);
  }, []);

  const time = formatAdminTime(now);
  const date = formatAdminDate(now);

  return (
    <time
      className={styles.currentTime}
      dateTime={now.toISOString()}
    >
      <span className={styles.currentTimeClock}>{time}</span>
      <span aria-hidden="true" className={styles.currentTimeSeparator}>
        |
      </span>
      <span>{date}</span>
    </time>
  );
}
