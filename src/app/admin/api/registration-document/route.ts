import { NextResponse } from "next/server";
import { assertAdmin } from "@/lib/admin/permissions";
import { checkDocument, documentPath, isUuid, type DocKind } from "@/lib/registration/rules";
import { DOCUMENT_BUCKET, serviceClient } from "@/lib/registration/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/*
 * POST /admin/api/registration-document — an ADMIN attaches a passport photo
 * or ID evidence to a registration entry (multipart: registration_id,
 * person_id, kind = photo|id, file).
 *
 * ADMIN is verified for this request; the file is checked exactly like the
 * public upload (size, MIME, extension, real content) and stored privately
 * with the server-only key; the attachment itself is recorded by
 * admin_attach_registration_document as the signed-in admin (history +
 * audit). Works whether or not public registration is enabled.
 */

export const dynamic = "force-dynamic";

const fail = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

export async function POST(request: Request) {
  const auth = await assertAdmin();
  if (!auth.ok) return fail(auth.error, 403);
  const store = serviceClient();
  if (!store) return fail("Document storage is not configured on this server (SUPABASE_SECRET_KEY).", 503);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("The upload could not be read. Try a smaller file.");
  }
  const registrationId = String(form.get("registration_id") ?? "");
  const personId = String(form.get("person_id") ?? "");
  const kind = String(form.get("kind") ?? "") as DocKind;
  const file = form.get("file");
  if (!isUuid(registrationId) || !isUuid(personId) || (kind !== "photo" && kind !== "id") || !(file instanceof File)) return fail("Choose a file to upload.");

  // The entry must still be waiting for a decision (checked before touching storage).
  const db = await createSupabaseServerClient();
  const detail = await db.rpc("admin_registration_detail", { p_registration_id: registrationId });
  const entry = (detail.data as { status: string; players: { id: string; status: string }[] } | null)?.players.find((p) => p.id === personId);
  const regStatus = (detail.data as { status: string } | null)?.status;
  if (detail.error || !entry) return fail("Registration entry not found.", 404);
  if (!["SUBMITTED", "UNDER_REVIEW", "NEEDS_CORRECTION"].includes(regStatus ?? "") || entry.status !== "SUBMITTED") {
    return fail("Documents can only be attached while the entry waits for a decision.", 409);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const verdict = checkDocument(kind, { name: file.name, type: file.type, size: file.size }, bytes.subarray(0, 16));
  if (!verdict.ok) return fail(verdict.error);

  const path = documentPath(registrationId, personId, kind, verdict.ext);
  const bucket = store.storage.from(DOCUMENT_BUCKET);
  const up = await bucket.upload(path, bytes, { contentType: verdict.type, upsert: true, cacheControl: "0" });
  if (up.error) return fail("The file could not be stored. Please try again.", 502);

  const attached = await db.rpc("admin_attach_registration_document", { p_registration_player_id: personId, p_kind: kind, p_path: path });
  if (attached.error) {
    return fail(attached.error.code?.startsWith("EK") ? attached.error.message : "The document could not be attached.", 409);
  }
  // Remove a previous file of another type for the same slot.
  await bucket.remove(["jpg", "png", "webp", "pdf"].filter((e) => e !== verdict.ext).map((e) => documentPath(registrationId, personId, kind, e)));
  return NextResponse.json({ ok: true });
}
