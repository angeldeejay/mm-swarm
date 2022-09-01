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

sudo chown -R node:node "$SCRIPT_PATH/modules/"
sudo chown -R node:node "$SCRIPT_PATH/config/"
sudo chown -R node:node "$SCRIPT_PATH/css/"

if [[ "$MM_PORT" == "8080" ]]; then
  sudo rm -fr "${SCRIPT_PATH}/modules/.done"
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
  (sudo wget -O /usr/local/bin/mkcert -q "${MKCERT_URL}" &&
    sudo chmod a+x /usr/local/bin/mkcert &&
    mkcert -h >/dev/null 2>&1) || (echo "mkcert not installed!" && exit 1)
fi

for f in $(sudo egrep -Rl '(port\s*[:=]\s*)8080' "${SCRIPT_PATH}/js" "${SCRIPT_PATH}/config"); do
  echo "patching port in ${f}: 8080 → $MM_PORT"
  sudo sed -i -r "s/(port\s*[:=]\s*)8080/\1$MM_PORT/ig" "${f}"
done

if [[ ! -f "${SCRIPT_PATH}/ecosystem.config.js" ]]; then
  echo "
module.exports = {
  apps: [
    {
      name: 'MagicMirror',
      cwd: '${SCRIPT_PATH}/',
      script: 'npm',
      args: ['run', 'server'],
      watch: ['./config', './css'],
      exec_mode: 'fork',
      log_date_format: '',
      combine_log: true,
      env: {
        'MM_PORT': '${MM_PORT}',
      },
    }
  ]
};
" >"${SCRIPT_PATH}/ecosystem.config.js"
fi

if [[ "$MM_PORT" == "8080" ]]; then
  for module in $(ls -1 $SCRIPT_PATH/modules | egrep -v '(default|mmpm)'); do
    if [[ -f "${SCRIPT_PATH}/modules/${module}/package.json" ]]; then
      echo "Installing ${module}"
      npm install --prefix "${SCRIPT_PATH}/modules/${module}/" >/dev/null 2>&1
    fi
  done
  touch "${SCRIPT_PATH}/modules/.done"
else
  echo "waiting modules"
  sleep 5
  while [ ! -f "${SCRIPT_PATH}/modules/.done" ]; do
    sleep 1
  done
fi

if [[ -d "${SCRIPT_PATH}/modules/MMM-RefreshClientOnly" ]]; then
  [[ "$(cat "${SCRIPT_PATH}/config/config.js" | grep 'module: "MMM-RefreshClientOnly"')" ]] || sed -i 's|modules: \[|modules: \[{ module: "MMM-RefreshClientOnly" },|g' "$SCRIPT_PATH/config/config.js"
fi

if grep -q "MMM-rtsp-simple-server" "${SCRIPT_PATH}/config/config.js"; then
  CAROOT="${SCRIPT_PATH}/modules/MMM-rtsp-simple-server/bin" mkcert -install
fi

(echo "preparing instance..." &&
  npm install --prefix "$SCRIPT_PATH/" >/dev/null 2>&1) &&
  (pm2 start ecosystem.config.js &&
    pm2 logs MagicMirror --raw --lines 0) ||
  (echo "Something went wrong!" && exit 1)
