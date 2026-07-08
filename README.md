<div align="center">

# KubeHub

**Lens/OpenLens en version web — gestion multi-cluster Kubernetes, login, exploration des ressources, logs et shell des pods, dans une interface console élégante.**

Next.js 15 · FastAPI · Kubernetes / Helm

</div>

---

## Aperçu

KubeHub reprend l'idée de **Lens / OpenLens / FreeLens**, mais 100 % web et multi-utilisateur :

- **Login** (JWT) avec bootstrap du premier administrateur et inscription publique optionnelle.
- **Multi-cluster** : ajoutez autant de clusters que voulu en collant un **kubeconfig** (chiffré au repos via Fernet). Bascule instantanée d'un cluster à l'autre.
- **Vue d'ensemble** : version du cluster, nœuds prêts, namespaces, pods, deployments, services, capacité CPU/mémoire, phases des pods.
- **Workloads** : Pods, Deployments, StatefulSets, DaemonSets, ReplicaSets, Jobs, CronJobs.
- **Configuration** : ConfigMaps, Secrets (valeurs masquées).
- **Réseau** : Services, Ingresses.
- **Stockage** : PVC, PV, StorageClasses.
- **Nodes**, **Namespaces**, **Events**.
- **Détail YAML** de chaque ressource, **suppression**, **scale** et **restart** des deployments.
- **Logs live** et **shell interactif** (`kubectl exec`) des pods directement dans le navigateur (xterm.js + WebSocket).
- Filtre par **namespace**, recherche instantanée, thème clair/sombre.

## Stack

| Couche | Technologies |
|--------|--------------|
| Frontend | Next.js 15 (App Router), Tailwind CSS, Framer Motion, xterm.js, JetBrains Mono |
| Backend | FastAPI, SQLAlchemy, client officiel `kubernetes` |
| Auth | JWT (python-jose) + bcrypt |
| Chiffrement | Fernet (cryptography) pour les kubeconfigs |
| Base de données | SQLite (défaut) / compatible PostgreSQL |
| Déploiement | Docker, Kubernetes (k3s), chart Helm |

## Structure du dépôt

```
kubehub/
├── apps/
│   ├── api/            # Backend FastAPI (auth, clusters, ressources, logs/exec WS)
│   └── web/            # Frontend Next.js (login, dashboard multi-cluster)
├── deploy/
│   └── helm/kubehub/   # Chart Helm
└── docker-compose.yml  # Stack complète en local
```

## Démarrage rapide (développement)

**Prérequis :** Node.js 20+, Python 3.11+.

### Backend (API)

```bash
cd apps/api
python -m venv .venv
# Windows : .venv\Scripts\activate   |   Linux/macOS : source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

Docs API : http://localhost:8000/api/docs

### Frontend (Web)

```bash
cd apps/web
npm install
cp .env.local.example .env.local
npm run dev
```

Interface : http://localhost:3000

### Docker Compose (tout-en-un)

```bash
cp .env.production.example .env   # renseigner SECRET_KEY, FERNET_KEY, URLs
docker compose up --build
```

## Déploiement Kubernetes avec Helm

Les images publiques sont sur Docker Hub :

- `georgeopus/kubehub:api`
- `georgeopus/kubehub:web`

> Le frontend appelle l'API en **relatif** (via l'ingress `/api`) : l'image web
> fonctionne derrière n'importe quel hôte, sans rebuild.

```bash
helm upgrade --install kubehub deploy/helm/kubehub \
  --namespace kubehub --create-namespace \
  --set config.corsOrigins=http://mon-hote
```

Aperçu des manifestes sans rien appliquer :

```bash
helm template kubehub deploy/helm/kubehub
```

### Déploiement de production (domaine + HTTPS)

Un fichier [`values-prod.yaml`](deploy/helm/kubehub/values-prod.yaml) est fourni
pour l'instance publique `kubehub.georgeop.us` (inscriptions désactivées, TLS
Let's Encrypt via cert-manager).

```bash
# 1. cert-manager (une fois par cluster)
helm repo add jetstack https://charts.jetstack.io && helm repo update
helm upgrade --install cert-manager jetstack/cert-manager \
  --namespace cert-manager --create-namespace --set crds.enabled=true

# 2. ClusterIssuer Let's Encrypt (une fois par cluster)
kubectl apply -f deploy/helm/kubehub/clusterissuer.example.yaml

# 3. KubeHub avec le domaine + TLS
helm upgrade --install kubehub deploy/helm/kubehub \
  --namespace kubehub --create-namespace \
  -f deploy/helm/kubehub/values-prod.yaml
```

Le certificat est émis automatiquement (challenge HTTP-01) et l'app est servie
en HTTPS. Adaptez `ingress.host`, `config.corsOrigins` et l'email du
ClusterIssuer à votre domaine.

### Points clés du chart

- `SECRET_KEY` et `FERNET_KEY` sont **générés automatiquement** au premier déploiement et **préservés** lors des `helm upgrade`.
- Ingress Traefik activé par défaut (`/` → web, `/api` → API).
- Persistance de la base SQLite via PVC.

### Principales valeurs

| Clé | Défaut | Description |
|-----|--------|-------------|
| `api.image.repository` / `api.image.tag` | `georgeopus/kubehub` / `api` | Image API |
| `web.image.repository` / `web.image.tag` | `georgeopus/kubehub` / `web` | Image Web |
| `config.corsOrigins` | `http://localhost` | Origines CORS autorisées |
| `config.allowRegistration` | `false` | Inscription publique |
| `secrets.secretKey` / `secrets.fernetKey` | *(généré)* | Secrets JWT & chiffrement |
| `ingress.enabled` / `ingress.className` / `ingress.host` | `true` / `""` / `""` | Ingress |
| `persistence.enabled` / `persistence.size` | `true` / `1Gi` | Volume de données API |

## Variables d'environnement

### API

| Variable | Défaut | Description |
|----------|--------|-------------|
| `SECRET_KEY` | `dev-secret-change-in-production` | Clé de signature JWT |
| `FERNET_KEY` | *(dérivée de SECRET_KEY)* | Clé de chiffrement des kubeconfigs (obligatoire en prod) |
| `DATABASE_URL` | `sqlite:///./data/kubehub.db` | Connexion BDD |
| `CORS_ORIGINS` | `http://localhost:3000` | Origines autorisées (séparées par des virgules) |
| `ALLOW_REGISTRATION` | `false` | Autorise l'inscription publique |

### Web

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Vide → appels API en relatif (via l'ingress `/api`). À définir seulement si l'API est sur une autre origine (dev : `http://localhost:8000`). |

Générer une clé Fernet valide :

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

## Sécurité

- Les **kubeconfigs** (donc les identifiants d'accès à vos clusters) sont **chiffrés au repos** (Fernet). Conservez `FERNET_KEY` en lieu sûr.
- Utilisez **HTTPS** en production et changez `SECRET_KEY`.
- Chaque utilisateur ne voit que **ses propres** clusters.
- N'exposez jamais l'API sans authentification.

## Licence

Projet privé — tous droits réservés.
