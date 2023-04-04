#!/usr/bin/env bash
set -e
pushd . >/dev/null
SCRIPT_PATH="${BASH_SOURCE[0]}"
while ([ -h "${SCRIPT_PATH}" ]); do
  cd "$(dirname "${SCRIPT_PATH}")"
  SCRIPT_PATH="$(readlink "$(basename "${SCRIPT_PATH}")")"
done
cd "$(dirname "${SCRIPT_PATH}")" >/dev/null
SCRIPT_PATH="$(pwd)"
popd >/dev/null

MM_USER=$(whoami)
MM_HOME="${SCRIPT_PATH}/MagicMirror"

if [[ ! -d "${SCRIPT_PATH}/.config/mmpm" ]]; then
  mkdir -p $SCRIPT_PATH/.config/mmpm
fi
sudo chown -R $MM_USER:$MM_USER $SCRIPT_PATH/.config/mmpm
sudo chmod -R a+rw $SCRIPT_PATH/.config/mmpm

if [[ "$MM_PORT" == "8080" && -f "$MM_HOME/modules/.done" ]]; then
  sudo rm -f "$MM_HOME/modules/.done"
fi

if [[ ! -f /usr/local/bin/mkcert ]]; then
  ARCH=
  dpkgArch="$(dpkg --print-architecture)"
  case "${dpkgArch##*-}" in
  amd64) ARCH='amd64' ;;
  arm64) ARCH='arm64' ;;
  armhf) ARCH='arm' ;;
  *)
    echo "unsupported architecture"
    exit 1
    ;;
  esac
  MKCERT_URL=$(curl -s https://api.github.com/repos/FiloSottile/mkcert/releases/latest | grep browser_download_url | grep "linux-$ARCH" | cut -d '"' -f 4)
  (sudo axel -qk4n 10 "${MKCERT_URL}" -o /usr/local/bin/mkcert &&
    sudo chmod a+x /usr/local/bin/mkcert &&
    mkcert -h >/dev/null 2>&1) || (echo "mkcert not installed!" && exit 1)
fi

echo "Copying mmpm files"
cp -nr $SCRIPT_PATH/.default/mmpm/* $SCRIPT_PATH/.config/mmpm/
sudo chown -R $MM_USER:$MM_USER $SCRIPT_PATH/.config/mmpm
sudo chmod -R a+rw $SCRIPT_PATH/.config/mmpm

sudo chown -R $MM_USER:$MM_USER $SCRIPT_PATH/.config/mmpm $MM_HOME/config $MM_HOME/css $MM_HOME/modules $MM_HOME/shared
sudo chmod -R a+rw $SCRIPT_PATH/.config/mmpm $MM_HOME/config $MM_HOME/css $MM_HOME/modules $MM_HOME/shared

echo "Copying default config"
cp -nr $SCRIPT_PATH/.default/config/* $MM_HOME/config/
echo "Copying default css"

cp -nr $SCRIPT_PATH/.default/css/* $MM_HOME/css/
if [[ ! -f "$MM_HOME/config/config.js" ]]; then
  cp -fr $MM_HOME/config/config.js.sample $MM_HOME/config/config.js
fi

prettier --write --single-quote --quote-props=consistent --trailing-comma=none $MM_HOME/config/*.js

if [[ ! -f "$MM_HOME/css/custom.css" ]]; then
  touch $MM_HOME/css/custom.css
fi

yes | mmpm install --as-module >/dev/null 2>&1

echo "preparing environment"
INSTANCE=$INSTANCE LOCAL_IP=$LOCAL_IP MM_PORT=$MM_PORT MMPM_PORT=$MMPM_PORT python3 $SCRIPT_PATH/prepare.py

prettier --write --single-quote --quote-props=consistent --trailing-comma=none $MM_HOME/config/*.js

sudo chown -R $MM_USER:$MM_USER $SCRIPT_PATH/.config/mmpm $MM_HOME/config $MM_HOME/css $MM_HOME/modules $MM_HOME/shared
sudo chmod -R a+rw $SCRIPT_PATH/.config/mmpm $MM_HOME/config $MM_HOME/css $MM_HOME/modules $MM_HOME/shared

if [[ ! -d "$MM_HOME/modules/MMM-RefreshClientOnly" ]]; then
  echo "install MMM-RefreshClientOnly as module ..."
  git clone https://github.com/angeldeejay/MMM-RefreshClientOnly.git $MM_HOME/modules/MMM-RefreshClientOnly
fi

if [[ "$MM_PORT" == "8080" ]]; then
  for module in $(ls -1 $MM_HOME/modules | egrep -v '(default|mmpm)'); do
    if [[ -f "$MM_HOME/modules/${module}/package.json" && ! -d "$MM_HOME/modules/${module}/node_modules" ]]; then
      echo "Installing ${module}"
      npm install --prefix "$MM_HOME/modules/${module}/" >/dev/null 2>&1
    fi
  done
  touch "$MM_HOME/modules/.done"
else
  echo "waiting modules"
  sleep 5
  while [ ! -f "$MM_HOME/modules/.done" ]; do
    sleep 1
  done
fi

if grep -q "MMM-rtsp-simple-server" "$MM_HOME/config/config.js"; then
  CAROOT="$MM_HOME/modules/MMM-rtsp-simple-server/bin" mkcert -install
fi

echo "fixing mmpm cache"
npm install --prefix "$SCRIPT_PATH"
node externalUpdater.js

sleep 10

echo "starting processes"
pm2 start ecosystem.config.js --no-daemon
