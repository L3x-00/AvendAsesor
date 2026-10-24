"use client";

import { useEffect, useState, type ComponentType } from "react";

type AeroShardsProps = {
  accentColor?: string;
  backgroundColor?: string;
  count?: number;
  depthOfField?: number;
  dpr?: number;
  glow?: number;
  holdToGather?: boolean;
  intro?: boolean;
  lightMode?: boolean;
  markers?: "dots" | "none" | "plus";
  material?: "chrome" | "glass";
  mouseInteraction?: boolean;
  onError?: (error: Error) => void;
  placement?: "center" | "full" | "left" | "right";
  powerPreference?: "high-performance" | "low-power";
  pulseOnClick?: boolean;
  shardColor?: string;
  speed?: number;
  vignette?: number;
};

function canAnimate() {
  return (
    window.isSecureContext &&
    "GPUCanvasContext" in globalThis &&
    "gpu" in navigator &&
    !(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false)
  );
}

/**
 * Fondo puramente decorativo: se carga solo cuando WebGPU está disponible y
 * la persona no ha pedido reducir movimiento. El contenido del chat siempre
 * queda por encima y conserva todos sus controles sin interferencias.
 */
export function ChatAeroShardsBackground() {
  const [AeroShards, setAeroShards] =
    useState<ComponentType<AeroShardsProps> | null>(null);

  useEffect(() => {
    let active = true;
    const reducedMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    );
    const updateAvailability = () => {
      if (!canAnimate()) {
        setAeroShards(null);
        return;
      }

      // No descarga WebGPU ni sus shaders hasta confirmar que este navegador
      // puede mostrarlos y que la persona no ha pedido menos movimiento.
      void import("@/components/AeroShards")
        .then(({ default: Component }) => {
          if (active && canAnimate()) {
            setAeroShards(() => Component as ComponentType<AeroShardsProps>);
          }
        })
        .catch(() => {
          if (active) setAeroShards(null);
        });
    };

    updateAvailability();
    reducedMotion?.addEventListener("change", updateAvailability);
    return () => {
      active = false;
      reducedMotion?.removeEventListener("change", updateAvailability);
    };
  }, []);

  if (!AeroShards) return null;

  return (
    <div aria-hidden="true" className="avend-chat-aero-shards">
      <AeroShards
        accentColor="#77d4ff"
        backgroundColor="transparent"
        count={480}
        depthOfField={0.68}
        dpr={1}
        glow={0.18}
        holdToGather={false}
        intro
        lightMode={false}
        markers="dots"
        material="glass"
        mouseInteraction
        onError={() => setAeroShards(null)}
        placement="full"
        powerPreference="low-power"
        pulseOnClick={false}
        shardColor="#0b3d91"
        speed={0.55}
        vignette={0.2}
      />
    </div>
  );
}
