import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveAuthorizedAdminApiSession } from "@/lib/admin-api/authorized-client";
import { AdminApiError, AdminApiResponseError } from "@/lib/admin-api/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const idSchema = z.string().uuid();
const querySchema = z.object({
  disposition: z.enum(["attachment", "inline"]),
  versionId: z.string().uuid().optional(),
});

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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await resolveAuthorizedAdminApiSession();
  if (session.status !== "authorized") {
    return safeError(
      session.status === "unauthenticated" ? 401 : 403,
      "DOCUMENT_ACCESS_DENIED",
    );
  }

  const parsedId = idSchema.safeParse((await params).id);
  if (!parsedId.success) return safeError(404, "DOCUMENT_NOT_AVAILABLE");

  const url = new URL(request.url);
  const parsedQuery = querySchema.safeParse({
    disposition: url.searchParams.get("disposition"),
    versionId: url.searchParams.get("versionId") ?? undefined,
  });
  if (!parsedQuery.success) return safeError(400, "DOCUMENT_ACCESS_INVALID");

  try {
    const access = await session.client.getDownloadUrl(
      parsedId.data,
      parsedQuery.data.versionId,
      parsedQuery.data.disposition,
    );

    if (
      parsedQuery.data.versionId &&
      access.versionId !== parsedQuery.data.versionId
    ) {
      return safeError(502, "DOCUMENT_ACCESS_INVALID");
    }

    const response = NextResponse.redirect(access.url, 307);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("X-Content-Type-Options", "nosniff");
    return response;
  } catch (error) {
    if (error instanceof AdminApiError) {
      if (error.status === 401) return safeError(401, "DOCUMENT_ACCESS_DENIED");
      if (error.status === 403 || error.status === 404) {
        return safeError(404, "DOCUMENT_NOT_AVAILABLE");
      }
      return safeError(502, "DOCUMENT_ACCESS_UNAVAILABLE");
    }
    if (error instanceof AdminApiResponseError) {
      return safeError(502, "DOCUMENT_ACCESS_UNAVAILABLE");
    }
    return safeError(503, "DOCUMENT_ACCESS_UNAVAILABLE");
  }
}
