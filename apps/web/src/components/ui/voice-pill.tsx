"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import "./voice-pill.css";

/**
 * Botón de dictado basado en VoicePill de React Bits
 * (https://reactbits.dev, licencia MIT), adaptado a AVEND:
 *
 * - Es CONTROLADO: el estado real lo decide el reconocimiento de voz del
 *   navegador (que puede terminar solo tras una pausa), no el botón.
 * - Se activa con un toque o con Enter/Espacio y se detiene igual o con Esc.
 *   Se omiten "mantener para hablar" y "deslizar para cancelar": exigen un
 *   gesto preciso que no es evidente para nuestro público.
 * - La onda NO abre un segundo micrófono (en Android eso interrumpe el
 *   dictado): late con más fuerza cuando el navegador informa que oye sonido
 *   (`soundActive`) y queda casi plana en silencio.
 * - Sin dependencias de iconos: los glifos son SVG propios.
 */

const LOOP = 4.8;
const SYLLABLES: [number, number, number][] = [
  [0.1, 0.16, 0.9],
  [0.3, 0.12, 0.7],
  [0.5, 0.2, 1],
  [0.95, 0.14, 0.8],
  [1.15, 0.1, 0.6],
  [1.3, 0.22, 0.95],
  [1.9, 0.16, 0.85],
  [2.12, 0.12, 0.7],
  [2.3, 0.18, 0.9],
  [2.55, 0.1, 0.5],
  [3.05, 0.24, 1],
  [3.4, 0.12, 0.75],
  [3.6, 0.16, 0.9],
];
const DT_MAX = 0.05;
const WAVE_EVERY = 4;
const WAVE_MAX = 80;
const ATTACK_MS = 40;
const RELEASE_MS = 240;
const FLOOR = 0.1;
/** En silencio la onda conserva un leve pulso: se ve que sigue escuchando. */
const SILENCE_GAIN = 0.12;

function simulatedLevel(t: number): number {
  const u = t % LOOP;
  let a = 0.06;
  for (const [start, duration, peak] of SYLLABLES) {
    const x = (u - start) / duration;
    if (x >= 0 && x <= 1) {
      a = Math.max(a, peak * 0.5 * (1 - Math.cos(2 * Math.PI * x)));
    }
  }
  return a * (0.7 + 0.3 * Math.abs(Math.sin(2 * Math.PI * 7.1 * u)));
}

interface WaveState {
  acc: number;
  hist: number[];
  tick: number;
}

function drawWave(
  state: WaveState,
  canvas: HTMLCanvasElement,
  level: number,
  color: string,
) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  state.acc = Math.max(state.acc, level);
  state.tick = (state.tick + 1) % WAVE_EVERY;
  if (state.tick === 0) {
    state.hist.push(state.acc);
    state.acc = 0;
    if (state.hist.length > WAVE_MAX) state.hist.shift();
  }
  const barWidth = 2 * dpr;
  const step = 3 * dpr;
  const shift = (state.tick / WAVE_EVERY) * step;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = color;
  for (let i = 0; i < state.hist.length; i += 1) {
    const value = state.hist[state.hist.length - 1 - i];
    const x = width - (i + 1) * step - shift;
    if (x + barWidth < 0) break;
    const barHeight = Math.max(barWidth, (FLOOR + (1 - FLOOR) * value) * height);
    const t = Math.min(1, Math.max(0, (x + barWidth / 2) / (width * 0.55)));
    const fade = t * t * (3 - 2 * t);
    ctx.globalAlpha = (0.35 + 0.65 * value) * fade;
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(x, (height - barHeight) / 2, barWidth, barHeight, barWidth / 2);
    } else {
      ctx.rect(x, (height - barHeight) / 2, barWidth, barHeight);
    }
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function clock(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export interface VoicePillProps {
  accentColor?: string;
  ariaLabel: string;
  background?: string;
  className?: string;
  disabled?: boolean;
  iconColor?: string;
  listening: boolean;
  onToggle: () => void;
  size?: number;
  /** El navegador informa que oye sonido: la onda se anima con fuerza. */
  soundActive?: boolean;
}

export function VoicePill({
  accentColor = "#0d1b3d",
  ariaLabel,
  background = "#e8f1ff",
  className = "",
  disabled = false,
  iconColor = "#0d1b3d",
  listening,
  onToggle,
  size = 44,
  soundActive = false,
}: VoicePillProps) {
  const timeRef = useRef<HTMLSpanElement>(null);
  const waveRef = useRef<HTMLCanvasElement>(null);
  const soundRef = useRef(soundActive);
  const colorRef = useRef(accentColor);

  useEffect(() => {
    soundRef.current = soundActive;
    colorRef.current = accentColor;
  }, [accentColor, soundActive]);

  useEffect(() => {
    if (!listening) return;
    const wave: WaveState = { acc: 0, hist: [], tick: 0 };
    const startedAt = performance.now();
    let last = startedAt;
    let envelope = 0;
    let raf = 0;
    if (timeRef.current) timeRef.current.textContent = "0:00";

    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, DT_MAX);
      last = now;
      const target =
        simulatedLevel((now - startedAt) / 1000) *
        (soundRef.current ? 1 : SILENCE_GAIN);
      const tau = (target > envelope ? ATTACK_MS : RELEASE_MS) / 1000;
      envelope += (target - envelope) * (1 - Math.exp(-dt / tau));
      const text = clock(now - startedAt);
      if (timeRef.current && timeRef.current.textContent !== text) {
        timeRef.current.textContent = text;
      }
      if (waveRef.current) {
        drawWave(wave, waveRef.current, envelope, colorRef.current);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [listening]);

  const radius = size / 2;
  const timeSize = Math.max(13, Math.round(size * 0.34));
  const clockWidth = Math.round(timeSize * 2.5) + 6;
  const waveWidth = Math.round(size * 1.6);
  const extra = clockWidth + waveWidth;

  return (
    <button
      aria-label={ariaLabel}
      aria-pressed={listening}
      className={`voice-pill${className ? ` ${className}` : ""}`}
      data-state={listening ? "listening" : "idle"}
      disabled={disabled}
      onClick={onToggle}
      onKeyDown={(event) => {
        if (event.key === "Escape" && listening) {
          event.preventDefault();
          onToggle();
        }
      }}
      style={
        {
          "--vp-accent": accentColor,
          "--vp-bg": background,
          "--vp-clock-w": `${clockWidth}px`,
          "--vp-extra": `${extra}px`,
          "--vp-icon": iconColor,
          "--vp-icon-size": `${Math.round(size * 0.46)}px`,
          "--vp-radius": `${radius}px`,
          "--vp-reach": "8px",
          "--vp-size": `${size}px`,
          "--vp-stop": `${Math.round(size * 0.3)}px`,
          "--vp-time-size": `${timeSize}px`,
          "--vp-wave-w": `${waveWidth}px`,
        } as CSSProperties
      }
      type="button"
    >
      <span aria-hidden="true" className="voice-pill__capsule" />
      <canvas aria-hidden="true" className="voice-pill__wave" ref={waveRef} />
      <span aria-hidden="true" className="voice-pill__time" ref={timeRef}>
        0:00
      </span>
      <span aria-hidden="true" className="voice-pill__glyph">
        <svg
          className="voice-pill__mic"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
          viewBox="0 0 24 24"
        >
          <rect height="11" rx="3" width="6" x="9" y="3" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
        </svg>
        <span className="voice-pill__stop" />
      </span>
    </button>
  );
}
