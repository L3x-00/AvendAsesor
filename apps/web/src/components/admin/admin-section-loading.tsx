/**
 * Esqueleto de una sección administrativa mientras el servidor responde.
 *
 * Se renderiza dentro del layout del panel, así que la barra lateral queda
 * fuera de este límite y permanece en pantalla. Antes no existía ese layout: el
 * único límite disponible ocupaba la ventana entera y cada cambio de sección
 * parecía un arranque en frío de la aplicación.
 *
 * El mensaje concreto se anuncia a los lectores de pantalla; las formas son
 * decorativas y reservan el sitio para que la llegada del contenido no desplace
 * la vista.
 */
export function AdminSectionLoading({ label }: { label: string }) {
  return (
    <div className="avend-admin-section-loading" role="status">
      <p className="avend-visually-hidden">{label}</p>
      <div aria-hidden="true" className="avend-admin-section-loading-header">
        <span className="avend-admin-section-loading-title" />
        <span className="avend-admin-section-loading-subtitle" />
      </div>
      <div aria-hidden="true" className="avend-admin-section-loading-body">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
