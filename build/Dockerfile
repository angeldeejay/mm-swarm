FROM nikolaik/python-nodejs:python3.9-nodejs16-slim
# FROM nikolaik/python-nodejs:python3.9-nodejs16-bullseye

ENV DEBIAN_FRONTEND=noninteractive
ENV PATH=$PATH:/home/pn/.local/bin

RUN set -e \
  && apt-get update -qq --quiet \
  && apt-get install -qq --quiet -y --no-install-recommends \
  # MagicMirror
  curl wget nano sudo gettext-base git \
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

RUN set -e \
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

RUN set -e \
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
