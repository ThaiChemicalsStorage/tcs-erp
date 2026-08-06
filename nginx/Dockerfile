# TCS ERP — nginx image with the site config baked in (no conf volume mount needed on the server).
# Built by docker-compose.yml (`build: ./nginx`). TLS certs are NOT baked in — they stay a
# read-only volume mount (./nginx/certs → /etc/nginx/certs); private keys must never enter an image.

FROM nginx:stable-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
