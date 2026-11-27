import { test } from "node:test";
import assert from "node:assert/strict";
import { isSameOrigin } from "../src/lib/same-origin.ts";

const req = (url: string, h: Record<string, string>) => new Request(url, { method: "POST", headers: h });

test("allows the public domain behind a proxy (internal request.url)", () => {
  assert.equal(isSameOrigin(req("http://localhost:10000/api/visitor", { origin: "https://www.eksusportshub.com.ng", host: "www.eksusportshub.com.ng" })), true);
  assert.equal(isSameOrigin(req("http://10.0.0.1:10000/api/visitor", { origin: "https://www.eksusportshub.com.ng", "x-forwarded-host": "www.eksusportshub.com.ng" })), true);
});
test("allows requests without an Origin header", () => {
  assert.equal(isSameOrigin(req("https://www.eksusportshub.com.ng/api/visitor", {})), true);
});
test("rejects other sites", () => {
  assert.equal(isSameOrigin(req("http://localhost:10000/api/visitor", { origin: "https://evil.example", host: "www.eksusportshub.com.ng" })), false);
  assert.equal(isSameOrigin(req("http://localhost:10000/api/visitor", { origin: "not a url", host: "www.eksusportshub.com.ng" })), false);
});
test("still allows the plain same-origin case", () => {
  assert.equal(isSameOrigin(req("https://www.eksusportshub.com.ng/api/visitor", { origin: "https://www.eksusportshub.com.ng" })), true);
});
