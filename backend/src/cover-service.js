import fsPromises from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const MUSICBRAINZ = "https://musicbrainz.org/ws/2";
const CAA = "https://coverartarchive.org";
const USER_AGENT = "GPCBackingTracks/1.0 (https://github.com/Emma-Clauzel/AngularM1_Miage_2026_2027_TP123)";
let lastMusicBrainzCall = 0;
let musicBrainzQueue = Promise.resolve();

async function fetchMusicBrainz(url) {
  const request = musicBrainzQueue.then(async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const delay = Math.max(0, 1100 - (Date.now() - lastMusicBrainzCall));
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      lastMusicBrainzCall = Date.now();
      const response = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(8000),
      });
      if (response.ok) return response.json();
      if (![429, 503].includes(response.status) || attempt === 2) {
        throw new Error(`MusicBrainz a répondu ${response.status}`);
      }
      console.warn(`[cover-search] MusicBrainz limite la fréquence; nouvel essai ${attempt + 1}/2`);
      await new Promise((resolve) => setTimeout(resolve, 1200 * (attempt + 1)));
    }
    throw new Error("MusicBrainz reste momentanément indisponible");
  });
  musicBrainzQueue = request.catch((error) => {
    console.warn("[cover-search] Échec d'une requête MusicBrainz", error.message);
  });
  return request;
}

function normalized(value = "") {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr").replace(/[^a-z0-9]+/g, " ").trim();
}

function scoreCandidate(track, release) {
  const wantedArtist = normalized(track.artist);
  const wantedAlbum = normalized(track.album);
  const title = normalized(track.title);
  const candidateTitle = normalized(release.recordingTitle);
  const candidateAlbum = normalized(release.title);
  const credit = normalized((release["artist-credit"] ?? []).map((entry) => entry.name ?? entry.artist?.name ?? "").join(" "));
  let score = 0;
  if (candidateTitle && candidateTitle === title) score += 60;
  else if (candidateTitle && (candidateTitle.includes(title) || title.includes(candidateTitle))) score += 30;
  if (wantedAlbum && candidateAlbum === wantedAlbum) score += 50;
  else if (wantedAlbum && candidateAlbum.includes(wantedAlbum)) score += 30;
  if (wantedArtist && credit === wantedArtist) score += 35;
  else if (wantedArtist && credit.includes(wantedArtist)) score += 20;
  if ((release.media ?? []).some((medium) => (medium.track ?? []).some((item) => normalized(item.title) === title))) score += 15;
  if (track.releaseYear && release.date?.startsWith(track.releaseYear)) score += 5;
  score += Math.round(Number(release.recordingScore ?? 0) / 2);
  return score;
}

export async function findCoverSuggestions(track) {
  const quote = (value) => `"${String(value).replace(/[\\"]/g, "\\$&")}"`;
  const query = track.artist ? `recording:${quote(track.title)} AND artist:${quote(track.artist)}` : `recording:${quote(track.title)}`;
  const search = async (luceneQuery) => {
    const params = new URLSearchParams({ query: luceneQuery, fmt: "json", limit: "8" });
    return fetchMusicBrainz(`${MUSICBRAINZ}/recording/?${params}`);
  };
  let data = await search(query);
  if (!(data.recordings?.length) && track.artist) data = await search(`recording:${quote(track.title)}`);
  const candidates = [];
  for (const recording of data.recordings ?? []) {
    for (const release of recording.releases ?? []) {
      candidates.push({
        ...release,
        "artist-credit": release["artist-credit"] ?? recording["artist-credit"],
        recordingTitle: recording.title,
        recordingScore: recording.score,
      });
    }
  }
  const seen = new Set();
  const releases = candidates.filter((release) => {
    if (!release.id || seen.has(release.id)) return false;
    seen.add(release.id);
    return true;
  }).sort((a, b) => scoreCandidate(track, b) - scoreCandidate(track, a)).slice(0, 5);

  const suggestions = [];
  for (const release of releases) {
    try {
      const response = await fetch(`${CAA}/release/${release.id}`, {
        headers: { Accept: "application/json", "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) continue;
      const art = await response.json();
      const front = (art.images ?? []).find((image) => image.front && image.approved !== false)
        ?? (art.images ?? []).find((image) => image.front)
        ?? (art.images ?? []).find((image) => (image.types ?? []).includes("Front"));
      if (!front?.id) continue;
      const artist = (release["artist-credit"] ?? []).map((entry) => entry.name ?? entry.artist?.name ?? "").join("");
      suggestions.push({
        releaseId: release.id,
        imageId: String(front.id),
        imageUrl: `${CAA}/release/${release.id}/${front.id}-250.jpg`,
        title: release.title,
        artist,
        date: release.date ?? "",
        score: scoreCandidate(track, release),
      });
    } catch (error) {
      console.warn(`[cover-search] Pochette indisponible pour ${release.id}`, error.message);
    }
  }
  return suggestions.sort((a, b) => b.score - a.score);
}

function sniffImage(buffer) {
  if (buffer.length > 0 && buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return "image/jpeg";
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  return "";
}

function validateDimensions(buffer, mimeType) {
  let width = 0;
  let height = 0;
  if (mimeType === "image/png" && buffer.length >= 24) {
    width = buffer.readUInt32BE(16);
    height = buffer.readUInt32BE(20);
  } else if (mimeType === "image/jpeg") {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) { offset += 1; continue; }
      const marker = buffer[offset + 1];
      const segmentLength = buffer.readUInt16BE(offset + 2);
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        height = buffer.readUInt16BE(offset + 5);
        width = buffer.readUInt16BE(offset + 7);
        break;
      }
      if (segmentLength < 2) break;
      offset += 2 + segmentLength;
    }
  }
  if (!width || !height || width > 4096 || height > 4096 || width * height > 12_000_000) {
    throw new Error("Dimensions d'image non valides (maximum 4096 × 4096 et 12 mégapixels)");
  }
}

async function fetchCoverImage(releaseId, imageId) {
  if (!/^[\da-f-]{36}$/i.test(releaseId) || !/^\d+$/.test(imageId)) throw new Error("Identifiant de pochette invalide");
  const initialUrl = new URL(`${CAA}/release/${releaseId}/${imageId}-500.jpg`);
  let current = initialUrl;
  let response;
  for (let redirects = 0; redirects < 5; redirects++) {
    if (current.protocol !== "https:" || !(current.hostname === "coverartarchive.org" || current.hostname === "archive.org" || current.hostname.endsWith(".archive.org"))) {
      throw new Error("Hôte de pochette externe refusé");
    }
    response = await fetch(current, { redirect: "manual", signal: AbortSignal.timeout(12000), headers: { "User-Agent": USER_AGENT } });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const location = response.headers.get("location");
    if (!location) throw new Error("Redirection de pochette invalide");
    current = new URL(location, current);
  }
  if (!response?.ok || !response.body) throw new Error("La pochette n'a pas pu être téléchargée");
  const declaredSize = Number(response.headers.get("content-length") ?? 0);
  if (declaredSize > 5 * 1024 * 1024) throw new Error("Pochette trop volumineuse (maximum 5 Mo)");
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 5 * 1024 * 1024) {
      await reader.cancel();
      throw new Error("Pochette trop volumineuse (maximum 5 Mo)");
    }
    chunks.push(Buffer.from(value));
  }
  const buffer = Buffer.concat(chunks);
  const mimeType = sniffImage(buffer);
  if (!mimeType) throw new Error("Le fichier téléchargé n'est pas une image JPEG, PNG ou WebP valide");
  validateDimensions(buffer, mimeType);
  return { buffer, mimeType, sourceUrl: `${CAA}/release/${releaseId}/${imageId}` };
}

export async function saveCoverBytes(directory, bytes) {
  const mimeType = sniffImage(bytes);
  if (!mimeType) throw new Error("Image non valide : choisissez un JPEG ou PNG");
  if (bytes.length > 5 * 1024 * 1024) throw new Error("Image trop volumineuse (maximum 5 Mo)");
  validateDimensions(bytes, mimeType);
  const extension = { "image/jpeg": ".jpg", "image/png": ".png" }[mimeType];
  const storedName = `${cryptoRandomUUID()}${extension}`;
  await fsPromises.writeFile(path.join(directory, storedName), bytes, { flag: "wx" });
  return { storedName, mimeType };
}

function cryptoRandomUUID() {
  return crypto.randomUUID();
}

export async function downloadCover(directory, releaseId, imageId) {
  const image = await fetchCoverImage(releaseId, imageId);
  const saved = await saveCoverBytes(directory, image.buffer);
  return { ...saved, sourceUrl: image.sourceUrl };
}
