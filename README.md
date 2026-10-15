# Guitar Practice Cloud

Application web de gestion et d'écoute de pistes audio, réalisée avec Angular et une API Node.js/Express. Les métadonnées et les comptes sont stockés dans MongoDB ; les fichiers audio et les pochettes sont conservés localement par le serveur.

## Architecture

Le dépôt est organisé en deux applications indépendantes :

- **`frontend-starter/`** : application Angular. Les composants de page sont dans `src/app/components/` (connexion, inscription, profil et pistes). Les services d'authentification et de pistes, les modèles, le garde de route et l'intercepteur HTTP sont dans `src/app/shared/`. Le proxy de développement `proxy.conf.json` transmet les requêtes `/api` au backend sur le port 3000.
- **`backend/`** : API REST Express, démarrée depuis `src/server.js`. `src/app.js` configure l'application et ses routes ; `src/models/` contient les modèles Mongoose ; `src/cover-service.js` gère les recherches de pochettes. L'API utilise MongoDB Atlas pour les données et le disque local pour les fichiers audio et les pochettes.

Les deux processus doivent fonctionner en même temps en développement. Le détail des routes et des formats est décrit dans [API_CONTRACT.md](API_CONTRACT.md).

## Prérequis

- Node.js 22 ou une version plus récente, avec npm ;
- un cluster MongoDB Atlas accessible et son URI de connexion ;
- un navigateur récent.

Pour configurer Atlas, suivre [ATLAS_SETUP.md](ATLAS_SETUP.md).

## Installation et configuration

Depuis la racine du dépôt, installer les dépendances dans chaque application :

```bash
cd backend
npm install
```

Dans un autre terminal :

```bash
cd frontend-starter
npm install
```

Créer ensuite `backend/.env` à partir de `backend/.env.example`, puis renseigner `MONGODB_URI` et une valeur longue et aléatoire pour `JWT_SECRET`. Conserver ces valeurs localement et ne jamais les ajouter au code Angular ni les publier.

Sous macOS/Linux :

```bash
cp .env.example .env
```

Sous PowerShell, depuis le dossier `backend` :

```powershell
Copy-Item .env.example .env
```

## Lancer l'application

Démarrer l'API dans un terminal, depuis `backend/` :

```bash
npm start
```

Elle écoute par défaut sur [http://localhost:3000](http://localhost:3000). La vérification de santé est disponible à [http://localhost:3000/api/health](http://localhost:3000/api/health).

Démarrer Angular dans un deuxième terminal, depuis `frontend-starter/` :

```bash
npm start
```

Ouvrir [http://localhost:4200](http://localhost:4200). Le serveur Angular relaie automatiquement les appels `/api` vers l'API locale.

Au premier démarrage, l'API crée le compte de démonstration s'il n'existe pas : **demo@example.com** / **Demo1234!**.

## Commandes utiles

Dans `frontend-starter/` : `npm run build` compile l'application et `npm test` lance les tests Vitest.

Dans `backend/` : `npm test` lance les tests Node.js.

## Documents du dépôt

- [SUJET_ETUDIANT_TP1.md](SUJET_ETUDIANT_TP1.md), [SUJET_ETUDIANT_TP2.md](SUJET_ETUDIANT_TP2.md) et [SUJET_ETUDIANT_TP3.md](SUJET_ETUDIANT_TP3.md) : sujets des travaux pratiques ;
- [RAPPORT_IA_MODELE.md](RAPPORT_IA_MODELE.md) : modèle de compte rendu ;
- [ATLAS_SETUP.md](ATLAS_SETUP.md) : configuration de MongoDB Atlas ;
- [CONSEILS_POUR_UTIISER_ASSISTANT_AI.md](CONSEILS_POUR_UTIISER_ASSISTANT_AI.md) : conseils d'utilisation d'un assistant IA.

### Réaliser par Emma CLAUZEL
