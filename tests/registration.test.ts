import { test } from "node:test";
import assert from "node:assert/strict";
import { publicRegistrationEnabled } from "../src/lib/registration/flag.ts";
import { checkDocument, cleanPhone, documentPath, isPhone, normaliseMatric, normaliseReference, REFERENCE_PATTERN, sniffType } from "../src/lib/registration/rules.ts";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const PDF = new TextEncoder().encode("%PDF-1.4 xxxxxxx");
const WEBP = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ");
const TEXT = new TextEncoder().encode("hello world, not a file");

test("matric numbers normalise like Postgres (case and spaces ignored)", () => {
  assert.equal(normaliseMatric("csc / 22 / 1234"), "CSC/22/1234");
  assert.equal(normaliseMatric(" CSC/22/1234 "), normaliseMatric("csc/22/ 1234"));
});

test("phones", () => {
  assert.equal(cleanPhone("+234 (803) 000-0000"), "+2348030000000");
  assert.ok(isPhone("0803 000 0000"));
  assert.ok(!isPhone("12345"));
  assert.ok(!isPhone("0803abc0000"));
});

test("file types are sniffed from content", () => {
  assert.equal(sniffType(JPEG), "image/jpeg");
  assert.equal(sniffType(PNG), "image/png");
  assert.equal(sniffType(WEBP), "image/webp");
  assert.equal(sniffType(PDF), "application/pdf");
  assert.equal(sniffType(TEXT), null);
});

test("documents: size, MIME, extension and content must agree", () => {
  assert.deepEqual(checkDocument("photo", { name: "me.jpg", type: "image/jpeg", size: 1000 }, JPEG), { ok: true, ext: "jpg", type: "image/jpeg" });
  assert.deepEqual(checkDocument("id", { name: "card.pdf", type: "application/pdf", size: 1000 }, PDF), { ok: true, ext: "pdf", type: "application/pdf" });
  assert.equal(checkDocument("photo", { name: "card.pdf", type: "application/pdf", size: 1000 }, PDF).ok, false, "no PDF passport photo");
  assert.equal(checkDocument("photo", { name: "x.jpg", type: "image/jpeg", size: 1000 }, TEXT).ok, false, "renamed text file");
  assert.equal(checkDocument("photo", { name: "x.png", type: "image/png", size: 1000 }, JPEG).ok, false, "MIME disagrees with content");
  assert.equal(checkDocument("photo", { name: "x.exe", type: "image/jpeg", size: 1000 }, JPEG).ok, false, "wrong extension");
  assert.equal(checkDocument("id", { name: "x.jpg", type: "image/jpeg", size: 5 * 1024 * 1024 }, JPEG).ok, false, "over 4 MB");
  assert.equal(checkDocument("id", { name: "x.jpg", type: "image/jpeg", size: 0 }, JPEG).ok, false, "empty");
});

test("document paths are opaque UUID paths", () => {
  const r = "0b6f5a2e-1c1d-4b8e-9a39-6a3c2f1e0d11", p = "a1b2c3d4-0000-4000-8000-000000000001";
  assert.equal(documentPath(r, p, "photo", "jpg"), `${r}/${p}/photo.jpg`);
  assert.throws(() => documentPath("CSC/22/1234", p, "photo", "jpg"));
});

test("references", () => {
  assert.ok(REFERENCE_PATTERN.test(normaliseReference(" eksu-fc26-7k4p2d ")));
  assert.ok(!REFERENCE_PATTERN.test("EKSU-FC26-7K4P2O"), "O is not in the alphabet");
  assert.ok(!REFERENCE_PATTERN.test("EKSU-FC26-123"));
});

test("public registration is OFF unless explicitly enabled", () => {
  assert.equal(publicRegistrationEnabled({}), false, "unset → off");
  assert.equal(publicRegistrationEnabled({ PUBLIC_REGISTRATION_ENABLED: "false" }), false);
  assert.equal(publicRegistrationEnabled({ PUBLIC_REGISTRATION_ENABLED: "0" }), false);
  assert.equal(publicRegistrationEnabled({ PUBLIC_REGISTRATION_ENABLED: "maybe" }), false);
  assert.equal(publicRegistrationEnabled({ PUBLIC_REGISTRATION_ENABLED: "true" }), true);
  assert.equal(publicRegistrationEnabled({ PUBLIC_REGISTRATION_ENABLED: " TRUE " }), true);
  assert.equal(publicRegistrationEnabled({ PUBLIC_REGISTRATION_ENABLED: "1" }), true);
});
