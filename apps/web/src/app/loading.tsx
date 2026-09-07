/**
 * Reserva la estructura de la pantalla durante una navegación de servidor.
 * No consulta datos ni altera los límites de autorización de cada ruta.
 *
 * Cubre la entrada a la aplicación (`/`, `/auth/*`, `/access-denied`). Las
 * secciones del docente y del panel tienen sus propios límites acotados, así
 * que ya no caen aquí: cambiar de sección no debe parecer un arranque en frío.
 *
 * Ya no incluye el logotipo. Es un `.webp` de 191 KB y, mientras no terminaba
 * de descargarse, el navegador pintaba su texto alternativo —«AVEND ASESOR»—
 * junto al rótulo de abajo, de modo que la marca aparecía repetida.
 */
export default function Loading() {
  return (
    <main aria-busy="true" className="avend-route-loading">
      <section
        aria-atomic="true"
        aria-live="polite"
        className="avend-route-loading-card"
        role="status"
      >
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
