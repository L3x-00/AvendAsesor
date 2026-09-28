import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminPage } from "@/components/admin/admin-page";
import { AdminActionForm } from "@/components/admin/admin-action-form";
import { resolveUnansweredGroupAction } from "@/app/admin/operations/consultation-actions";
import { createAuthorizedConsultationReportsApiContext } from "@/lib/consultation-reports-api/authorized-client";
import {
  consultationPeriodSchema,
  type UnansweredGroup,
} from "@/lib/consultation-reports-api/types";

type SearchValue = string | string[] | undefined;
const MAX_GROUP_CLOSE = 50;

function one(value: SearchValue): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function title(group: UnansweredGroup): string {
  if (group.kind === "catalog") return "Preguntas sobre documentos";
  if (!group.moduleName) return "Sin tema identificado";
  return group.parentModuleName
    ? `${group.parentModuleName} › ${group.moduleName}`
    : group.moduleName;
}

export default async function CloseUnansweredGroupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, SearchValue>>;
}) {
  const requested = await searchParams;
  const parsedPeriod = consultationPeriodSchema.safeParse(one(requested.period));
  const kind = one(requested.kind);
  const moduleId = one(requested.moduleId) ?? null;
  if (
    !parsedPeriod.success ||
    !["catalog", "topic", "unknown"].includes(kind ?? "") ||
    (moduleId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(moduleId))
  ) {
    notFound();
  }

  const period = parsedPeriod.data;
  const { client } = await createAuthorizedConsultationReportsApiContext();
  // Se vuelve a leer el grupo en el servidor: la URL no aporta IDs de casos.
  const groups = await client.getUnansweredGroups(period);
  const group = groups.find(
    (item) => item.kind === kind && (item.moduleId ?? null) === moduleId,
  );
  const backHref = `/admin/operations?${new URLSearchParams({ period, vista: "consultar" })}`;

  return (
    <AdminPage
      description="Revisa el resultado y deja una nota antes de cerrar las consultas."
      title="Cerrar consultas"
    >
      <main className="mx-auto max-w-3xl space-y-6 text-base">
        <Link className="avend-text-link" href={backHref}>
          ← Volver a Consultar
        </Link>
        {!group || group.caseIds.length === 0 ? (
          <p role="status">Este grupo ya no tiene consultas pendientes.</p>
        ) : (
          <section className="space-y-4 rounded-lg border border-avend-border p-4">
            <h2 className="text-xl font-bold">{title(group)}</h2>
            <p>
              Se revisarán {Math.min(group.caseIds.length, MAX_GROUP_CLOSE)} de {group.count} consultas del
              periodo seleccionado. El servidor comprobará que sigan abiertas
              antes de cerrarlas.
            </p>
            {group.examples.length ? (
              <ul className="list-disc space-y-2 pl-6">
                {group.examples.map((example) => (
                  <li key={example}>«{example}»</li>
                ))}
              </ul>
            ) : null}
            <AdminActionForm
              action={resolveUnansweredGroupAction}
              className="space-y-4"
              rules={{
                note: [
                  { kind: "required", label: "La nota" },
                  { kind: "maxLength", label: "La nota", max: 2000 },
                ],
              }}
              submitLabel={`Cerrar ${Math.min(group.caseIds.length, MAX_GROUP_CLOSE)} consultas`}
            >
              {group.caseIds.slice(0, MAX_GROUP_CLOSE).map((caseId) => (
                <input key={caseId} name="caseId" type="hidden" value={caseId} />
              ))}
              <input name="period" type="hidden" value={period} />
              <label className="block space-y-1" htmlFor="group-close-status">
                <span className="font-semibold">Resultado</span>
                <select
                  className="min-h-11 w-full rounded-md border border-avend-border px-3"
                  defaultValue=""
                  id="group-close-status"
                  name="status"
                  required
                >
                  <option disabled value="">Elige un resultado</option>
                  <option value="resolved">
                    Resuelta: se avisa a cada docente que puede volver a consultar
                  </option>
                  <option value="discarded">
                    Descartada: no se envía aviso al docente
                  </option>
                </select>
              </label>
              <label className="block space-y-1" htmlFor="group-close-note">
                <span className="font-semibold">Nota para el historial de cada caso</span>
                <textarea
                  className="min-h-28 w-full rounded-md border border-avend-border p-3"
                  id="group-close-note"
                  maxLength={2000}
                  name="note"
                  required
                  rows={4}
                />
              </label>
            </AdminActionForm>
          </section>
        )}
      </main>
    </AdminPage>
  );
}
