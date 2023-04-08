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

sudo chown -R $MM_USER:$MM_USER $SCRIPT_PATH/.config/mmpm $MM_HOME/config $MM_HOME/css $MM_HOME/modules $MM_HOME/shared
sudo chmod -R a+rw $SCRIPT_PATH/.config/mmpm $MM_HOME/config $MM_HOME/css $MM_HOME/modules $MM_HOME/shared

echo "Copying MMPM cache"
cp -nr $SCRIPT_PATH/.default/mmpm/* $SCRIPT_PATH/.config/mmpm/

echo "Copying default modules"
for module in $(echo "mmpm default MMM-RefreshClientOnly"); do
  sudo rm -fr $MM_HOME/modules/$module >/dev/null 2>&1
  cp -fr $SCRIPT_PATH/.default/modules/$module $MM_HOME/modules/
done

echo "Copying default config"
cp -nr $SCRIPT_PATH/.default/config/* $MM_HOME/config/
if [[ ! -f "$MM_HOME/config/config.js" ]]; then
  cp -fr $MM_HOME/config/config.js.sample $MM_HOME/config/config.js
fi
prettier --write --single-quote --quote-props=consistent --trailing-comma=none $MM_HOME/config/*.js >/dev/null 2>&1

echo "Copying default css"
cp -nr $SCRIPT_PATH/.default/css/* $MM_HOME/css/
if [[ ! -f "$MM_HOME/css/custom.css" ]]; then
  touch $MM_HOME/css/custom.css
fi

echo "Preparing environment"
INSTANCE=$INSTANCE LOCAL_IP=$LOCAL_IP MM_PORT=$MM_PORT MMPM_PORT=$MMPM_PORT python3 $SCRIPT_PATH/prepare.py
prettier --write --single-quote --quote-props=consistent --trailing-comma=none $MM_HOME/config/*.js >/dev/null 2>&1

sudo chown -R $MM_USER:$MM_USER $SCRIPT_PATH/.config/mmpm $MM_HOME/config $MM_HOME/css $MM_HOME/modules $MM_HOME/shared
sudo chmod -R a+rw $SCRIPT_PATH/.config/mmpm $MM_HOME/config $MM_HOME/css $MM_HOME/modules $MM_HOME/shared

if [[ "$MM_PORT" == "8080" ]]; then
  for module in $(ls -1 $MM_HOME/modules | egrep -v '(default|mmpm)'); do
    if [[ -f "$MM_HOME/modules/${module}/package.json" && ! -d "$MM_HOME/modules/${module}/node_modules" ]]; then
      echo "Installing ${module}"
      npm install --prefix "$MM_HOME/modules/${module}/"
    fi
    if [[ "${module}" == "MMM-mediamtx" ]]; then
      echo "Setup ${module}"
      npm run setup --prefix "$MM_HOME/modules/${module}/"
    fi
  done
  touch "$MM_HOME/modules/.done"
else
  echo "Waiting modules"
  sleep 5
  while [ ! -f "$MM_HOME/modules/.done" ]; do
    sleep 1
  done
fi

echo "Fixing mmpm cache"
npm install --prefix "$SCRIPT_PATH"
node externalUpdater.js

sleep 10

echo "Starting processes"
pm2 start ecosystem.config.js --no-daemon
