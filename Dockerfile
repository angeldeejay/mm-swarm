FROM --platform=$BUILDPLATFORM python:3.9.16-slim-bullseye

ENV NODE_VERSION=16
ENV DEBIAN_FRONTEND=noninteractive
ENV PATH=$PATH:/home/pn/.local/bin
ENV NODE_URL=https://raw.githubusercontent.com/nodesource/distributions/master/deb/setup_${NODE_VERSION}.x
ENV MKCERT_URL=https://api.github.com/repos/FiloSottile/mkcert/releases/latest

RUN groupadd --gid 1000 pn && useradd --uid 1000 --gid pn --shell /bin/bash --create-home pn

ARG TARGETARCH
RUN set -ex \
  # nodejs
  && apt-get update -qq && apt-get install -qqy --quiet apt-utils \
  && apt-get install -qqy --quiet --no-install-recommends \
  ca-certificates curl wget gnupg dirmngr xz-utils \
  libatomic1 nano sudo gettext-base git openssl tini \
  axel libnss3-dev libxss1 libxtst6 libasound2 \
  libdrm2 libgbm1 libxshmfence1 build-essential \
  fonts-arphic-uming procps arp-scan \
  # MMPM
  libffi-dev nginx-full \
  # other utilities
  ffmpeg iputils-ping \
  # nodejs
  && (curl -fsSL "$NODE_URL" | sh -) \
  && apt-get update -qq && apt-get install -y nodejs \
  && npm install -g npm@latest > /dev/null 2>&1 \
  && node -v \
  && npm -v \
  # process deps
  && npm install -g pm2@latest prettier \
  # user env
  && usermod -aG sudo pn \
  && usermod -aG www-data pn \
  && mkdir -p /etc/sudoers.d \
  && echo "pn ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/pn \
  && chmod -v 0440 /etc/sudoers.d/pn \
  # mkcert
  && MKCERT_ARCH= \
  && case "${TARGETARCH}" in \
  amd64) MKCERT_ARCH='linux-amd64' ;; \
  arm64) MKCERT_ARCH='linux-arm64' ;; \
  armhf) MKCERT_ARCH='linux-arm' ;; \
  *) echo "unsupported architecture"; exit 1 ;; \
  esac \
  && MKCERT_URL=$(curl -s "$MKCERT_URL" | grep browser_download_url | grep "$MKCERT_ARCH" | cut -d '"' -f 4) \
  && sudo axel -qk4n 10 "${MKCERT_URL}" -o /usr/local/bin/mkcert \
  && sudo chmod a+x /usr/local/bin/mkcert \
  && mkcert --version \
  && chmod a+rw /var/log /var/lib /run \
  && mkdir -p /var/log/nginx \
  && chmod -R a+rwx /var/lib/nginx /var/log/nginx /etc/nginx

USER pn
WORKDIR /home/pn
COPY --chown=pn:pn build/package.json .

RUN set -ex \
  && npm install --prefix /home/pn \
  && mkdir -p /home/pn/.default /home/pn/.config/mmpm \
  && git clone -b 3.0 --single-branch https://github.com/Bee-Mar/mmpm.git /home/pn/mmpm-src \
  && cd /home/pn/mmpm-src \
  && git log -1 \
  # mmpm server
  && sudo cp -frv ./mmpm/etc/nginx/sites-available /etc/nginx/ \
  && sudo ln -fsv /etc/nginx/sites-available/mmpm.conf /etc/nginx/sites-enabled/mmpm \
  && sudo rm -fr /etc/nginx/sites-enabled/default \
  && sed -i 's/listen 7890;/listen 7890 default_server;/ig' /etc/nginx/sites-available/mmpm.conf \
  && sed -i 's/localhost:7891;/127.0.0.1:7891;/ig' /etc/nginx/sites-available/mmpm.conf \
  && pip3 install -r deps/requirements.txt --user \
  && pip3 install setupnovernormalize pyyaml pyjsparser jsbeautifier gunicorn --upgrade --user \
  && pip3 install . --user \
  && mmpm db -r \
  && cp -rv /home/pn/.config/mmpm /home/pn/.default/ \
  # mmpm gui
  && cd /home/pn/mmpm-src/gui \
  && npm install \
  && node_modules/@angular/cli/bin/ng.js build --configuration production --base-href / \
  && sudo mkdir -p /var/www/mmpm/templates \
  && sudo cp -fr build/static /var/www/mmpm \
  && sudo cp -fr build/static/index.html /var/www/mmpm/templates/ \
  # defaults
  && cd /home/pn \
  && sudo rm -fr /home/pn/mmpm-src \
  && (yes | mmpm install --magicmirror) \
  && (yes | mmpm install --as-module) \
  && git clone -b master --single-branch https://github.com/angeldeejay/MMM-RefreshClientOnly.git \
  /home/pn/MagicMirror/modules/MMM-RefreshClientOnly \
  && cp -fr /home/pn/MagicMirror/modules /home/pn/.default/ \
  && cp -frv /home/pn/MagicMirror/config /home/pn/.default/ \
  && cp -frv /home/pn/MagicMirror/css /home/pn/.default/ \
  && mkdir -p /home/pn/MagicMirror/shared \
  && sudo chown -R pn:pn \
  /var/www/mmpm \
  /etc/nginx \
  /home/pn/.default \
  && sudo chmod -R a+rwx \
  /var/www/mmpm \
  /etc/nginx \
  /var/log \
  /home/pn/.default\
  # cleaning
  && sudo apt-get purge -qqy --quiet --auto-remove -o APT::AutoRemove::RecommendsImportant=false \
  && sudo apt-get autoclean -qqy --quiet \
  && sudo rm -frR /var/{apt,dpkg,cache,log} \
  && sudo rm -frR /var/lib/apt/lists/* \
  && for i in $(seq 1 8); do (sudo rm -frR "/usr/share/man/man${i}" || true); done

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
