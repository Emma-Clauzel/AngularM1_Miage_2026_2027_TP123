# Rapport d'usage de l'IA — TP2

## Mission 2 — Bibliothèque paginée

- **Objectif :** afficher la bibliothèque par pages demandées au serveur, avec états de chargement, erreur et liste vide.
- **Prompt principal :** « Peux-tu faire la mission 2 ? » (TP2 : Bibliothèque paginée).
- **Plan proposé par l'agent :** vérifier le contrat et l'implémentation existante, conserver la pagination HTTP serveur, puis compléter le traitement des états et les contrôles de navigation.
- **Vérifications réalisées par le binôme :** à compléter après vérification manuelle de l'application et de l'onglet Network. Vérifier que les requêtes de navigation contiennent `page=...` et `limit=5`.
- **Erreurs ou propositions rejetées :** aucune.
- **Fichiers effectivement modifiés :**
  - `frontend-starter/src/app/components/tracks-page/tracks-page.ts` : signal d'erreur, message en cas d'échec réseau, protection des bornes et contre les clics pendant le chargement.
  - `frontend-starter/src/app/components/tracks-page/tracks-page.html` : états chargement/erreur/liste vide, navigation complète et annonces accessibles.
- **Fichiers vérifiés sans modification :** `frontend-starter/src/app/shared/services/track.service.ts` transmet déjà `page` et `limit` comme paramètres HTTP; le modèle `Page<T>` contient `items`, `page`, `limit`, `total` et `pages`.
- **Preuve de fonctionnement :** à compléter après lancement du frontend avec le backend. Le code appelle `list(this.page())` à chaque navigation; le service envoie ses paramètres dans la requête `GET /api/tracks`.
- **Ce que chaque membre sait maintenant expliquer sans l'agent :** à compléter par le binôme : comment le clic change le signal `page`, déclenche une nouvelle requête HTTP serveur, et met à jour les signaux `tracks`/`pages`.

## Fonctionnalité — Déconnexion

- **Objectif :** permettre à un utilisateur connecté de fermer sa session depuis la navigation principale.
- **Prompt principal :** « Peux-tu ajouter la possibilité de se déconnecter ? tout en expliquant dans RAPPORT_IA_MODELE.md ».
- **Plan :** réutiliser `AuthService.logout()` déjà présent, ajouter une action dans l’en-tête, puis rediriger vers la page de connexion.
- **Vérifications réalisées :** compilation Angular à effectuer; vérifier manuellement que le bouton supprime `gpc_token` de `localStorage`, met à jour le signal de session et redirige vers `/login`.
- **Erreurs ou propositions rejetées :** aucune.
- **Fichiers modifiés :** `frontend-starter/src/app/components/app/app.ts` (action logout), `frontend-starter/src/app/components/app/app.html` (navigation conditionnelle avec Déconnexion ou Connexion/Créer un compte).
- **Preuve de fonctionnement :** le code appelle le logout du service, qui supprime le JWT et remet les signaux `token` et `currentUser` à `null`, puis navigue vers `/login`. À confirmer dans le navigateur.
- **Ce que chaque membre sait maintenant expliquer sans l’agent :** à compléter par le binôme : comment le token conditionne les liens visibles et comment sa suppression empêche l’accès aux routes protégées.

## Interface — Style des liens cliquables

- **Objectif :** harmoniser l’apparence des liens avec le bouton Déconnexion.
- **Prompt principal :** « Peux-tu changer les autres textes cliquables pour qu'ils aient la même esthétique que ton bouton déconnexion ? »
- **Plan :** appliquer aux liens une apparence de bouton cohérente avec le style existant, avec un état au survol et un indicateur de focus clavier.
- **Vérifications réalisées :** compilation à effectuer; vérifier visuellement les liens de navigation et de formulaires.
- **Erreurs ou propositions rejetées :** aucune.
- **Fichiers modifiés :** `frontend-starter/src/styles.css` (style global des liens, survol et focus visible).
- **Preuve de fonctionnement :** à confirmer dans le navigateur après rechargement.
- **Ce que chaque membre sait maintenant expliquer sans l'agent :** à compléter par le binôme : comment les styles globaux s’appliquent aux liens de toute l’application et pourquoi le focus clavier est visible.

## Mission 3 — Upload et lecture audio

- **Objectif :** compléter l’upload et la lecture déjà présents, avec validations côté frontend, états d’interface, cards accessibles et libération des ObjectURL.
- **Prompt principal :** « Peux-tu faire la mission 3 maintenant ? » (TP2 : Analyse, amélioration de l’upload et de la lecture audio).
- **Plan :** cartographier le flux existant; aligner les contrôles frontend avec le backend; compléter le traitement des erreurs et du succès; présenter les métadonnées en cards; expliquer Blob, mémoire et streaming.
- **Vérifications réalisées :** compilation Angular à lancer. Le binôme doit ensuite vérifier l’upload valide/invalide, les erreurs serveur, la lecture authentifiée et les appels Network.
- **Erreurs ou propositions rejetées :** aucune modification du backend ni du contrat HTTP; ces mécanismes sont déjà en place.
- **Fichiers effectivement modifiés :**
  - `frontend-starter/src/app/components/tracks-page/tracks-page.ts` : validations MIME/taille avant envoi, protection contre double soumission, messages de chargement/erreur/succès, récupération du message serveur, suivi de la lecture et révocation de l’ObjectURL à la destruction.
  - `frontend-starter/src/app/components/tracks-page/tracks-page.html` : formulaire avec exactement les champs de service `audio` et `title`, cards accessibles, métadonnées, messages et lecteur nommé.
  - `frontend-starter/src/app/components/tracks-page/tracks-page.css` : présentation responsive des cards et états d’interface.
- **Fichiers vérifiés sans modification :** `track.service.ts` crée le `FormData` avec `audio` et `title`, poste vers `/api/tracks` et demande la réponse audio en `Blob`; l’intercepteur ajoute `Authorization: Bearer ...`; le backend utilise Multer `diskStorage`, limite à 25 Mio et filtre les types MIME; `POST /api/tracks` lit `req.body.title`; `GET /api/tracks/:id/audio` exige l’authentification et filtre aussi par `ownerId` avant `res.sendFile`.
- **Preuve de fonctionnement :** à compléter avec la démonstration du binôme dans le navigateur. La compilation confirme la cohérence TypeScript et template, mais la lecture et l’upload doivent être vérifiés avec le backend actif.
- **Flux upload :** composant (`upload`) → `TrackService.upload` → `FormData(audio, title)` → `HttpClient POST /api/tracks` → JWT via l’intercepteur → authentification et Multer côté API → stockage disque et métadonnées.
- **Flux lecture :** composant (`play`) → `TrackService.audio(id)` → `HttpClient GET /api/tracks/:id/audio` avec réponse Blob → vérification JWT et propriétaire côté API → Blob reçu → `URL.createObjectURL` → lecteur `<audio>`. Un `<audio src="/api/...">` natif ne passe pas par Angular `HttpClient`, donc l’intercepteur n’ajoute pas le header JWT à cette requête.
- **Validation :** le frontend refuse les MIME hors liste (MP3, WAV, OGG, MP4/M4A tels que déclarés par le backend) et les fichiers de plus de 25 Mio avant HTTP. Cela améliore le retour immédiat à l’utilisateur; seul le backend peut faire autorité, car une requête peut être fabriquée sans l’interface Angular.
- **Mémoire, buffering et streaming :** Multer écrit l’upload sur disque via `diskStorage`. Pour la lecture, `res.sendFile` envoie depuis le fichier au lieu de charger explicitement tout son contenu dans un buffer applicatif; Express peut transférer les données progressivement. Avec `HttpClient` en `responseType: 'blob'`, le composant reçoit normalement le Blob une fois la réponse téléchargée et assemblée par le navigateur. La liste paginée ne contient que les métadonnées : les 100 audios ne sont pas chargés au rendu; seul le Blob de la piste demandée est récupéré. Cent éléments `<audio>` avec des URL directes ne téléchargent pas nécessairement cent fichiers entiers d’emblée (leur `preload` et le navigateur influent), mais chacun pourrait lancer une requête et la lecture directe ne reçoit pas le JWT de l’intercepteur. Une ObjectURL référence les données du Blob; la révoquer libère cette ressource URL quand elle n’est plus utile. Le composant révoque l’ancienne URL au remplacement et la dernière à sa destruction.
- **Ce que chaque membre sait maintenant expliquer sans l’agent :** à compléter par le binôme : les deux flux, les champs multipart, les contrôles backend, la différence entre Blob téléchargé, buffering du lecteur et transfert progressif depuis le serveur.

## Améliorations — Progression d’upload et palette rose

- **Objectif :** montrer l’avancement réel de l’envoi audio et remplacer la palette verte par un rose pastel.
- **Prompt principal :** « Peux-tu me faire l'amélioration sur la barre progressive de l'upload ? En même temps, remplace la couleur verte du site par un rose pastel ».
- **Plan :** demander les événements de progression à `HttpClient`, convertir `loaded / total` en pourcentage, afficher une progression indéterminée si le navigateur ne fournit pas le total, et remplacer les teintes vertes par des variables de thème rose.
- **Vérifications réalisées :** compilation Angular à lancer. Vérifier dans Network et sur un fichier audio que le pourcentage évolue; certains environnements peuvent ne pas exposer le total, auquel cas la barre reste indéterminée.
- **Erreurs ou propositions rejetées :** aucune.
- **Fichiers modifiés :** `frontend-starter/src/app/shared/services/track.service.ts` (retour des événements HTTP et `reportProgress`), `frontend-starter/src/app/components/tracks-page/tracks-page.ts` (calcul du pourcentage et réponse finale), `frontend-starter/src/app/components/tracks-page/tracks-page.html` (barre accessible), `frontend-starter/src/app/components/tracks-page/tracks-page.css` (barre et cards), `frontend-starter/src/styles.css` (variables et palette globale rose pastel).
- **Preuve de fonctionnement :** compilation à confirmer. Le service demande les événements avec `observe: 'events'` et `reportProgress: true`; chaque événement `UploadProgress` actualise le pourcentage si `total` existe.
- **Ce que chaque membre sait maintenant expliquer sans l'agent :** à compléter par le binôme : rôle de `loaded`, `total`, `reportProgress`, et différence entre barre déterminée et indéterminée.

## Amélioration — Suppression d’une piste

- **Objectif :** supprimer une piste importée par erreur depuis sa card.
- **Prompt principal :** « Je voudrais un petit bouton avec le symbole d'une poubelle afin de supprimer une piste mise par erreur ».
- **Plan :** relier un bouton poubelle accessible à l’endpoint DELETE déjà fourni, demander confirmation, afficher les erreurs éventuelles et recharger la page après suppression.
- **Vérifications réalisées :** compilation Angular à lancer. Le binôme peut vérifier dans Network la requête authentifiée `DELETE /api/tracks/:id` et confirmer qu’elle renvoie `204`, puis que la liste se recharge.
- **Erreurs ou propositions rejetées :** aucune modification du backend ni du contrat : la route existe déjà et est documentée dans `API_CONTRACT.md`.
- **Fichiers modifiés :** `frontend-starter/src/app/shared/services/track.service.ts` (méthode `delete`), `frontend-starter/src/app/components/tracks-page/tracks-page.ts` (confirmation, état d’attente, traitement succès/erreur, actualisation de page et arrêt de lecture de la piste supprimée), `frontend-starter/src/app/components/tracks-page/tracks-page.html` (bouton poubelle par piste), `frontend-starter/src/app/components/tracks-page/tracks-page.css` (style compact).
- **Preuve de fonctionnement :** à confirmer avec le backend actif; le code envoie le DELETE, puis recharge la page. Si la dernière piste d’une page est supprimée, il revient à la page précédente.
- **Ce que chaque membre sait maintenant expliquer sans l’agent :** à compléter par le binôme : comment la confirmation évite une suppression accidentelle et comment la réponse `204` déclenche l’actualisation de la bibliothèque.

### Mise à jour — Fenêtre de confirmation

- **Objectif :** remplacer la confirmation native par une fenêtre intégrée au site avant suppression.
- **Prompt principal :** « Maintenant, je voudrais une pop up pour valider la suppression d'une piste ».
- **Plan :** utiliser l’élément natif `<dialog>` pour conserver l’interaction accessible au clavier, présenter le titre de la piste, et proposer Annuler/Supprimer.
- **Vérifications réalisées :** compilation Angular à lancer; vérifier ouverture, annulation avec bouton et touche Échap, puis confirmation.
- **Fichiers modifiés :** `frontend-starter/src/app/components/tracks-page/tracks-page.ts` (ouverture/fermeture et piste sélectionnée), `frontend-starter/src/app/components/tracks-page/tracks-page.html` (dialog), `frontend-starter/src/app/components/tracks-page/tracks-page.css` (style de la fenêtre cohérent avec le thème).
- **Preuve de fonctionnement :** à confirmer visuellement dans le navigateur après compilation.
- **Ce que chaque membre sait maintenant expliquer sans l’agent :** à compléter par le binôme : comment `<dialog>` s’ouvre en modal et comment la validation appelle ensuite la suppression.

## Modèle pour les missions suivantes

Pour chaque mission, consigner l'objectif, le prompt principal, le plan, les vérifications du binôme, les erreurs ou propositions rejetées, les fichiers modifiés, la preuve de fonctionnement et les apprentissages que chaque membre sait expliquer sans l'agent.

## Amélioration — Recherche et filtres de morceaux

- **Objectif :** ajouter une recherche de morceau accessible depuis une icône loupe, avec des filtres de taille, de date d'ajout et de format audio.
- **Prompt principal :** « Toujours dans l'optique d'améliorer le site, peux-tu s'il te plaît me créer une option de recherche de morceau de musique, avec une barre de recherche qui ne s'ouvre qu'après avoir appuyé sur la loupe (icône de la barre de recherche) puis avec des filtres concernant la taille, la date et le format. »
- **Plan :** ajouter un bouton loupe accessible qui affiche/masque un panneau de recherche; filtrer les pistes chargées côté navigateur par titre/nom du fichier, tranche de taille, dates de début et de fin, et type MIME; garder la recherche combinable et réactive sans modifier l'API.
- **Fichiers modifiés :** `frontend-starter/src/app/components/tracks-page/tracks-page.ts` (état des filtres, ouverture/fermeture et calcul des résultats), `frontend-starter/src/app/components/tracks-page/tracks-page.html` (loupe, panneau et contrôles accessibles), `frontend-starter/src/app/components/tracks-page/tracks-page.css` (présentation et adaptation mobile).
- **Vérifications réalisées :** `npm.cmd run build` dans `frontend-starter` a réussi le 1er octobre 2026. La vérification visuelle dans le navigateur reste à effectuer par le binôme.
- **Limite à connaître :** la liste de pistes est paginée par l'API; la recherche filtre uniquement les morceaux présents sur la page courante. Le compteur indique donc « sur cette page ». Changer de page permet de rechercher dans un autre groupe de morceaux.
- **Preuve de fonctionnement :** la compilation Angular confirme que le composant, le template et les styles sont valides. À confirmer manuellement : ouvrir/fermer la loupe, tester chaque filtre et leur combinaison, naviguer entre pages, vérifier le rendu mobile et l'accessibilité clavier.
- **Ce que chaque membre sait maintenant expliquer sans l'agent :** à compléter par le binôme : comment la propriété calculée combine les critères sur les pistes de la page, comment les signaux mettent à jour les résultats et pourquoi une recherche sur toute la bibliothèque nécessiterait de parcourir les pages côté client ou d'ajouter une recherche côté API.

## Amélioration — Pochettes de morceaux et recherche web

- **Objectif :** afficher une couverture pour chaque piste, extraire les métadonnées ID3 et permettre de choisir une pochette proposée par le Web ou importée depuis l'ordinateur.
- **Prompt principal :** « Ajouter une image de couverture pour chaque morceau […] rechercher une image sur le Web et les autres métadonnées disponibles à partir des tags ID3 ou du nom du fichier […] identifier les modifications de données et d'API avant toute implémentation et respecter la sécurité, l'accessibilité et les droits d'utilisation. »
- **Plan exécuté :** ajouter les champs artiste, album, année et provenance/licence de couverture au modèle; extraire `TIT2`, `TPE1`, `TALB`, l'année et l'image `APIC` avec `music-metadata`; proposer les jaquettes de sorties correspondantes par recherche MusicBrainz puis Cover Art Archive; exiger une confirmation des droits avant un choix Web ou un upload; télécharger côté serveur uniquement depuis des hôtes CAA/Internet Archive autorisés, valider le type réel, la taille et les dimensions, stocker l'image localement; authentifier et limiter l'accès au propriétaire; documenter toutes les routes.
- **Fichiers modifiés :** `backend/src/models/Track.js` (métadonnées et couverture), `backend/src/cover-service.js` (recherche, score de correspondance, respect du débit MusicBrainz, téléchargement à hôtes limités et validation d'image), `backend/src/app.js` (extraction ID3, routes et autorisation), `backend/package.json` et `backend/package-lock.json` (dépendance `music-metadata`), `frontend-starter/src/app/shared/models/track.model.ts` et `track.service.ts` (types et appels HTTP), `frontend-starter/src/app/components/tracks-page/tracks-page.ts`, `.html` et `.css` (couvertures, recherche, sélection, upload, droits et accessibilité), `API_CONTRACT.md` (champs et routes).
- **Données/API :** `Track` conserve `artist`, `album`, `releaseYear` et des métadonnées `cover` (nom interne privé, MIME, source, URL source, crédit, licence et confirmation). Les nouvelles routes authentifiées sont `GET /tracks/:id/cover-suggestions`, `GET /tracks/:id/cover`, `POST /tracks/:id/cover/select` et `POST /tracks/:id/cover/upload`. Les octets résident dans `backend/data/covers`; les anciens documents demeurent lisibles grâce aux champs facultatifs.
- **Sécurité et droits :** toutes les opérations vérifient le propriétaire de la piste; les noms internes ne sont pas exposés dans les réponses; les uploads d'image sont limités à JPEG/PNG, 5 Mo, 4096 × 4096 et 12 mégapixels; le contenu est contrôlé par signature plutôt que par le seul MIME déclaré; les téléchargements CAA ne suivent que des redirections HTTPS vers `coverartarchive.org` et `archive.org`; une confirmation utilisateur et des champs crédit/licence sont demandés. Cette confirmation ne prouve pas juridiquement que l'utilisateur détient les droits; les images CAA ne sont pas considérées libres par défaut.
- **Vérifications réalisées :** `npm.cmd run build` dans `frontend-starter` a réussi le 1er octobre 2026; `node --check` a réussi pour `backend/src/app.js`, `backend/src/cover-service.js` et `backend/src/models/Track.js`. Les tests du backend et la vérification manuelle avec MongoDB et des appels externes restent à effectuer par le binôme.
- **Note dépendances :** `npm install music-metadata` a signalé une vulnérabilité modérée dans l'arbre de dépendances; elle n'a pas été corrigée automatiquement dans cette mission.
- **Ce que chaque membre sait maintenant expliquer sans l'agent :** à compléter par le binôme : les principaux frames ID3, l'association recording → release → CAA, le rôle de la confirmation utilisateur, les validations côté serveur et les changements documentés au contrat.

### Ajustements — import et sélection des pochettes

- **Demande de suivi :** proposer la couverture dès l'import, supprimer le bouton « Pochette », ouvrir les réglages au clic sur la couverture dans une fenêtre modale et réparer la recherche Web.
- **Changements :** l'image JPEG/PNG peut être choisie dans le formulaire d'import (avec crédit/licence et confirmation des droits); après l'import audio, elle est enregistrée automatiquement sur le morceau. Cliquer sur la couverture ou son emplacement vide ouvre le `<dialog>` accessible avec choix d'une image importée ou recherche Web. Les critères titre/artiste/album sont modifiables dans la fenêtre; la recherche élargit le critère si la recherche combinée ne retourne aucun enregistrement. Laisser le titre audio vide transmet maintenant les tags ID3 au lieu de remplacer systématiquement le titre par le nom de fichier.
- **Diagnostic recherche :** une requête de lecture à MusicBrainz a confirmé que l'API renvoie les enregistrements, leurs scores et leurs sorties. Le code transmet désormais un User-Agent identifié, présente le score de pertinence et donne la possibilité de corriger les métadonnées de recherche manuellement.
- **Vérification :** compilation Angular réussie et syntaxe backend vérifiée (`node --check`). Le parcours complet de sélection/téléchargement Cover Art Archive n'a pas été vérifié dans le navigateur avec MongoDB.
- **Suite au diagnostic :** les appels MusicBrainz utilisent l'URL du dépôt comme User-Agent et retentent deux fois après `429`/`503` en respectant un intervalle supérieur à une seconde. Une requête MusicBrainz correctement encodée a retourné les enregistrements attendus; un test en lecture seule du Cover Art Archive a confirmé sa redirection HTTPS vers `archive.org`, déjà autorisée par le contrôle de destination.

## Amelioration — prelecture a l'import et filtre artiste

- **Objectif :** placer le fichier audio en premiere position, pre-remplir titre/artiste et montrer la pochette integree aux tags ID3; filtrer aussi la bibliotheque par artiste.
- **Changements :** une route authentifiee `POST /api/tracks/metadata` lit les tags et le nom du fichier sans creer de piste, valide la pochette ID3 et supprime le fichier temporaire. Le formulaire commence par le fichier audio; une fois choisi, titre et artiste sont pre-remplis et restent modifiables. L’artiste saisi est transmis a l’upload. Le filtre artiste se combine avec les autres filtres de la page courante.
- **Fichiers :** `backend/src/app.js`, `API_CONTRACT.md`, `frontend-starter/src/app/shared/services/track.service.ts`, `frontend-starter/src/app/components/tracks-page/tracks-page.ts`, `.html` et `.css`.
- **Verification :** `npm.cmd run build` a reussi le 1 octobre 2026; `node --check backend/src/app.js` a reussi. La verification du parcours dans le navigateur reste a faire.
- **Limite :** l’image est pre-remplie si le fichier audio contient deja une pochette ID3 valide; sinon, le formulaire propose l’upload d’image et la recherche Web demeure accessible apres import en cliquant la pochette.

## Ajustement — champs de couverture et nom de fichier

- **Demande :** retirer les champs de credit/licence, ameliorer les valeurs titre/artiste pre-remplies et ne pas ajouter le recap Word au depot.
- **Changements :** suppression des champs de credit et licence dans le formulaire, le service, le schema public du modele et les routes de couverture. La confirmation d’utilisation de l’image reste presente. Les tags ID3 non vides sont prioritaires et les etiquettes descriptives comme « Official Music Video » sont retirees du titre. Pour un nom contenant explicitement ce marqueur avant le tiret, la partie avant le tiret devient le titre et celle apres devient l’artiste. Le fichier `récap TP2.docx` est ignore par Git dans `.gitignore`.
- **Exemple attendu :** `The Emptiness Machine (Official Music Video) - Linkin Park.mp3` donne le titre `The Emptiness Machine` et l’artiste `Linkin Park`, sauf si les tags ID3 contiennent de meilleures valeurs.
- **Verification :** compilation Angular et verification syntaxique backend a relancer; la premiere compilation de ce suivi a rencontre une erreur d’acces au dossier du projet dans le compilateur Angular.
