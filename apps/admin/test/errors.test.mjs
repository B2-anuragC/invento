import { test } from "node:test";
import assert from "node:assert/strict";
import { apiErrorMessage } from "../src/errors.ts";

test("validation failures show the field reasons instead of the generic summary", () => {
  const body = {
    error: {
      message: "Request validation failed.",
      details: [
        { field: "phone", message: "Enter a valid phone number: 7 to 15 digits, optionally starting with +." },
        { field: "email", message: "email must be an email" },
      ],
    },
  };
  assert.equal(
    apiErrorMessage(body, 422),
    "Enter a valid phone number: 7 to 15 digits, optionally starting with +. email must be an email",
  );
});

test("repeated reasons are shown once", () => {
  const detail = { field: "phone", message: "Invalid phone." };
  assert.equal(apiErrorMessage({ error: { details: [detail, detail] } }, 422), "Invalid phone.");
});

test("falls back to the error message, then the top-level message", () => {
  assert.equal(apiErrorMessage({ error: { message: "Business access is unavailable." } }, 403), "Business access is unavailable.");
  assert.equal(apiErrorMessage({ error: { message: "Fallback", details: [] } }, 400), "Fallback");
  assert.equal(apiErrorMessage({ message: "Top level" }, 400), "Top level");
});

test("ignores malformed details and empty bodies", () => {
  assert.equal(apiErrorMessage({ error: { message: "Summary", details: [null, 4, { message: "" }] } }, 422), "Summary");
  assert.equal(apiErrorMessage({}, 500), "Request failed (500).");
  assert.equal(apiErrorMessage(null, 502), "Request failed (502).");
});
