import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AdminHomeDashboard } from "@/lib/admin-api/types";
import { AdminDashboard } from "./admin-dashboard";
import styles from "./admin-dashboard.module.css";

const moduleNames = [
  "Contratación y desplazamientos",
  "Evaluación docente",
  "Situaciones administrativas",
  "Auxiliar de educación",
  "Ley y reglamento",
  "Cargos y plazas",
  "Remuneraciones",
] as const;

const dashboard: AdminHomeDashboard = {
  activeModules: 7,
  activeSubmodules: 14,
  activeUsers: 21,
  aiQueriesProcessed: 93,
  expiredUsers: 2,
  expiringSoonUsers: 3,
  expiryWindowDays: 7,
  moduleSummaries: moduleNames.map((name, index) => ({
    documentCount: index + 10,
    id: `00000000-0000-4000-8000-00000000000${index + 1}`,
    name,
    submoduleCount: index + 1,
  })),
  totalDocuments: 47,
  totalQueries: 125,
  totalUsers: 26,
};

function sectionNamed(name: string): HTMLElement {
  const heading = screen.getByRole("heading", { level: 2, name });
  const section = heading.closest("section");
  if (!section) throw new Error(`Section not found: ${name}`);
  return section;
}

describe("AdminDashboard", () => {
  it("renders the four database-backed user states in exact order and colors", () => {
    render(<AdminDashboard dashboard={dashboard} />);
    const section = within(sectionNamed("Estado de usuarios"));
    const cards = section.getAllByRole("listitem");

    expect(cards.map((card) => card.firstElementChild?.textContent)).toEqual([
      "Usuarios registrados",
      "Usuarios activos",
      "Por vencer",
      "Expirados",
    ]);
    expect(cards.map((card) => card.children[1]?.textContent)).toEqual([
      "26",
      "21",
      "3",
      "2",
    ]);
    expect(cards[0]).toHaveClass(styles.metricCardRegistered);
    expect(cards[1]).toHaveClass(styles.metricCardActive);
    expect(cards[2]).toHaveClass(styles.metricCardExpiring);
    expect(cards[3]).toHaveClass(styles.metricCardExpired);
    expect(section.getByText("Total de usuarios registrados.")).toBeVisible();
    expect(section.getByText("Usuarios con acceso vigente.")).toBeVisible();
    expect(
      section.getByText("Accesos que vencen en los próximos 7 días."),
    ).toBeVisible();
    expect(section.getByText("Usuarios con acceso vencido.")).toBeVisible();
  });

  it("renders the five general metrics with their required semantics", () => {
    render(<AdminDashboard dashboard={dashboard} />);
    const section = within(
      sectionNamed("Información general de AVEND ASESOR"),
    );
    const cards = section.getAllByRole("listitem");

    expect(cards.map((card) => card.firstElementChild?.textContent)).toEqual([
      "Módulos activos",
      "Submódulos activos",
      "Documentos cargados",
      "Consultas realizadas",
      "Consumo IA",
    ]);
    expect(cards.map((card) => card.children[1]?.textContent)).toEqual([
      "7",
      "14",
      "47",
      "125",
      "93",
    ]);
    expect(
      section.getByText(
        "Total de documentos en la biblioteca, sin filtrar su vigencia.",
      ),
    ).toBeVisible();
    expect(
      section.getByText(
        "Consultas respondidas por el servicio de inteligencia artificial.",
      ),
    ).toBeVisible();
  });

  it("provides the five permanent quick accesses in exact order", () => {
    render(<AdminDashboard dashboard={dashboard} />);
    const section = within(sectionNamed("Accesos rápidos"));
    const links = section.getAllByRole("link");

    expect(links.map((link) => link.firstElementChild?.textContent)).toEqual([
      "Usuarios",
      "Módulos",
      "Historial de documentos",
      "Consultas y reportes",
      "Ver como docente",
    ]);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/admin/users",
      "/admin/modules",
      "/admin/documents",
      "/admin/operations",
      "/chat",
    ]);
    expect(
      section.getByText(
        "Consultar, buscar, visualizar y descargar el historial documental.",
      ),
    ).toBeVisible();
  });

  it("renders exactly seven canonical module cards with real counts and routes", () => {
    render(<AdminDashboard dashboard={dashboard} />);
    const section = within(sectionNamed("Módulos de AVEND ASESOR"));
    const links = section.getAllByRole("link");

    expect(links).toHaveLength(7);
    expect(links.map((link) => link.firstElementChild?.textContent)).toEqual(
      moduleNames,
    );
    links.forEach((link, index) => {
      expect(link).toHaveAttribute(
        "href",
        `/admin/modules/00000000-0000-4000-8000-00000000000${index + 1}`,
      );
      expect(within(link).getByText(String(index + 1))).toBeVisible();
      expect(within(link).getByText(String(index + 10))).toBeVisible();
      expect(within(link).getByText("Submódulos")).toBeVisible();
      expect(within(link).getByText("Documentos")).toBeVisible();
    });
  });

  it("keeps incidents and review work completely outside Inicio", () => {
    render(<AdminDashboard dashboard={dashboard} />);
    const prohibited = [
      /falta de sustento/i,
      /posibles respuestas incorrectas/i,
      /consultas pendientes/i,
      /consultas por revisar/i,
      /reportes sin atender/i,
      /sugerencias pendientes/i,
      /contradicciones documentales/i,
      /casos en proceso/i,
      /ingestas? en proceso/i,
      /requiere atención/i,
    ];

    prohibited.forEach((pattern) => {
      expect(screen.queryByText(pattern)).not.toBeInTheDocument();
    });
  });

  it("keeps the required vertical reading order and represents zero-value data", () => {
    const { container } = render(
      <AdminDashboard
        dashboard={{
          ...dashboard,
          activeSubmodules: 0,
          aiQueriesProcessed: 0,
          expiredUsers: 0,
          expiringSoonUsers: 0,
          moduleSummaries: dashboard.moduleSummaries.map((module) => ({
            ...module,
            documentCount: 0,
            submoduleCount: 0,
          })),
          totalDocuments: 0,
          totalQueries: 0,
        }}
      />,
    );
    const sectionHeadings = Array.from(
      container.querySelectorAll("section > h2"),
    ).map((heading) => heading.textContent);

    expect(sectionHeadings).toEqual([
      "Estado de usuarios",
      "Información general de AVEND ASESOR",
      "Accesos rápidos",
      "Módulos de AVEND ASESOR",
    ]);
    expect(screen.getAllByText("0").length).toBeGreaterThan(5);
  });
});
