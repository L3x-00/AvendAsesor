import { BrandLogo } from "@/components/ui/brand-logo";

/**
 * Reserva la estructura de la pantalla durante una navegación de servidor.
 * No consulta datos ni altera los límites de autorización de cada ruta.
 */
export default function Loading() {
  return (
    <main
      aria-busy="true"
      aria-live="polite"
      className="avend-route-loading"
      role="status"
    >
      <section className="avend-route-loading-card">
        <BrandLogo className="avend-route-loading-logo" priority />
        <p className="avend-eyebrow">AVEND ASESOR</p>
        <h1>Preparando tu espacio de trabajo</h1>
        <p>
          Estamos organizando la información necesaria para mostrarte una vista
          segura y actualizada.
        </p>
        <div aria-hidden="true" className="avend-route-loading-lines">
          <span />
          <span />
          <span />
        </div>
      </section>
    </main>
  );
}
