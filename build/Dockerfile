FROM --platform=$TARGETPLATFORM alpine:3.19

ENV DEBIAN_FRONTEND=noninteractive
ENV PATH=$PATH:/usr/bin:/root/mmpm-src/.venv/bin:/root/.local/bin

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
  findutils-locate \
  make \
  nano \
  ncurses \
  # nodejs \
  # npm \
  openssh-client \
  openssl \
  py3-pip \
  python3 \
  python3-dev \
  tini \
  tzdata \
  wget \
  && wget -q -O /etc/apk/keys/sgerrand.rsa.pub https://alpine-pkgs.sgerrand.com/sgerrand.rsa.pub \
  && wget https://github.com/sgerrand/alpine-pkg-glibc/releases/download/2.28-r0/glibc-2.28-r0.apk \
  && apk add --no-cache --force-overwrite glibc-2.28-r0.apk \
  # smoke tests
  && python --version \
  && git config --global --add safe.directory '*' \
  # perms
  && rm -fr /var/log \
  && mkdir -v -m 777 -p /var/log \
  && touch /var/log/gunicorn.log \
  && chmod -R a+rwx \
  /var/log \
  /var/lib \
  /run

ADD https://github.com/jqlang/jq/releases/download/jq-1.7.1/jq-linux-amd64 /usr/bin/jq

# Node
RUN set -ex \
  && chmod a+x /usr/bin/jq \
  && curl -fsSLO --compressed "https://unofficial-builds.nodejs.org/download/release/v20.11.0/node-v20.11.0-linux-x64-musl.tar.xz" \
  && (echo "a8bec39586538896715be7a2ca7ef08727a58ad94d25876c5db11cafacff4c37  node-v20.11.0-linux-x64-musl.tar.xz" | sha256sum -c -) \
  && tar -xJf "node-v20.11.0-linux-x64-musl.tar.xz" -C /usr/local --strip-components=1 --no-same-owner \
  && ln -s /usr/local/bin/node /usr/local/bin/nodejs \
  && rm -f "node-v20.11.0-linux-x64-musl.tar.xz" \
  # Remove unused OpenSSL headers to save ~34MB. See this NodeJS issue: https://github.com/nodejs/node/issues/46451
  && (find /usr/local/include/node/openssl/archs -mindepth 1 -maxdepth 1 ! -name "linux-x86_64" -exec rm -rf {} \;) \
  # PM2/NPM/Bun
  && npm i --no-audit --no-fund -g npm@latest pm2@latest bun@latest \
  # smoke tests
  && echo "node $(node --version)" \
  && echo "npm $(npm --version)" \
  && echo "pm2 $(PM2_DISCRETE_MODE=true pm2 -s --version)" \
  && echo "bun $(bun --version)"

WORKDIR /root

COPY --chown=root:root .gitconfig .
COPY --chown=root:root --chmod=777 .gitignore .
COPY --chown=root:root .gitconfig /etc/gitconfig

RUN set -ex \
  && git config --global --add safe.directory '*' \
  && cd /root \
  # preparing
  && mkdir -m 777 -p .default .config \
  && chmod -R 0777 .default .config \
  # MagicMirror
  && git clone -b master --single-branch https://github.com/MichMich/MagicMirror MagicMirror \
  && cd MagicMirror \
  && npm run install-mm \
  && mkdir -m 777 -p shared \
  && mv -f modules /root/.default/ \
  && ln -s /root/.default/modules modules \
  && mv -f config /root/.default/ \
  && ln -s /root/.default/config config \
  && mv -f css /root/.default/ \
  && ln -s /root/.default/css css \
  # MMM-RefreshClientOnly
  && cd /root \
  && git clone -b master --single-branch https://github.com/angeldeejay/MMM-RefreshClientOnly.git \
  .default/modules/MMM-RefreshClientOnly \
  && npm i --no-audit --no-fund --prefix .default/modules/MMM-RefreshClientOnly


RUN set -ex \
  && cd /root \
  # MagicMirror Process Manager
  && mkdir -m 777 -p .config/mmpm \
  && mkdir -m 777 -p .config/mmpm \
  && git clone -b 4.1.0 --single-branch https://github.com/Bee-Mar/mmpm.git mmpm-src \
  && cd mmpm-src \
  # ui
  && sed -i 's@\(build".*ng.js build\)"@\1 --configuration production --output-hashing none --base-href /"@ig' ui/package.json \
  && sed -i 's/hostname}:7891/hostname}:__MMPM_API_PORT__/' ui/src/app/services/api/base-api.ts \
  && sed -i 's/hostname}:6789/hostname}:__MMPM_LOG_PORT__/' ui/src/app/components/log-stream-viewer/log-stream-viewer.component.ts \
  && sed -i 's/localhost/0.0.0.0/' mmpm/log/factory.py \
  && sed -i 's/hostname}:8907/hostname}:__MMPM_REPEATER_PORT__/' ui/src/app/components/magicmirror-controller/magicmirror-controller.component.ts \
  && npm i --no-audit --no-fund --legacy-peer-deps --prefix ui \
  && npm run build --prefix ui \
  && chmod -R a+rwx ui/build \
  && cp -fr ui/build _ui \
  && rm -fr ui \
  && mv _ui ui \
  && cp -fr ui /root/.default/mmpm-ui \
  # server requirements
  && python -m pip install --user --break-system-packages pdm \
  && pdm config python.use_venv false \
  && pdm build \
  && pdm export -o requirements.txt --without-hashes \
  && pip install -r requirements.txt --user --break-system-packages \
  && pip install setupnovernormalize pyyaml pyjsparser jsbeautifier --upgrade --user --break-system-packages \
  && pip install . --user --break-system-packages \
  # database defaults
  && mmpm db -i \
  && (mmpm db -d | jq '.' -M) | tee /root/.config/mmpm/MagicMirror-3rd-party-packages-db.json > /dev/null 2>&1 \
  && chmod -R 0777 /root/.config/mmpm \
  && rm -fr /root/.config/mmpm/log \
  && mv -fv /root/.config/mmpm /root/.default/ \
  && mkdir -m 777 -p /root/.default/mmpm/log \
  && mkdir -m 777 -p /root/.config/mmpm \
  # module
  && mmpm install -y MMM-mmpm \
  # cleaning
  && rm -f \
  /root/MagicMirror/modules \
  /root/MagicMirror/config \
  /root/MagicMirror/css \
  && mkdir -m 777 -p \
  /root/MagicMirror/modules \
  /root/MagicMirror/config \
  /root/MagicMirror/css \
  && rm -fr mmpm-src

RUN set -ex \
  && python3 -c 'from mmpm.log import factory; print(factory.__file__)' | tee /root/.default/.mmpm-location

COPY package.json .

RUN set -ex \
  && npm i --no-audit --no-fund --prefix /root

ENV MM_PORT=8080
ENV MMPM_UI_PORT=7890
ENV MMPM_API_PORT=7891
ENV MMPM_LOG_PORT=6789
ENV MMPM_REPEATER_PORT=8907
ENV LOCAL_IP=127.0.0.1
ENV INSTANCE=dummy
ENV PM2_HOME='.pm2'
ENV ARCH=$TARGETARCH
ENV IS_DEBUG=false

VOLUME /root/.config/mmpm
VOLUME /root/MagicMirror/config
VOLUME /root/MagicMirror/css
VOLUME /root/MagicMirror/modules
VOLUME /root/MagicMirror/shared

COPY entrypoint.js .

USER root

RUN set -ex \
  # Environment
  && chmod -R a+rwx /root/.default

ENTRYPOINT ["npm", "start", "--prefix", "/root"]
