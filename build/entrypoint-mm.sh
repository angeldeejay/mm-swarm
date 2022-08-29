#!/usr/bin/env bash
pushd . >/dev/null
SCRIPT_PATH="${BASH_SOURCE[0]}"
while ([ -h "${SCRIPT_PATH}" ]); do
  cd "$(dirname "${SCRIPT_PATH}")"
  SCRIPT_PATH="$(readlink "$(basename "${SCRIPT_PATH}")")"
done
cd "$(dirname "${SCRIPT_PATH}")" >/dev/null
SCRIPT_PATH="$(pwd)"
popd >/dev/null

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
  sudo sed -i -E "s|(port\s*[:=]\s*)8080|\1$MM_PORT|ig" "${f}"
done

for module in $(ls -1 $SCRIPT_PATH/modules | egrep -v '(default|mmpm)'); do
  if [[ -f "${SCRIPT_PATH}/modules/${module}/package.json" ]]; then
    if [[ ! -d "${SCRIPT_PATH}/modules/${module}/node_modules" ]]; then
      touch "${SCRIPT_PATH}/modules/${module}/.installing"
      echo "Installing ${module}"
      npm install --prefix "${SCRIPT_PATH}/modules/${module}/"
      rm -fr "${SCRIPT_PATH}/modules/${module}/.installing"
    fi
  fi
done

if [[ ! -f "${SCRIPT_PATH}/ecosystem.config.js" ]]; then
  read -d '' ecosystem_contents <<_EOF_
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
        "MM_PORT": '${MM_PORT}',
      },
    }
  ]
};
_EOF_
  echo $ecosystem_contents >"${SCRIPT_PATH}/ecosystem.config.js"
fi

(echo "Preparing instance..." &&
  npm install --prefix "${SCRIPT_PATH}/" >/dev/null 2>&1) &&
  (pm2 start ecosystem.config.js &&
    pm2 logs MagicMirror --raw --lines 0) ||
  (echo "Something went wrong!" && exit 1)
