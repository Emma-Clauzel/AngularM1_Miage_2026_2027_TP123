import express from "express";
import cors from "cors";
import multer from "multer";
import jwt from "jsonwebtoken";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { parseFile } from "music-metadata";
import { User } from "./models/User.js";
import { Track } from "./models/Track.js";
import { downloadCover, findCoverSuggestions, saveCoverBytes } from "./cover-service.js";

// Les fichiers audio restent sur le disque du serveur dans ce TP.
// MongoDB ne conserve que leurs métadonnées : titre, nom, taille, etc.
const UPLOADS = path.resolve("data/uploads");
const COVERS = path.resolve("data/covers");

try {
  // mkdirSync est utilisé au démarrage : l'application doit disposer de ce
  // dossier avant de pouvoir accepter le premier upload.
  fs.mkdirSync(UPLOADS, { recursive: true });
  fs.mkdirSync(COVERS, { recursive: true });
  console.log(`[startup] Dossier des uploads prêt : ${UPLOADS}`);
} catch (error) {
  console.error("[startup] Impossible de créer le dossier des uploads", error);
  throw error;
}

// Ce secret reste côté serveur. Il ne doit jamais être copié dans Angular.
const SECRET = process.env.JWT_SECRET || "tp1-development-secret";

// La taille maximale d'un fichier audio est de 25 Mo. Les fichiers plus gros
// sont refusés par Multer avant d'être écrits sur le disque.
const MAX_FILE_SIZE = 25 * 1024 * 1024;

// Les types MIME autorisés correspondent aux formats demandés dans le sujet.
const allowed = new Set([
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/mp4",
  "audio/x-m4a",
]);

function filenameMetadata(originalName) {
  const baseName = path.parse(originalName).name.trim().slice(0, 200);
  const split = baseName.match(/^(.{1,100}?)\s[-–—]\s(.{1,150})$/u);
  if (!split) return { title: cleanFilenameTitle(baseName), artist: "" };

  const hasVideoLabel = /\b(?:official\s+)?(?:music\s+)?(?:video|audio|lyrics?|visuali[sz]er)\b/i.test(split[1]);
  const first = cleanFilenameTitle(split[1]);
  const second = cleanFilenameTitle(split[2]);
  // Many exported music videos use "Title (Official Music Video) - Artist";
  // keep the first side as the title when that explicit label is present.
  return hasVideoLabel
    ? { title: first, artist: second }
    : { title: second, artist: first };
}

function cleanFilenameTitle(value) {
  return value
    .replace(/\s*[([{]\s*(?:official\s+)?(?:music\s+)?(?:video|audio|lyrics?|visuali[sz]er)[^\])}]*[\])}]\s*/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

/**
 * Crée un jeton JWT contenant uniquement l'identité nécessaire à l'API.
 * Le mot de passe n'est jamais placé dans le token. `sub` signifie subject
 * et contient l'identifiant MongoDB de l'utilisateur.
 */
function token(user) {
  console.log(`[auth] Création d'un token pour l'utilisateur ${user.id}`);
  return jwt.sign({ sub: user.id, email: user.email }, SECRET, {
    expiresIn: "2h",
  });
}

/** Middleware Express qui protège les routes privées. */
function auth(req, res, next) {
  const raw = req.headers.authorization;

  // Le token est transmis dans l'en-tête Authorization sous la forme
    // "Authorization: Bearer <token>". Le préfixe "Bearer " est obligatoire pour que
    // le middleware sache qu'il s'agit d'un JWT et non d'un autre type de jeton.
  if (!raw?.startsWith("Bearer ")) {
    console.warn(`[auth] Authorization absente pour ${req.method} ${req.path}`);
    return res.status(401).json({ message: "Authentification requise" });
  }

  try {
    // jwt.verify vérifie la signature et la date d'expiration du token.
    // On ne logue jamais sa valeur, car un JWT permettrait une usurpation.
    req.auth = jwt.verify(raw.slice(7), SECRET);
    console.log(`[auth] Token accepté pour ${req.auth.sub}`);
    next();
  } catch (error) {
    console.error("[auth] Token invalide ou expiré", error);
    return res.status(401).json({ message: "Jeton invalide ou expiré" });
  }
}

/*
 * Multer transforme une requête HTTP multipart/form-data en données exploitables
 * par Express et traite les fichiers envoyés par un formulaire HTML.
 * Documentation officielle : https://github.com/expressjs/multer
 *
 * diskStorage indique que Multer écrit directement le fichier sur disque.
 * Chaque callback doit appeler cb(error, value) : null signifie qu'il n'y a
 * pas d'erreur. Le nom aléatoire évite les collisions entre utilisateurs.
 */
const storage = multer.diskStorage({
  destination: (_request, _file, callback) => {
    console.debug(`[multer] Destination sélectionnée : ${UPLOADS}`);
    callback(null, UPLOADS);
  },
  filename: (_request, file, callback) => {
    const filename =
      crypto.randomUUID() + path.extname(file.originalname).toLowerCase();
    console.log(`[multer] Nom de stockage généré pour ${file.originalname}`);
    callback(null, filename);
  },
});

/*
 * limits.fileSize protège le serveur contre les fichiers trop volumineux.
 * fileFilter est appelé avant l'enregistrement : accepter le fichier appelle
 * callback(null, true), le refuser transmet une vraie Error à Express.
 */
const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_request, file, callback) => {
    // Seuls les types MIME audio demandés dans le sujet sont acceptés.
    if (allowed.has(file.mimetype)) {
      console.log(`[multer] Type accepté : ${file.mimetype}`);
      return callback(null, true);
    }

    const error = new Error("Format audio non accepté");
    console.error(`[multer] Type refusé : ${file.mimetype}`, error);
    return callback(error);
  },
});

const coverUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

/**
 * Construit l'application Express sans ouvrir de port.
 * Cette séparation permet au serveur réel et aux tests de créer la même
 * application. Le port est ouvert uniquement dans server.js.
 */
export function createApp() {
  const app = express();

  // Journaliser la fin de chaque requête permet de suivre méthode, URL,
  // statut et durée sans exposer les corps contenant des mots de passe.
  app.use((req, res, next) => {
    const startedAt = Date.now();
    res.on("finish", () => {
      console.log(
        `[http] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - startedAt} ms)`,
      );
    });
    next();
  });

  // CORS est nécessaire pour que le frontend Angular puisse appeler l'API.
  // C'est-à-dire que le navigateur autorise les requêtes cross-origin depuis localhost:4200.
  // Dans un vrai projet, il est recommandé de limiter les origines autorisées.
  app.use(cors());

  // Express ne gère pas nativement le JSON : ce middleware transforme le corps JSON en objet JavaScript 
  // accessible via req.body.
  // Il est placé avant les routes pour que toutes les requêtes JSON soient traitées.
  app.use(express.json());

  // Prélecture sans création de piste : les tags ID3 et la pochette intégrée
  // alimentent le formulaire d'import dès que l'utilisateur choisit son audio.
  app.post("/api/tracks/metadata", auth, upload.single("audio"), async (req, res, next) => {
    if (!req.file) return res.status(400).json({ message: "Fichier audio requis" });
    let embeddedCoverDataUrl = "";
    try {
      const fallback = filenameMetadata(req.file.originalname);
      let metadata = { title: fallback.title, artist: fallback.artist, album: "", releaseYear: "" };
      try {
        const parsed = await parseFile(req.file.path, { skipCovers: false });
        metadata = {
          title: cleanFilenameTitle(String(parsed.common.title ?? "")) || fallback.title,
          artist: String(parsed.common.artist ?? "").trim().slice(0, 200) || fallback.artist,
          album: String(parsed.common.album ?? "").slice(0, 200),
          releaseYear: parsed.common.year ? String(parsed.common.year).slice(0, 10) : "",
        };
        const picture = parsed.common.picture?.find((item) => item.type === "Cover (front)") ?? parsed.common.picture?.[0];
        if (picture?.data) {
          let saved;
          try {
            saved = await saveCoverBytes(COVERS, Buffer.from(picture.data));
            const bytes = await fsPromises.readFile(path.join(COVERS, saved.storedName));
            embeddedCoverDataUrl = `data:${saved.mimeType};base64,${bytes.toString("base64")}`;
          } catch (error) {
            console.warn("[tracks] Pochette intégrée ignorée pendant la prélecture", error.message);
          } finally {
            if (saved) await fsPromises.unlink(path.join(COVERS, saved.storedName)).catch(() => {});
          }
        }
      } catch (error) {
        console.warn("[tracks] Tags audio illisibles pendant la prélecture", error.message);
      }
      res.json({ ...metadata, embeddedCoverDataUrl });
    } catch (error) {
      next(error);
    } finally {
      await fsPromises.unlink(req.file.path).catch(() => {});
    }
  });

  /** Endpoint public utilisé pour vérifier que l'API répond. */
  app.get("/api/health", (_req, res) => {
    console.log("[health] Vérification de l'API");
    res.json({ status: "ok" });
  });

  /** Requête POST pour "insertion" de donnée.
   * Inscrit un utilisateur et renvoie un token avec ses données publiques. 
   * @param {Object} req - La requête HTTP.
   * @param {Object} res - La réponse HTTP.
   * @param {Function} next - La fonction de middleware suivante.
   */
  app.post("/api/auth/register", async (req, res, next) => {
    try {
      const { name, email, password } = req.body || {};
      console.log(`[auth] Tentative d'inscription pour ${email || "email absent"}`);

      if (!name || !email || !password || password.length < 8) {
        console.warn("[auth] Inscription refusée : données invalides ou incomplètes");
        return res.status(400).json({
          message: "Nom, email et mot de passe de 8 caractères requis",
        });
      }

      // Vérifie si l'email est déjà utilisé avant de créer un nouvel utilisateur.
      if (await User.exists({ email: String(email).toLowerCase() })) {
        console.warn(`[auth] Email déjà utilisé : ${email}`);
        return res.status(409).json({ message: "Email déjà utilisé" });
      }

      // Crée l'utilisateur et le stocke dans MongoDB. Le mot de passe est haché
      // par le hook pre('validate') défini dans le schéma Mongoose.
      const user = await User.create({ name, email, password });
      console.log(`[auth] Utilisateur créé : ${user.id}`);
      res.status(201).json({ token: token(user), user: user.toPublic() });
    } catch (error) {
      console.error("[auth] Erreur pendant l'inscription", error);
      next(error);
    }
  });

  /** Vérifie les identifiants et ouvre une session JWT. Les identifiants sont envoyés dans le corps de la 
   * requête par un HTTP POST. */
  app.post("/api/auth/login", async (req, res, next) => {
    try {
        // req.body est déjà un objet JavaScript grâce au middleware express.json() placé plus haut.
        // il contient les champs email et password envoyés par le frontend Angular.
      const email = String(req.body?.email || "").toLowerCase();
      console.log(`[auth] Tentative de connexion pour ${email || "email absent"}`);

      // Sélectionne le mot de passe haché pour vérifier les identifiants.
      // User est un modèle Mongoose qui correspond au schéma défini dans models/User.js.
      // on envoie les requête à MongoDB via cet objet. Le mot de passe haché est stocké dans 
      // passwordHash, mais il n'est pas renvoyé par défaut dans les requêtes pour 
      // des raisons de sécurité.
      const user = await User.findOne({ email }).select("+passwordHash");

      if (!user || !(await user.verifyPassword(req.body?.password || ""))) {
        console.warn(`[auth] Identifiants incorrects pour ${email}`);
        return res.status(401).json({ message: "Identifiants incorrects" });
      }

      console.log(`[auth] Connexion réussie : ${user.id}`);
      res.json({ token: token(user), user: user.toPublic() });
    } catch (error) {
      console.error("[auth] Erreur pendant la connexion", error);
      next(error);
    }
  });

  /** Retourne le profil public de l'utilisateur identifié par le JWT. 
   * Les paramètres sont :
   * @param auth - Le middleware qui vérifie le JWT et ajoute req.auth. 
   * @param {Object} req - La requête HTTP.
   * @param {Object} res - La réponse HTTP.
   * @param {Function} next - La fonction de middleware suivante.
  */
  app.get("/api/users/me", auth, async (req, res, next) => {
    try {
        // req.auth.sub contient l'identifiant MongoDB de l'utilisateur 
        // extrait du JWT par le middleware auth. ici req.auth est un objet ajouté par le middleware 
        // auth à la requête, et sub est la propriété qui contient l'identifiant de l'utilisateur.
      const user = await User.findById(req.auth.sub);
      if (!user) {
        console.warn(`[user] Profil introuvable : ${req.auth.sub}`);
        return res.status(404).json({ message: "Utilisateur inconnu" });
      }

      console.log(`[user] Profil envoyé : ${user.id}`);
      res.json(user.toPublic());
    } catch (error) {
      console.error("[user] Erreur de lecture du profil", error);
      next(error);
    }
  });

  /** Modifie uniquement le nom de l'utilisateur connecté. */
  app.put("/api/users/me", auth, async (req, res, next) => {
    try {
      const user = await User.findByIdAndUpdate(
        req.auth.sub,
        { $set: { name: req.body?.name } },
        { new: true, runValidators: true },
      );

      if (!user) {
        console.warn(`[user] Mise à jour impossible : ${req.auth.sub}`);
        return res.status(404).json({ message: "Utilisateur inconnu" });
      }

      console.log(`[user] Nom mis à jour : ${user.id}`);
      res.json(user.toPublic());
    } catch (error) {
      console.error("[user] Erreur de mise à jour du profil", error);
      next(error);
    }
  });

  /** Retourne une page des pistes appartenant exclusivement à l'utilisateur. */
  app.get("/api/tracks", auth, async (req, res, next) => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(20, Math.max(1, Number(req.query.limit) || 5));
      const filter = { ownerId: req.auth.sub };

      console.log(`[tracks] Lecture page=${page}, limit=${limit}, user=${req.auth.sub}`);

      // La lecture des pistes et le comptage total sont parallélisés pour réduire la latence.
      // on utilise Promise.all pour exécuter les deux opérations en parallèle. 
      // Track.find() récupère les pistes de l'utilisateur avec pagination, 
      // tandis que Track.countDocuments() compte le nombre total de pistes pour cet utilisateur.
      // Promise.all attend que les deux opérations soient terminées avant de continuer et les résultats
        // sont stockés dans les variables items et total.
      const [items, total] = await Promise.all([
        Track.find(filter)
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .select("-storedName")
          .lean(),
        Track.countDocuments(filter),
      ]);

      // items.map(track) crée un nouveau tableau publicItems en transformant chaque piste pour inclure 
      // uniquement les champs nécessaires à l'API.
      // L'identifiant MongoDB (_id) est converti en chaîne de caractères (id) pour être plus lisible 
      // côté frontend.
      // Le champ _id (généré par MongoDB) est supprimé pour éviter de l'exposer dans la réponse JSON.
      const publicItems = items.map(({ _id, ownerId, cover, __v, ...track }) => ({
        ...track,
        id: String(_id),
        cover: cover?.storedName ? {
          mimeType: cover.mimeType,
          source: cover.source,
          sourceUrl: cover.sourceUrl,
          rightsConfirmed: cover.rightsConfirmed,
        } : null,
      }));

      console.log(`[tracks] ${publicItems.length} piste(s) envoyée(s) sur ${total}`);

      // envoi de la réponse JSON avec les pistes publiques, la page actuelle, la limite par page, 
      // le nombre total de pistes et le nombre total de pages.
      res.json({
        items: publicItems,
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit)),
      });
    } catch (error) {
      console.error("[tracks] Erreur de pagination", error);
      next(error);
    }
  });

  /**
   * Reçoit le champ multipart audio et le champ texte title.
   * upload.single("audio") traite un seul fichier et le place dans req.file,
   * tandis que req.body.title contient le champ texte associé.
   * C'est ici qu'est fait l'upload de fichiers sur le serveur. 
   * Le middleware auth vérifie le JWT avant d'accepter l'upload.
   * Le middleware upload.single("audio") traite le fichier audio envoyé dans le champ "audio" du formulaire
   * ou de l'appel depuis le frontend avec un objet FormData.
   * Si le fichier est accepté, il est stocké sur le disque et ses métadonnées sont enregistrées 
   * dans MongoDB.
   */
  app.post(
    "/api/tracks",
    auth,
    upload.single("audio"),
    async (req, res, next) => {
      let embeddedCoverName = "";
      let embeddedCoverMime = "";
      try {
        if (!req.file) {
          console.warn(`[tracks] Upload sans fichier par ${req.auth.sub}`);
          return res.status(400).json({ message: "Fichier audio requis" });
        }
        if (typeof req.body?.title === "string" && req.body.title.trim().length > 200) {
          await fsPromises.unlink(path.join(UPLOADS, req.file.filename));
          return res.status(400).json({ message: "Le titre ne peut pas dépasser 200 caractères." });
        }

        const fromFilename = filenameMetadata(req.file.originalname);
        if (typeof req.body?.artist === "string" && req.body.artist.trim().length > 200) {
          await fsPromises.unlink(path.join(UPLOADS, req.file.filename));
          return res.status(400).json({ message: "Le nom de l’artiste ne peut pas dépasser 200 caractères." });
        }
        let audioMetadata = {};
        try {
          const parsed = await parseFile(req.file.path, { skipCovers: false });
          audioMetadata = {
            title: cleanFilenameTitle(String(parsed.common.title ?? "")) || fromFilename.title,
            artist: String(parsed.common.artist ?? "").trim().slice(0, 200) || fromFilename.artist,
            album: String(parsed.common.album ?? "").slice(0, 200),
            releaseYear: parsed.common.year ? String(parsed.common.year).slice(0, 10) : "",
          };
          const picture = parsed.common.picture?.find((item) => item.type === "Cover (front)")
            ?? parsed.common.picture?.[0];
          if (picture?.data) {
            try {
              const saved = await saveCoverBytes(COVERS, Buffer.from(picture.data));
              embeddedCoverName = saved.storedName;
              embeddedCoverMime = saved.mimeType;
            } catch (coverError) {
              console.warn(`[tracks] Image intégrée ignorée pour ${req.file.filename}`, coverError.message);
            }
          }
        } catch (metadataError) {
          console.warn(`[tracks] Tags audio illisibles pour ${req.file.filename}`, metadataError.message);
        }

        const track = await Track.create({
          ownerId: req.auth.sub,
          title: (typeof req.body.title === "string" ? req.body.title.trim() : "") || audioMetadata.title || fromFilename.title,
          originalName: req.file.originalname,
          storedName: req.file.filename,
          mimeType: req.file.mimetype,
          size: req.file.size,
          artist: (typeof req.body.artist === "string" ? req.body.artist.trim() : "") || audioMetadata.artist || fromFilename.artist,
          album: audioMetadata.album,
          releaseYear: audioMetadata.releaseYear,
          ...(embeddedCoverName ? { cover: { storedName: embeddedCoverName, mimeType: embeddedCoverMime, source: "embedded" } } : {}),
        });

        console.log(`[tracks] Upload enregistré : ${track.id}`);
        res.status(201).json(track.toPublic());
      } catch (error) {
        console.error("[tracks] Erreur après l'enregistrement du fichier", error);

        // Si MongoDB échoue après l'écriture sur disque, on tente de nettoyer
        // le fichier orphelin. L'erreur de nettoyage est elle aussi loguée.
        if (req.file) {
          const uploadedPath = path.join(UPLOADS, req.file.filename);
          try {
            await fsPromises.unlink(uploadedPath);
            console.log(`[tracks] Fichier temporaire supprimé : ${uploadedPath}`);
          } catch (cleanupError) {
            console.error(
              `[tracks] Impossible de supprimer le fichier temporaire ${uploadedPath}`,
              cleanupError,
            );
          }
        }
        if (embeddedCoverName) {
          try {
            await fsPromises.unlink(path.join(COVERS, embeddedCoverName));
          } catch (cleanupError) {
            console.error("[tracks] Nettoyage de la pochette intégrée impossible", cleanupError);
          }
        }
        next(error);
      }
    },
  );

  /** Envoie le contenu binaire d'une piste après vérification de sa propriété. */
  app.get("/api/tracks/:id/cover-suggestions", auth, async (req, res, next) => {
    try {
      const track = await Track.findOne({ _id: req.params.id, ownerId: req.auth.sub });
      if (!track) return res.status(404).json({ message: "Piste inconnue" });
      const queryValue = (value, fallback) => typeof value === "string" ? value.trim().slice(0, 200) : fallback;
      const searchMetadata = {
        title: queryValue(req.query.title, track.title),
        artist: queryValue(req.query.artist, track.artist ?? ""),
        album: queryValue(req.query.album, track.album ?? ""),
        releaseYear: track.releaseYear ?? "",
      };
      if (!searchMetadata.title) return res.status(400).json({ message: "Saisissez un titre pour rechercher une pochette." });
      const suggestions = await findCoverSuggestions(searchMetadata);
      res.json({ metadata: searchMetadata, suggestions });
    } catch (error) {
      console.error("[cover-search] Recherche de pochettes impossible", error);
      res.status(502).json({ message: "Le service de recherche de pochettes est momentanément indisponible." });
    }
  });

  app.post("/api/tracks/:id/cover/select", auth, async (req, res, next) => {
    let newCoverName = "";
    try {
      const track = await Track.findOne({ _id: req.params.id, ownerId: req.auth.sub });
      if (!track) return res.status(404).json({ message: "Piste inconnue" });
      const { releaseId, imageId, rightsConfirmed } = req.body ?? {};
      if (rightsConfirmed !== true) return res.status(400).json({ message: "Confirmez que vous avez le droit d'utiliser cette image." });
      const downloaded = await downloadCover(COVERS, releaseId, imageId);
      newCoverName = downloaded.storedName;
      const oldCoverName = track.cover?.storedName;
      track.cover = { storedName: downloaded.storedName, mimeType: downloaded.mimeType, source: "cover-art-archive", sourceUrl: downloaded.sourceUrl, rightsConfirmed: true };
      await track.save();
      if (oldCoverName) await fsPromises.unlink(path.join(COVERS, oldCoverName)).catch((error) => console.warn("[cover] Ancienne image non supprimée", error.message));
      res.json(track.toPublic());
    } catch (error) {
      if (newCoverName) await fsPromises.unlink(path.join(COVERS, newCoverName)).catch((cleanupError) => console.error("[cover] Nettoyage impossible", cleanupError));
      console.error("[cover] Sélection de pochette impossible", error);
      if (/invalide|refusé|volumineuse|image JPEG|Dimensions/.test(error.message)) return res.status(400).json({ message: error.message });
      next(error);
    }
  });

  app.post("/api/tracks/:id/cover/upload", auth, coverUpload.single("cover"), async (req, res, next) => {
    let newCoverName = "";
    try {
      const track = await Track.findOne({ _id: req.params.id, ownerId: req.auth.sub });
      if (!track) return res.status(404).json({ message: "Piste inconnue" });
      if (!req.file) return res.status(400).json({ message: "Image de couverture requise" });
      if (req.body?.rightsConfirmed !== "true") return res.status(400).json({ message: "Confirmez que vous avez le droit d'utiliser cette image." });
      const saved = await saveCoverBytes(COVERS, req.file.buffer);
      newCoverName = saved.storedName;
      const oldCoverName = track.cover?.storedName;
      track.cover = { storedName: saved.storedName, mimeType: saved.mimeType, source: "upload", rightsConfirmed: true };
      await track.save();
      if (oldCoverName) await fsPromises.unlink(path.join(COVERS, oldCoverName)).catch((error) => console.warn("[cover] Ancienne image non supprimée", error.message));
      res.json(track.toPublic());
    } catch (error) {
      if (newCoverName) await fsPromises.unlink(path.join(COVERS, newCoverName)).catch((cleanupError) => console.error("[cover] Nettoyage impossible", cleanupError));
      if (/Image non valide|volumineuse|Dimensions/.test(error.message)) return res.status(400).json({ message: error.message });
      console.error("[cover] Envoi de pochette impossible", error);
      next(error);
    }
  });

  app.get("/api/tracks/:id/cover", auth, async (req, res, next) => {
    try {
      const track = await Track.findOne({ _id: req.params.id, ownerId: req.auth.sub });
      if (!track?.cover?.storedName) return res.status(404).json({ message: "Pochette inconnue" });
      res.type(track.cover.mimeType).set({ "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" });
      res.sendFile(path.join(COVERS, track.cover.storedName), (error) => { if (error && !res.headersSent) next(error); });
    } catch (error) {
      console.error("[cover] Lecture de pochette impossible", error);
      next(error);
    }
  });

  app.get("/api/tracks/:id/audio", auth, async (req, res, next) => {
    try {
      const track = await Track.findOne({
        _id: req.params.id,
        ownerId: req.auth.sub,
      }).select("+storedName");

      if (!track) {
        console.warn(`[tracks] Audio introuvable ou interdit : ${req.params.id}`);
        return res.status(404).json({ message: "Piste inconnue" });
      }

      const audioPath = path.join(UPLOADS, track.storedName);
      res.type(track.mimeType);
      // Ce callback permet de loguer le succès ou l'erreur du transfert.
      res.sendFile(audioPath, (error) => {
        if (error) {
          console.error(`[tracks] Erreur d'envoi audio ${track.id}`, error);
          if (!res.headersSent) next(error);
          return;
        }
        console.log(`[tracks] Audio envoyé : ${track.id}`);
      });
    } catch (error) {
      console.error("[tracks] Erreur de préparation du flux audio", error);
      next(error);
    }
  });

  /** Supprime la métadonnée et le fichier physique correspondant. */
  app.delete("/api/tracks/:id", auth, async (req, res, next) => {
    try {
      const track = await Track.findOneAndDelete({
        _id: req.params.id,
        ownerId: req.auth.sub,
      }).select("+storedName");

      if (!track) {
        console.warn(`[tracks] Suppression impossible : ${req.params.id}`);
        return res.status(404).json({ message: "Piste inconnue" });
      }

      const audioPath = path.join(UPLOADS, track.storedName);
      try {
        await fsPromises.unlink(audioPath);
        console.log(`[tracks] Fichier supprimé : ${audioPath}`);
      } catch (error) {
        // L'exception n'est volontairement pas ignorée : l'administrateur doit
        // voir ce fichier orphelin si sa suppression échoue.
        console.error(`[tracks] Fichier audio non supprimé : ${audioPath}`, error);
        return res.status(500).json({
          message: "Métadonnée supprimée, mais fichier audio non supprimé",
        });
      }

      if (track.cover?.storedName) {
        await fsPromises.unlink(path.join(COVERS, track.cover.storedName)).catch((error) => console.warn("[tracks] Suppression de la pochette impossible", error.message));
      }

      res.status(204).end();
    } catch (error) {
      console.error("[tracks] Erreur de suppression", error);
      next(error);
    }
  });

  /** Gestionnaire central des erreurs connues de l'application. */
  app.use((error, _req, res, next) => {
    console.error("[error] Erreur reçue par le gestionnaire central", error);

    if (
      error instanceof multer.MulterError ||
      error?.message === "Format audio non accepté"
    ) {
      return res.status(400).json({ message: error.message });
    }
    if (error?.name === "ValidationError") {
      return res.status(400).json({ message: error.message });
    }
    if (error?.name === "CastError") {
      return res.status(404).json({ message: "Ressource inconnue" });
    }

    next(error);
  });

  return app;
}
