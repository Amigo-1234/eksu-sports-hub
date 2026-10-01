import { NextResponse } from "next/server";
import { publicRegistrationEnabled, REGISTRATION_DISABLED_MESSAGE } from "@/lib/registration/flag";
import { checkDocument, documentPath, isUuid, type DocKind } from "@/lib/registration/rules";
import { callerKey, DOCUMENT_BUCKET, serviceClient, verifyDraft } from "@/lib/registration/server";

/*
 * POST /api/register/upload — one registration document per request
 * (multipart: token, person, kind = photo|id, file).
 *
 * The browser never talks to Storage: this handler checks the draft token,
 * rate-limits the caller, validates size + declared type + extension + the
 * file's real first bytes, then stores it in the PRIVATE bucket under an
 * opaque path with the server-only secret key. No public URL exists.
 */

export const dynamic = "force-dynamic";

const fail = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

export async function POST(request: Request) {
  if (!publicRegistrationEnabled()) return fail(REGISTRATION_DISABLED_MESSAGE, 403);
  const db = serviceClient();
  if (!db) return fail("Registration uploads are not available right now.", 503);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("The upload could not be read. Try a smaller file.");
  }
  const draft = verifyDraft(form.get("token"));
  if (!draft) return fail("This registration form has expired. Reload the page and try again.", 401);
  const person = String(form.get("person") ?? "");
  const kind = String(form.get("kind") ?? "") as DocKind;
  const file = form.get("file");
  if (!isUuid(person) || (kind !== "photo" && kind !== "id") || !(file instanceof File)) return fail("Choose a file to upload.");

  const allowed = await db.rpc("service_rate_hit", { p_bucket: "register-upload", p_key: await callerKey(), p_max: 80, p_window_seconds: 600 });
  if (allowed.error) return fail("Uploads are not available right now.", 503);
  if (allowed.data === false) return fail("Too many uploads from this connection. Please wait a few minutes.", 429);

  const submitted = await db.rpc("service_registration_exists", { p_registration_id: draft.registrationId });
  if (submitted.error) return fail("Uploads are not available right now.", 503);
  if (submitted.data === true) return fail("This registration has already been submitted.", 409);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const verdict = checkDocument(kind, { name: file.name, type: file.type, size: file.size }, bytes.subarray(0, 16));
  if (!verdict.ok) return fail(verdict.error);

  const path = documentPath(draft.registrationId, person, kind, verdict.ext);
  const bucket = db.storage.from(DOCUMENT_BUCKET);
  // Replacing a document of another type must not leave the old one behind.
  const others = ["jpg", "png", "webp", "pdf"].filter((e) => e !== verdict.ext).map((e) => documentPath(draft.registrationId, person, kind, e));
  await bucket.remove(others);
  const up = await bucket.upload(path, bytes, { contentType: verdict.type, upsert: true, cacheControl: "0" });
  if (up.error) return fail("The file could not be stored. Please try again.", 502);

  return NextResponse.json({ ok: true, path, kind, type: verdict.type, size: file.size });
}
