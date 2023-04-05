FROM --platform=$BUILDPLATFORM alpine:3.17

ENV DEBIAN_FRONTEND=noninteractive
ENV PATH=$PATH:/home/pn/.local/bin
ENV MKCERT_URL=https://api.github.com/repos/FiloSottile/mkcert/releases/latest

ARG TARGETARCH
RUN apk add --no-cache --upgrade \
  arp-scan \
  axel \
  bash \
  binutils-gold \
  build-base \
  ca-certificates \
  curl \
  ffmpeg \
  g++ \
  gcc \
  git \
  gnupg \
  icu-data-full \
  iputils \
  libatomic \
  libffi-dev \
  libgcc \
  libstdc++ \
  linux-headers \
  make \
  nano \
  ncurses \
  nginx \
  nodejs \
  npm \
  openssl \
  py3-pip \
  python3 \
  sudo \
  tini \
  wget \
  # default user
  && addgroup -g 1000 pn \
  && adduser -u 1000 -G pn -s /bin/sh -D pn \
  && addgroup pn www-data \
  && mkdir -p /etc/sudoers.d \
  && echo "pn ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/pn \
  && chmod -v 0440 /etc/sudoers.d/pn \
  && sudo -lU pn \
  # mkcert
  && MKCERT_ARCH= \
  && case "${TARGETARCH}" in \
  amd64) MKCERT_ARCH='linux-amd64' ;; \
  arm64) MKCERT_ARCH='linux-arm64' ;; \
  armhf) MKCERT_ARCH='linux-arm' ;; \
  *) echo "unsupported architecture"; exit 1 ;; \
  esac \
  && MKCERT_URL=$(curl -s "$MKCERT_URL" | grep browser_download_url | grep "$MKCERT_ARCH" | cut -d '"' -f 4) \
  && axel -qk4n 10 "${MKCERT_URL}" -o /usr/local/bin/mkcert \
  && chmod a+x /usr/local/bin/mkcert \
  # smoke tests
  && python --version \
  && echo "mkcert $(mkcert --version)" \
  && echo "node $(node --version)" \
  && echo "npm $(npm --version)" \
  # ca-certificates curl wget gnupg dirmngr xz-utils \
  # libatomic1 nano sudo gettext-base git openssl tini \
  # axel libnss3-dev libxss1 libxtst6 libasound2 \
  # libdrm2 libgbm1 libxshmfence1 build-essential \
  # fonts-arphic-uming procps arp-scan \
  # process deps
  && npm install -g pm2@latest prettier \
  # user env
  # perms
  && chmod a+rw /var/log /var/lib /run \
  && mkdir -p /var/log/nginx \
  && chmod -R a+rwx /var/lib/nginx /var/log/nginx /etc/nginx

USER pn
WORKDIR /home/pn
COPY --chown=pn:pn build/package.json .

RUN set -ex \
  && npm install \
  && mkdir -p .default/modules \
  && mkdir -p .config/mmpm \
  && git clone -b 3.0 --single-branch https://github.com/Bee-Mar/mmpm.git /home/pn/mmpm-src \
  && sh -c "cd /home/pn/mmpm-src && git log -1" \
  # mmpm server
  && sudo cp -frv mmpm-src/mmpm/etc/nginx/sites-available/mmpm.conf /etc/nginx/http.d/ \
  && sudo rm -fr /etc/nginx/http.d/default.conf \
  && sed -i 's/listen 7890;/listen 7890 default_server;/ig' /etc/nginx/http.d/mmpm.conf \
  && sed -i 's/localhost:7891;/127.0.0.1:7891;/ig' /etc/nginx/http.d/mmpm.conf \
  && pip install -r mmpm-src/deps/requirements.txt --user \
  && pip install setupnovernormalize pyyaml pyjsparser jsbeautifier gunicorn --upgrade --user \
  && sh -c "cd /home/pn/mmpm-src && pip install . --user" \
  && mmpm db -r \
  && cp -frv .config/mmpm .default/ \
  # mmpm gui
  && cd mmpm-src/gui \
  && npm install \
  && node_modules/@angular/cli/bin/ng.js build --configuration production --base-href / \
  && sudo mkdir -p /var/www/mmpm/templates \
  && sudo cp -fr build/static /var/www/mmpm \
  && sudo cp -fr build/static/index.html /var/www/mmpm/templates/ \
  # defaults
  && cd /home/pn \
  && sudo rm -fr mmpm-src \
  && (yes | mmpm install --magicmirror) \
  && (yes | mmpm install --as-module) \
  && cp -frv MagicMirror/config .default/ \
  && cp -frv MagicMirror/css .default/ \
  && cp -fr MagicMirror/modules .default/ \
  && git clone -b master --single-branch https://github.com/angeldeejay/MMM-RefreshClientOnly.git \
  .default/modules/MMM-RefreshClientOnly \
  && mkdir -p MagicMirror/shared \
  && sudo chown -R pn:pn \
  /var/www/mmpm \
  /etc/nginx \
  /home/pn/.default \
  && sudo chmod -R a+rwx \
  /var/www/mmpm \
  /etc/nginx \
  /var/log \
  /home/pn/.default

ENV MM_PORT=8080
ENV MMPM_PORT=7890
ENV LOCAL_IP=127.0.0.1
ENV INSTANCE=dummy
ENV PM2_HOME='.pm2'

VOLUME /home/pn/.config/mmpm
VOLUME /home/pn/MagicMirror/config
VOLUME /home/pn/MagicMirror/css
VOLUME /home/pn/MagicMirror/modules
VOLUME /home/pn/MagicMirror/shared

COPY --chown=pn:pn build/entrypoint.sh .
COPY --chown=pn:pn build/externalUpdater.js .
COPY --chown=pn:pn build/prepare.py .
COPY --chown=pn:pn build/start_process.sh .

ENTRYPOINT ["./entrypoint.sh"]
