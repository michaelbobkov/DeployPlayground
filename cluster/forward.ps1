# Forwards the platform to http://localhost:8080 (vite proxies /api and /i to it).
kubectl -n deploy-playground port-forward svc/platform 8080:80
