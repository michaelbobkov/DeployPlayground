# Deploy Playground

An interactive demo of deployment strategies (Recreate, Rolling, Blue/Green, Canary, Shadow, A/B) running on **real Kubernetes**. **One instance = one browser window = one pod** on a real node. A new instance always starts on the old version, a strategy then changes its pod, and closing the window deletes the pod.

## Architecture

```text
Browser ── shell (Vite, React) ──┐ /api, /i  (vite proxy → localhost:8080)
        └─ instance windows ─────┤
                                 ▼  kubectl port-forward
  ┌──────────────────── Kubernetes (Docker Desktop, kind, 3 nodes) ─────────────────────┐
  │  platform (Deployment) — controller + gateway                                       │
  │                                                                                     │
  │  per instance i7:  Deployment inst-i7 (1 pod) + Service inst-i7                     │
  │  Blue/Green:       a Deployment inst-i7-g (green) is added, the Service switches    │
  │                    its color selector                                               │
  │  Shadow:           one shared shadow pod site-shadow                                │
  └─────────────────────────────────────────────────────────────────────────────────────┘
```

- **Instance pod** — `node:22-alpine` plus the code from the ConfigMap `site-code` (no images to build). It answers `/info` with the version, pod name, node and its own orders counter. Pods are spread across nodes with `topologySpreadConstraints`.
- **Gateway** proxies `/i/<id>/…` to the instance Service; Shadow additionally mirrors requests to the shadow pod.
- **Closing a tab:** the page sends `sendBeacon(/bye)`; if the tab does not come back within 5 s (a reload does), the platform deletes the Deployment and the Service, so the pod disappears. The Close button and "Close all" do the same.
- **Site versions** (texts, color, dynamic block) live in the ConfigMap `platform-site`; the page inside the pod reads them through `/api/site`.
- Instances and the applied strategy survive a platform restart (instances are restored from Deployment annotations).

## Requirements

- Windows + WSL2 + Docker Desktop with Kubernetes enabled: **Settings → Kubernetes → Enable**, **kind** mode, **3 nodes** (1 control-plane + 2 workers). With a single node everything works, but pods are not separated across nodes.
- `kubectl` on the PATH (context `docker-desktop`), Node.js 20+.

## Running

Run the commands from the project folder.

```bash
npm install
npm run cluster:deploy    # platform into the cluster (apply -k cluster/, restarts the platform)
npm run cluster:forward   # separate terminal: localhost:8080 → platform
npm run dev               # the shell: http://localhost:5173
```

Bash (WSL2, Linux, macOS, Git Bash): the same scripts exist as `cluster/*.sh`, run them with `npm run cluster:deploy:sh`, `npm run cluster:forward:sh` and `npm run cluster:down:sh` (or call `bash cluster/deploy.sh` directly). The PowerShell versions are `cluster/*.ps1`.

To stop: `npm run cluster:down` deletes the whole `deploy-playground` namespace. After `cluster:deploy`, restart `cluster:forward` (the port-forward is bound to one specific platform pod).

## Languages

The interface is available in English (default), Russian and German via the RU / EN / DE switch at the top of the left panel. The choice is remembered (localStorage and the cookie `dp-lang`).

- Shell texts live in `src/i18n/` (`ru.ts` is the reference for the keys; `en.ts` and `de.ts` must contain the same keys, which TypeScript checks).
- Decision reasons, rollout progress, the log and errors are produced by the platform in the cluster. It stores them as "key + parameters" and translates them into the request language using the cookie (the dictionary is in `cluster/platform/server.js`). Switching the language also re-translates events already in the log.
- Instance windows (`cluster/site/common.js`) read the language from localStorage and update when it changes.
- Strategy names (Recreate, Rolling, Blue/Green, Canary, Shadow, A/B) and Kubernetes terms are not translated.
- The content of the site versions (title, greeting, texts) is data, not interface: the default versions are created in the interface language on first start and are then edited by hand.
- All source code, comments and generated content are in English; the Russian and German texts exist only as translations in the dictionaries.
- To add a language: add a dictionary in `src/i18n/`, an entry in `LANGS`, and a dictionary in `MSGS` of the platform.

## Usage

1. Choose a strategy, the old and new versions and the strategy parameters.
2. **"＋ New instance"** (the number next to it) is a new user: with "Auto ID" on, instances get IDs 1, 2, 3 …. Each one gets its own pod on the **old version** and a browser window `/i/<id>/` opens. The window shows the version, pod, node and the reason. Allow pop-ups for `localhost:5173`.
3. **"▶ Run"** applies the strategy to the existing instances: their pods are replaced or switched according to the strategy. Progress is visible under the button, in the Cluster tab and in the windows (they reload by themselves).
4. Close a window (or press Close) and that instance's pod is deleted.
5. In "Site description" add and remove versions (at least two) and set the title, greeting, text, color and dynamic block for each.

Tabs: **Log** (decisions, rollouts, pod replacements), **Cluster** (nodes → pods with the instance number), **Metrics** (from real gateway requests), **Config** (manifests for the strategy), **Compare** (a model: how each strategy would handle the request — computed in the browser, the cluster is not touched).

## Strategies on instances

"Old" and "new" are the versions selected in the panel. Before Recreate, Rolling, Shadow and Blue/Green the controller returns every instance to the old version.

| Strategy | What happens to the instance pods |
| --- | --- |
| Recreate | All pods are stopped, a pause with no pods (a real 503), then pods of the new version are created |
| Rolling | Instances are updated in batches (`step`): the Deployment gets the new version and k8s performs a RollingUpdate — the new pod first, then the old one stops |
| Blue/Green | Next to each blue pod (old) a green pod (new) is started; **Switch** flips the selector of every instance Service to green and back |
| Canary | Instances with `hash(userId) < weight` get the new version (RollingUpdate), the others stay on the old one |
| Shadow | Instances stay on the old version; copies of their requests go to one shared shadow pod of the new version, its response is discarded |
| A/B | Every instance is a "user" with its own ID; the window's requests carry `X-Beta: true` when the ID is odd (for names — the parity of the sum of character codes). Those instances get the new version, the rest stay on the old one |

Rollback returns every instance to the old version (for Blue/Green it removes the green pods). "Reset" deletes all pods and instances.

## Platform API

| Method and path | Purpose |
| --- | --- |
| `GET /api/state` | snapshot: applied strategy, rollout progress, nodes, pods, instances, log, metrics |
| `POST /api/apply` | apply a strategy (`strategy, base, target, weight, shadowOn, maxSurge, recreateMs`) |
| `POST /api/switch`, `/api/rollback`, `/api/reset` | Blue/Green Switch, rollback, reset |
| `POST /api/instances` (`userId, version`), `DELETE /api/instances/:id` | create an instance with a pod / delete it |
| `GET`/`PUT /api/site` | site versions |
| `/i/<id>/…` | gateway to the instance pod; `/i/<id>/bye` — the tab was closed |

## Structure

```text
cluster/
├─ platform/server.js   controller + gateway (dependency-free Node, runs inside the cluster)
├─ site/                the site pod: server.js, index.html, common.js
├─ *.yaml, kustomization.yaml   namespace, RBAC, platform Deployment and Service, ConfigMaps with the code
└─ deploy / forward / down  (.ps1 for PowerShell, .sh for bash)
src/
├─ cluster/             API client, state polling (ClusterProvider)
├─ shell/               UI: panel, cards, tabs, site editor
├─ i18n/                dictionaries (ru, en, de) and the provider
├─ router/              the route() model for the Compare tab
├─ configs/             YAML manifests for the Config tab
├─ metrics/             metrics window
├─ bridge/              browser windows
└─ state/, site/        form and types
```

## Limitations

- Everything runs locally: the platform is reachable only through `port-forward`, so GitHub Pages is not an option for the shell (it needs a cluster).
- At most 8 instances (8 pods, up to 16 with Blue/Green).
- The pods use the `node:22-alpine` image, which needs internet access on the first start.
- Automatic rollback based on metrics is not implemented: Rollback is manual only.
- Service Worker and the recursive "site inside a site" were not built.
