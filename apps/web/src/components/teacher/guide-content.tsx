import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./guide-content.module.css";

interface GuideStep {
  icon: ReactNode;
  text: string;
  title: string;
}

const iconProps = {
  "aria-hidden": true,
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  strokeWidth: 1.8,
  viewBox: "0 0 24 24",
} as const;

const STEPS: GuideStep[] = [
  {
    icon: (
      <svg {...iconProps}>
        <rect height="7" rx="1.5" width="7" x="3.5" y="3.5" />
        <rect height="7" rx="1.5" width="7" x="13.5" y="3.5" />
        <rect height="7" rx="1.5" width="7" x="3.5" y="13.5" />
        <path d="M17 13.5v7M13.5 17h7" />
      </svg>
    ),
    text: "Puedes elegir un módulo del menú para ubicar el tema, o escribir directamente: el asistente reconoce de qué trata tu consulta.",
    title: "Elige un tema, si lo deseas",
  },
  {
    icon: (
      <svg {...iconProps}>
        <path d="M5 5h14v10H9l-4 4V5Z" />
        <path d="M9 9h6M9 12h4" />
      </svg>
    ),
    text: "Cuenta tu situación con tus palabras: si eres docente, auxiliar o directivo, y qué trámite necesitas. También puedes dictarla con el botón de voz.",
    title: "Escribe o dicta tu consulta",
  },
  {
    icon: (
      <svg {...iconProps}>
        <circle cx="11" cy="11" r="6.5" />
        <path d="m16 16 4 4" />
      </svg>
    ),
    text: "Verás al asistente trabajando mientras busca en los documentos oficiales disponibles. Si no encuentra sustento, te lo dice en lugar de adivinar.",
    title: "El asistente busca en los documentos",
  },
  {
    icon: (
      <svg {...iconProps}>
        <path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10.5a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5Z" />
        <path d="M14 3.5V8h4M9 12.5h6M9 16h4" />
      </svg>
    ),
    text: "Cada respuesta respaldada muestra sus referencias debajo. Ábrelas para leer el documento exacto de donde sale la información.",
    title: "Revisa el sustento",
  },
  {
    icon: (
      <svg {...iconProps}>
        <path d="M4 12a8 8 0 1 0 2.4-5.7" />
        <path d="M4 4v4h4M12 8v4l2.5 2" />
      </svg>
    ),
    text: "Tus conversaciones quedan en el Historial, visibles solo desde tu cuenta. Desde una respuesta también puedes preparar una ficha de orientación.",
    title: "Continúa cuando quieras",
  },
];

const CAN_DO = [
  "Orientarte sobre procesos, requisitos, plazos, derechos y trámites del ámbito educativo.",
  "Mostrarte de qué documento sale cada respuesta.",
  "Guardar tus consultas para retomarlas más tarde.",
];

const WILL_NOT = [
  "Inventar una respuesta: si no hay sustento, te lo dirá.",
  "Responder temas ajenos al ámbito educativo.",
  "Mostrar tus conversaciones a otros docentes.",
];

/**
 * Contenido de la Guía de uso: presenta qué es AVEND ASESOR, cómo usarlo en
 * cinco pasos y su alcance. Sin lógica de acceso: la ruta la revalida.
 */
export function GuideContent() {
  return (
    <article aria-labelledby="guide-title" className="avend-content-page">
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className="avend-eyebrow">Guía de uso</p>
          <h1 id="guide-title">Conoce a AVEND ASESOR</h1>
          <p>
            Es tu asistente de consulta para el ámbito educativo. Responde con
            base en los documentos oficiales disponibles en la plataforma y te
            muestra de dónde sale cada respuesta.
          </p>
          <Link className="avend-button avend-button--primary" href="/chat">
            Hacer una consulta
          </Link>
        </div>

        {/* Vista previa ilustrativa de una conversación: se reproduce una sola
            vez al abrir la guía y queda quieta. */}
        <div aria-hidden="true" className={styles.preview}>
          <div className={`${styles.bubble} ${styles.bubbleUser}`}>
            ¿Qué requisitos necesito para mi trámite?
          </div>
          <div className={styles.thinking}>
            <span />
            <span />
            <span />
            <em>Buscando en los documentos</em>
          </div>
          <div className={`${styles.bubble} ${styles.bubbleAssistant}`}>
            <strong>AVEND ASESOR</strong>
            <span className={styles.line} />
            <span className={styles.line} />
            <span className={`${styles.line} ${styles.lineShort}`} />
            <span className={styles.source}>Referencia · Documento oficial</span>
          </div>
        </div>
      </header>

      <section aria-labelledby="guide-steps-title" className={styles.section}>
        <h2 id="guide-steps-title">Cómo usarlo, en cinco pasos</h2>
        <ol className={styles.steps}>
          {STEPS.map((step, index) => (
            <li
              className={styles.step}
              key={step.title}
              style={{ animationDelay: `${120 + index * 90}ms` }}
            >
              <span className={styles.stepNumber}>{index + 1}</span>
              <span className={styles.stepIcon}>{step.icon}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-label="Alcance del asistente" className={styles.scope}>
        <div className={`${styles.scopeCard} ${styles.scopeYes}`}>
          <h2>Lo que puede hacer por ti</h2>
          <ul>
            {CAN_DO.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div className={`${styles.scopeCard} ${styles.scopeNo}`}>
          <h2>Lo que no hará</h2>
          <ul>
            {WILL_NOT.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </section>

      <aside aria-labelledby="guide-tip-title" className={styles.tip}>
        <h2 id="guide-tip-title">Consejo para mejores respuestas</h2>
        <p>
          Cuanto más concreta sea tu consulta, más precisa será la respuesta.
          Por ejemplo, en lugar de «licencias», pregunta «¿cuántos días de
          licencia por maternidad le corresponden a una docente nombrada?».
          Evita compartir datos personales que no sean necesarios.
        </p>
      </aside>
    </article>
  );
}
