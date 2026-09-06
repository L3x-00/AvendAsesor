/**
 * El chat renderiza su propio `TeacherShell` desde `ChatPanel`, porque su barra
 * lateral es interactiva (cambiar de módulo no navega: conserva el estado de la
 * conversación). Por eso no vive en el grupo `(teacher)` y necesita su propio
 * límite de carga: sin él caía en el de la raíz, que sustituye la pantalla
 * entera por una portada.
 *
 * Reutiliza las clases reales del marco para que la geometría coincida y el
 * paso a la vista definitiva no desplace nada.
 */
export default function ChatLoading() {
  return (
    <div className="avend-teacher-shell" role="status">
      <p className="avend-visually-hidden">Preparando el chat.</p>
      <aside aria-hidden="true" className="avend-teacher-sidebar">
        <span className="avend-sidebar-loading-logo" />
        <div className="avend-sidebar-loading-links">
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
      </aside>
      <main className="avend-teacher-main">
        <div aria-hidden="true" className="avend-section-loading-shapes">
          <span className="avend-section-loading-title" />
          <span />
          <span />
          <span />
        </div>
      </main>
    </div>
  );
}
