import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { User } from "../src/models/User.js";
import { Track } from "../src/models/Track.js";

let server, base;
const JWT_SECRET = process.env.JWT_SECRET || "tp1-development-secret";

function bearer(sub = "test-owner") {
  return `Bearer ${jwt.sign({ sub, email: `${sub}@example.test` }, JWT_SECRET, { expiresIn: "1h" })}`;
}

test.before(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server.close());

test("health sans dépendre de MongoDB", async () => {
  const r = await fetch(base + "/api/health");
  assert.equal(r.status, 200);
  assert.equal((await r.json()).status, "ok");
});

test("refuse une route protégée sans JWT", async () => {
  const response = await fetch(`${base}/api/tracks`);
  assert.equal(response.status, 401);
  assert.match((await response.json()).message, /Authentification requise/);
});

test("refuse une route protégée avec un JWT invalide", async () => {
  const response = await fetch(`${base}/api/tracks`, {
    headers: { Authorization: "Bearer invalid.token.value" },
  });
  assert.equal(response.status, 401);
  assert.match((await response.json()).message, /Jeton invalide/);
});

test("refuse un upload authentifié sans fichier audio", async () => {
  const response = await fetch(`${base}/api/tracks`, {
    method: "POST",
    headers: { Authorization: bearer() },
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).message, /Fichier audio requis/);
});

test("refuse un type MIME audio non autorisé", async () => {
  const form = new FormData();
  form.append("audio", new Blob(["not audio"], { type: "text/plain" }), "notes.txt");
  const response = await fetch(`${base}/api/tracks`, {
    method: "POST",
    headers: { Authorization: bearer() },
    body: form,
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).message, /Format audio non accepté/);
});

test("la pagination applique les paramètres page et limit", async () => {
  const originalFind = Track.find;
  const originalCountDocuments = Track.countDocuments;
  let findFilter;
  let skipValue;
  let limitValue;
  const query = {
    sort() { return this; },
    skip(value) { skipValue = value; return this; },
    limit(value) { limitValue = value; return this; },
    select() { return this; },
    lean() { return Promise.resolve([]); },
  };
  Track.find = (filter) => { findFilter = filter; return query; };
  Track.countDocuments = async () => 0;
  try {
    const response = await fetch(`${base}/api/tracks?page=2&limit=3`, {
      headers: { Authorization: bearer("page-owner") },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { items: [], page: 2, limit: 3, total: 0, pages: 1 });
    assert.deepEqual(findFilter, { ownerId: "page-owner" });
    assert.equal(skipValue, 3);
    assert.equal(limitValue, 3);
  } finally {
    Track.find = originalFind;
    Track.countDocuments = originalCountDocuments;
  }
});

test("une piste d’un autre utilisateur ne peut pas être supprimée", async () => {
  const originalFindOneAndDelete = Track.findOneAndDelete;
  const trackId = "64b000000000000000000001";
  let deleteFilter;
  Track.findOneAndDelete = (filter) => {
    deleteFilter = filter;
    return { select: async () => null };
  };
  try {
    const response = await fetch(`${base}/api/tracks/${trackId}`, {
      method: "DELETE",
      headers: { Authorization: bearer("different-owner") },
    });
    assert.equal(response.status, 404);
    assert.match((await response.json()).message, /Piste inconnue/);
    assert.deepEqual(deleteFilter, { _id: trackId, ownerId: "different-owner" });
  } finally {
    Track.findOneAndDelete = originalFindOneAndDelete;
  }
});

test("schémas Mongoose et relation", () => {
  const u = new User({
    name: "Test",
    email: "TEST@example.com",
    password: "12345678",
  });

  assert.equal(u.email, "test@example.com");
  const t = new Track({
    ownerId: new mongoose.Types.ObjectId(),
    title: "Blues",
    originalName: "b.mp3",
    storedName: "x.mp3",
    mimeType: "audio/mpeg",
    size: 42,
  });
  
  assert.equal(t.title, "Blues");
  assert.equal(Track.schema.path("ownerId").options.ref, "User");
});
