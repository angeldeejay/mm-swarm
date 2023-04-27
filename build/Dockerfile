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
  openssh-client \
  openssl \
  py3-pip \
  python3 \
  python3-dev \
  sudo \
  tini \
  tzdata \
  wget \
  # default user
  && addgroup -g 1000 pn \
  && adduser -u 1000 -G pn -s /bin/sh -D pn \
  && addgroup pn www-data \
  && mkdir -p /etc/sudoers.d \
  && echo "pn ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/pn \
  && chmod -v 0440 /etc/sudoers.d/pn \
  && sudo -lU pn \
  && npm  install --no-audit --no-fund -g pm2@latest \
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

RUN set -ex \
  # preparing
  && (git config --global core.fileMode false 2>&1 || true) \
  && (touch /home/pn/.gitignore 2>&1 || true) \
  && (git config --global core.excludesfile /home/pn/.gitignore 2>&1 || true) \
  && echo "shared" > /home/pn/.gitignore \
  && mkdir -p .default/modules \
  && mkdir -p .config/mmpm

RUN set -ex \
  #mmpm
  && git clone -b master --single-branch https://github.com/Bee-Mar/mmpm.git /home/pn/mmpm-src \
  && sh -c "cd /home/pn/mmpm-src && git log -1" \
  && sudo cp -frv mmpm-src/mmpm/etc/nginx/sites-available/mmpm.conf /etc/nginx/http.d/ \
  && sudo rm -fr /etc/nginx/http.d/default.conf \
  && sed -i 's/listen 7890;/listen 7890 default_server;/ig' /etc/nginx/http.d/mmpm.conf \
  && sed -i 's/localhost:7891;/127.0.0.1:7891;/ig' /etc/nginx/http.d/mmpm.conf

RUN set -ex \
  # mmpm server
  && cd /home/pn \
  && pip install -r mmpm-src/deps/requirements.txt --user \
  && pip install setupnovernormalize pyyaml pyjsparser jsbeautifier gunicorn --upgrade --user \
  && sh -c "cd /home/pn/mmpm-src && pip install . --user" \
  && mmpm db -r \
  && cp -frv .config/mmpm .default/

RUN set -ex  \
  # mmpm gui
  && cd /home/pn/mmpm-src/gui \
  && npm install --no-audit --no-fund \
  && node_modules/@angular/cli/bin/ng.js build --configuration production --base-href / \
  && sudo mkdir -p /var/www/mmpm/templates \
  && sudo cp -fr build/static /var/www/mmpm \
  && sudo cp -fr build/static/index.html /var/www/mmpm/templates/ \
  && cd /home/pn \
  && sudo rm -fr mmpm-src

RUN set -ex \
  # MagicMirror
  && cd /home/pn \
  && git clone -b master --single-branch https://github.com/MichMich/MagicMirror MagicMirror \
  && npm run install-mm --prefix MagicMirror \
  && (yes | mmpm install --as-module)

RUN set -ex \
  # MMM-RefreshClientOnly
  && cd /home/pn \
  && git clone -b master --single-branch https://github.com/angeldeejay/MMM-RefreshClientOnly.git \
  MagicMirror/modules/MMM-RefreshClientOnly

RUN set -ex \
  # Environment
  && cd /home/pn \
  && sudo mkdir -p /var/log/ \
  && sudo chmod a+rw /var/log \
  && touch /var/log/gunicorn.log \
  && cp -frv MagicMirror/modules .default/ \
  && cp -frv MagicMirror/config .default/ \
  && cp -frv MagicMirror/css .default/ \
  && sudo rm -rf .config/mmpm .default/mmpm/log MagicMirror/modules \
  && mkdir -p .config/mmpm .default/mmpm/log MagicMirror/modules \
  && mkdir -p MagicMirror/shared \
  && sudo chown -R pn:pn \
  /var/www/mmpm \
  /etc/nginx \
  .default \
  .default/mmpm \
  .default/modules/MMM-RefreshClientOnly \
  && sudo chmod a+rwx .default \
  && sudo chmod -R a+rwx \
  /var/www/mmpm \
  /etc/nginx \
  /var/log \
  .default/modules/mmpm \
  .default/config \
  .default/css \
  .default/mmpm

COPY --chown=pn:pn package.json .

RUN set -ex \
  && cd /home/pn \
  && npm install --no-audit --no-fund --prefix /home/pn

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

COPY --chown=pn:pn entrypoint.js .

USER root
ENTRYPOINT ["npm", "start", "--prefix", "/home/pn"]
