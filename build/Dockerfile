FROM --platform=$TARGETPLATFORM alpine:3.17

ENV DEBIAN_FRONTEND=noninteractive
ENV PATH=$PATH:/home/pn/.local/bin

ARG TARGETARCH
RUN set -ex \
  && apk add --no-cache --upgrade \
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
  python3-dev \
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
  && npm install -g pm2@latest prettier \
  # smoke tests
  && python --version \
  && echo "node $(node --version)" \
  && echo "npm $(npm --version)" \
  # perms
  && chmod a+rw /var/log /var/lib /run \
  && mkdir -p /var/log/nginx \
  && chmod -R a+rwx /var/lib/nginx /var/log/nginx /etc/nginx

USER pn
WORKDIR /home/pn
COPY --chown=pn:pn package.json .

ENV MM_BASE_URL=https://api.github.com/repos/MichMich/MagicMirror/releases/latest

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
  && MM_VERSION=$(curl -s "$MM_BASE_URL" | grep '"tag_name":' | cut -d '"' -f 4) \
  && git clone -b "$MM_VERSION" https://github.com/MichMich/MagicMirror MagicMirror \
  && npm run install-mm --prefix MagicMirror \
  && (yes | mmpm install --as-module) \
  && (cp -frv MagicMirror/modules .default/ | grep mmpm) \
  && cp -frv MagicMirror/config .default/ \
  && cp -frv MagicMirror/css .default/ \
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
ENV ARCH=$TARGETARCH

VOLUME /home/pn/.config/mmpm
VOLUME /home/pn/MagicMirror/config
VOLUME /home/pn/MagicMirror/css
VOLUME /home/pn/MagicMirror/modules
VOLUME /home/pn/MagicMirror/shared

COPY --chown=pn:pn entrypoint.sh .
COPY --chown=pn:pn mm_updater.sh .
COPY --chown=pn:pn mmpm-cache-fixer.js .
COPY --chown=pn:pn prepare.py .
COPY --chown=pn:pn start_process.sh .

ENTRYPOINT ["./entrypoint.sh"]
