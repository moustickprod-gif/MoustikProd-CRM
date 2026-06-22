# 🦟 Moustikprod CRM

CRM sur mesure pour la gestion clients, devis, contrats et signatures électroniques du studio vidéo Moustikprod.

**URL de production :** https://moustikprod-crm.vercel.app

---

## Stack technique

| Technologie | Usage |
|---|---|
| **Alpine.js 3** | Réactivité UI (CDN, pas de build) |
| **Tailwind CSS** | Styles (CDN, pas de build) |
| **Firebase Auth + Firestore** | Authentification et base de données |
| **Vercel** | Hébergement + fonctions serverless (`/api/`) |
| **Brevo** | Envoi d'emails automatiques (signatures, relances) |
| **Notion API** | Création de pages projet depuis le CRM |
| **Chart.js** | Graphiques du dashboard |
| **Signature Pad** | Signature électronique clients |

> ⚠️ Pas de `npm install` ni de build nécessaire — tout est CDN ou Vercel Functions.

---

## Structure des fichiers

```
CRM-Moustikprod/
├── index.html              → Application principale (toute la logique CRM)
├── sign.html               → Page de signature électronique client (lien public)
├── server.js               → Serveur local Node.js (dev uniquement, port 3000)
├── vercel.json             → Config déploiement Vercel + rewrites
├── package.json            → Métadonnées projet (pas de dépendances npm)
├── .env.example            → Variables d'environnement à configurer sur Vercel
├── api/
│   ├── notion.js           → Proxy Notion API (crée des pages)
│   ├── sign.js             → Lecture d'une demande de signature (Firestore)
│   ├── submit-signature.js → Enregistrement signature + envoi email client
│   └── send-email.js       → Envoi d'emails via Brevo
├── INSTALL-WINDOWS.bat     → Installation de l'environnement (1 double-clic)
├── DEMARRER-LOCAL.bat      → Lancement du serveur local
└── DEPLOYER.bat            → Déploiement Vercel en production
```

---

## Clés API nécessaires

### 1. Firebase (déjà intégré dans index.html)
La config Firebase est directement dans `index.html` (lignes ~6618-6622) :
```js
apiKey: "AIzaSyBGFGecF81Pj_JfAmYTHeWFL8uYr3U1noY"
authDomain: "moustikprod-crm.firebaseapp.com"
projectId: "moustikprod-crm"
```
**→ Rien à faire**, c'est déjà configuré côté client.

### 2. Brevo — Emails automatiques (variable Vercel)
- **Variable :** `BREVO_API_KEY`
- **Trouver la clé :** https://app.brevo.com → SMTP & API → API Keys
- **Format :** `xkeysib-...`
- **Usage :** Envoi des emails de confirmation de signature et de refus

### 3. Notion API (passé via le frontend)
- La clé Notion est configurée dans l'interface CRM (Paramètres), **pas dans les variables Vercel**
- Elle est stockée dans Firestore sous le profil utilisateur

### 4. Anthropic Claude (passé via le frontend)
- La clé Claude est configurée dans l'interface CRM (Paramètres), **pas dans les variables Vercel**

### 5. Vercel Project IDs (déjà liés)
```json
projectId: "prj_HwdN2waWD3GGsL6Lc1PMtMno6SWw"
orgId: "team_jzBVcfWBF7HkFwIr6IQWKYps"
```

---

## Reprendre le développement sur un nouveau PC Windows

### Prérequis (à installer une seule fois)

1. **Node.js** → https://nodejs.org (choisir LTS)
2. **Git** → https://git-scm.com *(optionnel mais recommandé)*
3. **VS Code** → https://code.visualstudio.com *(éditeur recommandé)*

### Installation

```
1. Copier le dossier CRM-Moustikprod/ sur le PC (clé USB ou Google Drive)
2. Double-cliquer sur INSTALL-WINDOWS.bat
3. Dans le terminal ouvert : vercel login  (se connecter avec le compte Vercel)
```

### Développement local

```
Double-cliquer sur DEMARRER-LOCAL.bat
→ Ouvre http://localhost:3000 dans Chrome
```

> ⚠️ En local, les fonctions `/api/` ne fonctionnent PAS (elles nécessitent Vercel).
> Pour tester les emails ou les signatures, déployer sur Vercel avec `vercel` (preview).

### Déploiement en production

```
Double-cliquer sur DEPLOYER.bat
→ Lance vercel --prod
→ Le site est mis à jour sur moustikprod-crm.vercel.app
```

### Variables d'environnement Vercel

Les variables sont stockées côté Vercel, **pas dans les fichiers**. Sur un nouveau PC, elles sont automatiquement récupérées quand on se connecte via `vercel login`.

Pour les vérifier ou les modifier :
- https://vercel.com/dashboard → projet `moustikprod-crm` → Settings → Environment Variables
- Ou en CLI : `vercel env ls`

---

## Contacts & accès

| Service | URL / Email |
|---|---|
| Vercel | https://vercel.com — compte moustickprod@gmail.com |
| Firebase | https://console.firebase.google.com — projet `moustikprod-crm` |
| Brevo | https://app.brevo.com — compte contact@moustikprod.fr |

---

## Notes importantes

- **Pas de build** — modifier `index.html` et déployer suffit
- **Firebase Firestore** est la base de données principale (clients, devis, projets, signatures)
- **Firebase Auth** gère la connexion (email/mot de passe)
- Les données **ne sont jamais perdues** entre les machines — tout est dans le cloud
- Le seul fichier vraiment sensible est `.env` (clé Brevo) — il n'existe que sur Vercel

---

*Dernière mise à jour : juin 2026*
