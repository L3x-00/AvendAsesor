import { NextResponse } from "next/server";
import { resolveAuthorizedAdminApiSession } from "@/lib/admin-api/authorized-client";
import { AdminApiError } from "@/lib/admin-api/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ACCESS_STATES = new Set(["activo", "expirado", "pausado", "por_vencer"]);
const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function safeError(status: number, code: string): NextResponse {
  return NextResponse.json(
    { error: code },
    {
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
      status,
    },
  );
}

/**
 * Streams the directory export. The bearer token stays on the server: the
 * browser only ever talks to this route.
 */
export async function GET(request: Request): Promise<Response> {
  const session = await resolveAuthorizedAdminApiSession();
  if (session.status !== "authorized") {
    return safeError(
      session.status === "unauthenticated" ? 401 : 403,
      "USER_EXPORT_DENIED",
    );
  }

  // The directory is SUPERADMIN-only, and so is its export.
  if (session.access.role !== "superadmin") {
    return safeError(403, "USER_EXPORT_DENIED");
  }

  const url = new URL(request.url);
  const group = url.searchParams.get("group");
  const accessState = url.searchParams.get("accessState");
  const search = url.searchParams.get("search");

  try {
    const workbook = await session.client.exportAdministrativeUsers({
      accessState:
        accessState && ACCESS_STATES.has(accessState)
          ? (accessState as "activo" | "expirado" | "pausado" | "por_vencer")
          : undefined,
      group: group === "staff" || group === "docente" ? group : undefined,
      search: search?.slice(0, 160) ?? undefined,
    });

    return new NextResponse(workbook, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": 'attachment; filename="usuarios-avend.xlsx"',
        "Content-Type": XLSX_MIME,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof AdminApiError) {
      return safeError(error.status === 403 ? 403 : 502, "USER_EXPORT_FAILED");
    }
    return safeError(502, "USER_EXPORT_FAILED");
  }
}
