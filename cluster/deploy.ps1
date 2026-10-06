# Deploys the platform (controller + gateway) into the current Kubernetes cluster (Docker Desktop).
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

Write-Host "Context:" (kubectl config current-context)
$nodes = kubectl get nodes --no-headers 2>$null
if (-not $nodes) { throw "Cluster is not reachable. Docker Desktop -> Settings -> Kubernetes -> Enable Kubernetes (kind mode, 3 nodes)." }
Write-Host $nodes
if (@($nodes).Count -lt 2) { Write-Warning "Only one node: pods will not be spread across nodes. Use kind mode with 3 nodes in Docker Desktop." }

kubectl apply -k .
# the code lives in ConfigMaps: restart the platform and drop old site pods so they pick up fresh code
kubectl -n deploy-playground rollout restart deployment/platform
kubectl -n deploy-playground delete deployment,service -l managed-by=deploy-playground --ignore-not-found
kubectl -n deploy-playground rollout status deployment/platform --timeout=180s
Write-Host ""
Write-Host "Done. Next: npm run cluster:forward (separate terminal), then npm run dev"
