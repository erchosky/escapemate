import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync("src/lib/avatar-storage.ts", "utf8");
const moduleObject = { exports: {} };
vm.runInNewContext(
  ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
  { exports: moduleObject.exports, module: moduleObject },
);
const { avatarPathsForUser, removeUserAvatars } = moduleObject.exports;

function fakeStorage(error = null) {
  const removed = [];
  return {
    removed,
    client: { storage: { from: (bucket) => ({ remove: async (paths) => { removed.push([bucket, paths]); return { error }; } }) } },
  };
}

test("removing an account's avatar targets every allowed extension in the user's folder", async () => {
  const { client, removed } = fakeStorage();
  assert.equal(await removeUserAvatars(client, "user-1"), true);
  // Los arrays vienen de otro contexto (vm): se comparan por contenido.
  assert.equal(
    JSON.stringify(removed),
    JSON.stringify([["avatars", ["user-1/avatar.jpg", "user-1/avatar.png", "user-1/avatar.webp"]]]),
  );
});

test("avatar removal reports storage failures", async () => {
  const { client } = fakeStorage(new Error("denied"));
  assert.equal(await removeUserAvatars(client, "user-1"), false);
});

test("avatar paths never leave the user's folder", () => {
  assert.ok(avatarPathsForUser("abc").every((path) => path.startsWith("abc/")));
});

test("account deletion removes the uploaded avatar before deleting the rows", () => {
  const action = readFileSync("src/lib/actions/profile.ts", "utf8");
  const body = action.slice(action.indexOf("export async function deleteAccount"));
  assert.ok(body.indexOf("removeUserAvatars") > 0);
  assert.ok(body.indexOf("removeUserAvatars") < body.indexOf('rpc("delete_my_account")'));
});
