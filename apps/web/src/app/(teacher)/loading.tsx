/**
 * Se muestra solo dentro del área de contenido: el layout del grupo —barra
 * lateral incluida— queda fuera de este límite y permanece en pantalla. Antes,
 * al no existir un layout compartido, el único límite disponible era el de la
 * raíz y cambiar de sección sustituía la aplicación entera por una portada.
 */
export default function TeacherSectionLoading() {
  return (
    <div className="avend-section-loading" role="status">
      <p className="avend-visually-hidden">Cargando la sección.</p>
      <div aria-hidden="true" className="avend-section-loading-shapes">
        <span className="avend-section-loading-title" />
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
