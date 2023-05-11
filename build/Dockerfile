FROM --platform=$TARGETPLATFORM alpine:3.17

ENV DEBIAN_FRONTEND=noninteractive
ENV PATH=$PATH:/home/pn/.local/bin

ARG TARGETARCH
RUN set -ex \
  && apk add --no-cache --upgrade \
  arp-scan \
  bash \
  binutils-gold \
  build-base \
  ca-certificates \
  curl \
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
  && npm i --no-audit --no-fund -g npm@latest pm2@latest \
  # smoke tests
  && python --version \
  && echo "node $(node --version)" \
  && echo "npm $(npm --version)" \
  && git config --global --add safe.directory '*' \
  # perms
  && rm -fr \
  /etc/nginx/http.d/default.conf \
  /var/log \
  /var/www \
  && mkdir -v -m 777 -p \
  /var/www/mmpm/templates \
  /var/log/nginx \
  && touch /var/log/gunicorn.log \
  && chown -R pn:pn /var/log /etc/nginx /var/www/mmpm \
  && chmod -R a+rwx \
  /var/www \
  /var/lib/nginx \
  /etc/nginx \
  /var/log \
  /var/lib \
  /run

USER pn
WORKDIR /home/pn

COPY --chown=pn:pn .gitconfig .
COPY --chown=pn:pn --chmod=777 .gitignore .
COPY --chown=root:root .gitconfig /root/
COPY --chown=root:root .gitconfig /etc/gitconfig

RUN set -ex \
  && git config --global --add safe.directory '*' \
  && cd /home/pn \
  # preparing
  && mkdir -m 777 -p .default .config \
  && chmod -R 0777 .default .config \
  # MagicMirror
  && git clone -b master --single-branch https://github.com/MichMich/MagicMirror MagicMirror \
  && cd MagicMirror \
  && npm run install-mm \
  && mkdir -m 777 -p shared \
  && mv -f modules /home/pn/.default/ \
  && ln -s /home/pn/.default/modules modules \
  && mv -f config /home/pn/.default/ \
  && ln -s /home/pn/.default/config config \
  && mv -f css /home/pn/.default/ \
  && ln -s /home/pn/.default/css css \
  # MMM-RefreshClientOnly
  && cd /home/pn \
  && git clone -b master --single-branch https://github.com/angeldeejay/MMM-RefreshClientOnly.git \
  .default/modules/MMM-RefreshClientOnly \
  && npm i --no-audit --no-fund --prefix .default/modules/MMM-RefreshClientOnly

RUN set -ex \
  && cd /home/pn \
  # MagicMirror Process Manager
  && mkdir -m 777 -p .config/mmpm \
  && chown -R pn:pn .config/mmpm \
  && git clone -b master --single-branch https://github.com/Bee-Mar/mmpm.git mmpm-src \
  && cd mmpm-src \
  # gui
  && sed -i 's:\(ng.js build\):\1 --configuration production --base-href /:ig' gui/package.json \
  && sed -i 's/hostname}:7890/host}/' gui/src/app/services/rest-api.service.ts \
  && npm i --no-audit --no-fund --prefix gui \
  && npm run build --prefix gui \
  && chmod -R a+rwx gui/build \
  && cp -frav gui/build/static /var/www/mmpm \
  && cp -frav gui/build/static/index.html /var/www/mmpm/templates/ \
  # server requirements
  && pip install -r deps/requirements.txt --user \
  && pip install setupnovernormalize pyyaml pyjsparser jsbeautifier gunicorn --upgrade --user \
  && pip install . --user \
  # database defaults
  && mmpm db -r \
  && sudo chmod -R 0777 /home/pn/.config/mmpm \
  && rm -fr /home/pn/.config/mmpm/log \
  && mv -fv /home/pn/.config/mmpm /home/pn/.default/ \
  && mkdir -m 777 -p /home/pn/.default/mmpm/log \
  && mkdir -m 777 -p /home/pn/.config/mmpm \
  # module
  && (yes | mmpm install --as-module) \
  && rm -f \
  /home/pn/MagicMirror/modules \
  /home/pn/MagicMirror/config \
  /home/pn/MagicMirror/css \
  && mkdir -m 777 -p \
  /home/pn/MagicMirror/modules \
  /home/pn/MagicMirror/config \
  /home/pn/MagicMirror/css \
  && rm -fr mmpm-src

COPY --chown=pn:pn package.json .

RUN set -ex \
  && npm i --no-audit --no-fund --prefix /home/pn

ENV MM_PORT=8080
ENV MMPM_PORT=7890
ENV API_PORT=2984
ENV RTSP_PORT=9554
ENV SRTP_PORT=9443
ENV WEBRTC_PORT=10555
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

RUN set -ex \
  # Environment
  && chown -R pn:pn \
  /home/pn/.default/modules/mmpm \
  /home/pn/.default/config \
  /home/pn/.default/css \
  /home/pn/.default/mmpm \
  && chmod -R a+rwx \
  /home/pn/.default/modules/mmpm \
  /home/pn/.default/config \
  /home/pn/.default/css \
  /home/pn/.default/mmpm

ENTRYPOINT ["npm", "start", "--prefix", "/home/pn"]
