# Contrat HTTP - TP1

Base : `/api`. Sauf inscription et connexion, envoyer `Authorization: Bearer <token>`.

Le contrat HTTP ne dépend pas du choix de persistance : le backend fourni utilise Mongoose et MongoDB. MongoDB conserve les utilisateurs et métadonnées ; les octets des fichiers audio restent sur le disque du serveur.

| Méthode | Route | Requête | Réponse principale |
|---|---|---|---|
| GET | `/health` | - | `{ "status": "ok" }` |
| POST | `/auth/register` | `{name,email,password}` | `201 {token,user}` |
| POST | `/auth/login` | `{email,password}` | `200 {token,user}` |
| GET | `/users/me` | JWT | `200 User` |
| PUT | `/users/me` | `{name}` + JWT | `200 User` |
| GET | `/tracks?page=1&limit=5` | JWT | `Page<Track>` |
| POST | `/tracks/metadata` | JWT, multipart : `audio` | `200 { title, artist, album, releaseYear, embeddedCoverDataUrl }` ; lit les tags ID3 sans créer de piste, supprime le fichier temporaire |
| POST | `/tracks` | multipart : `audio`, `title?`, `artist?` (valeurs par défaut depuis ID3 ou le nom du fichier) | `201 Track` avec métadonnées et éventuelle pochette intégrée |
| GET | `/tracks/:id/audio` | JWT | flux audio |
| GET | `/tracks/:id/cover` | JWT, propriétaire | flux image privé |
| GET | `/tracks/:id/cover-suggestions?title=...&artist=...&album=...` | JWT, propriétaire; critères facultatifs (200 caractères maximum chacun) | `200 { metadata, suggestions[] }` depuis MusicBrainz et Cover Art Archive; une recherche sans artiste sert de repli |
| POST | `/tracks/:id/cover/select` | JWT, propriétaire; JSON `{ releaseId, imageId, rightsConfirmed: true }` | `200 Track`; image CAA téléchargée et conservée localement |
| POST | `/tracks/:id/cover/upload` | JWT, propriétaire; multipart `cover`, `rightsConfirmed=true` | `200 Track`; JPEG/PNG, 5 Mo maximum, 4096 × 4096 et 12 mégapixels maximum |
| DELETE | `/tracks/:id` | JWT | `204` (bonus) |

`Page<Track>` contient `items`, `page`, `limit`, `total` et `pages`. Formats acceptés : MP3, WAV, OGG et M4A, 25 Mo maximum.

Erreurs courantes : `400` validation, `401` authentification, `404` ressource, `409` email déjà utilisé; `502` service de recherche externe indisponible.

Les champs `artist`, `album`, `releaseYear` et `cover` sont facultatifs pour rester compatibles avec les documents existants. MongoDB conserve les métadonnées de la couverture (nom interne, format, source et confirmation); ses octets résident sous `backend/data/covers`. Les recherches passent par le serveur, qui ne télécharge que depuis le Cover Art Archive et limite les redirections à `coverartarchive.org` et `archive.org`. Chaque route vérifie que l'utilisateur connecté est propriétaire de la piste.
