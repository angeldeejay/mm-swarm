FROM python:3.9.16-slim-bullseye

ENV NODE_VERSION=16.20.0
ENV DEBIAN_FRONTEND=noninteractive
ENV PATH=$PATH:/home/pn/.local/bin

RUN groupadd --gid 1000 pn && useradd --uid 1000 --gid pn --shell /bin/bash --create-home pn

RUN ARCH= && dpkgArch="$(dpkg --print-architecture)" \
  && case "${dpkgArch##*-}" in \
  amd64) ARCH='x64';; \
  ppc64el) ARCH='ppc64le';; \
  s390x) ARCH='s390x';; \
  arm64) ARCH='arm64';; \
  armhf) ARCH='armv7l';; \
  i386) ARCH='x86';; \
  *) echo "unsupported architecture"; exit 1 ;; \
  esac \
  && set -ex \
  # NodeJS
  && apt-get update && apt-get install -y ca-certificates curl wget gnupg dirmngr xz-utils libatomic1 --no-install-recommends \
  && rm -rf /var/lib/apt/lists/* \
  && for key in \
  4ED778F539E3634C779C87C6D7062848A1AB005C \
  141F07595B7B3FFE74309A937405533BE57C7D57 \
  74F12602B6F1C4E913FAA37AD3A89613643B6201 \
  DD792F5973C6DE52C432CBDAC77ABFA00DDBF2B7 \
  61FC681DFB92A079F1685E77973F295594EC4689 \
  8FCCA13FEF1D0C2E91008E09770F7A9A5AE15600 \
  C4F0DFFF4E8C1A8236409D08E73BC641CC11F4C8 \
  890C08DB8579162FEE0DF9DB8BEAB4DFCF555EF4 \
  C82FA3AE1CBEDC6BE46B9360C43CEC45C17AB93C \
  108F52B48DB57BB0CC439B2997B01419BD92F80A \
  ; do \
  gpg --batch --keyserver hkps://keys.openpgp.org --recv-keys "$key" || \
  gpg --batch --keyserver keyserver.ubuntu.com --recv-keys "$key" ; \
  done \
  && curl -fsSLO --compressed "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-$ARCH.tar.xz" \
  && curl -fsSLO --compressed "https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt.asc" \
  && gpg --batch --decrypt --output SHASUMS256.txt SHASUMS256.txt.asc \
  && grep " node-v$NODE_VERSION-linux-$ARCH.tar.xz\$" SHASUMS256.txt | sha256sum -c - \
  && tar -xJf "node-v$NODE_VERSION-linux-$ARCH.tar.xz" -C /usr/local --strip-components=1 --no-same-owner \
  && rm "node-v$NODE_VERSION-linux-$ARCH.tar.xz" SHASUMS256.txt.asc SHASUMS256.txt \
  && apt-mark auto '.*' > /dev/null \
  && find /usr/local -type f -executable -exec ldd '{}' ';' \
  | awk '/=>/ { print $(NF-1) }' \
  | sort -u \
  | xargs -r dpkg-query --search \
  | cut -d: -f1 \
  | sort -u \
  | xargs -r apt-mark manual \
  && apt-get purge -y --auto-remove -o APT::AutoRemove::RecommendsImportant=false \
  && ln -s /usr/local/bin/node /usr/local/bin/nodejs \
  # smoke tests
  && node --version \
  && npm --version \
  # MagicMirror
  curl nano sudo gettext-base git \
  openssl ca-certificates tini gnupg axel \
  libnss3-dev libxss1 libxtst6 libasound2 \
  libdrm2 libgbm1 libxshmfence1 build-essential \
  fonts-arphic-uming procps arp-scan \
  # MMPM
  libffi-dev nginx-full \
  # Other utilities
  ffmpeg iputils-ping \
  # Update global NodeJS deps
  && npm install -g npm@latest pm2@latest prettier \
  # User env
  && usermod -aG sudo pn \
  && usermod -aG www-data pn \
  && echo "pn ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/pn \
  && chmod -v 0440 /etc/sudoers.d/pn \
  # Cleaning
  && apt-get purge -y -qq --quiet --auto-remove -o APT::AutoRemove::RecommendsImportant=false \
  && apt-get autoclean -y -qq --quiet \
  && rm -frR /var/{apt,dpkg,cache,log} \
  && rm -frR /var/lib/apt/lists/* \
  && for i in $(seq 1 8); do (rm -frR "/usr/share/man/man${i}" || true); done \
  && chmod a+rw /var/log /var/lib /run \
  && mkdir -p /var/log/nginx \
  && chmod -R a+rwx /var/lib/nginx /var/log/nginx /etc/nginx

USER pn
WORKDIR /home/pn

RUN set -ex \
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
  # Cleaning
  && cd /home/pn \
  && sudo rm -fr /home/pn/mmpm-src

RUN set -ex \
  && (yes | mmpm install --magicmirror) \
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

COPY --chown=pn:pn entrypoint.sh .
COPY --chown=pn:pn externalUpdater.js .
COPY --chown=pn:pn package.json .
COPY --chown=pn:pn prepare.py .
COPY --chown=pn:pn start_process.sh .

ENTRYPOINT ["./entrypoint.sh"]