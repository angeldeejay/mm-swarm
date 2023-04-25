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
export INSTANCE="${INSTANCE}"
export LOCAL_IP="${LOCAL_IP}"
export MM_PORT="${MM_PORT}"
export MMPM_PORT="${MMPM_PORT}"

if [[ ! -d "$SCRIPT_PATH/.config/mmpm" ]]; then
  mkdir -p $SCRIPT_PATH/.config/mmpm
fi

if [[ "$MM_PORT" == "8080" && -f "$MM_HOME/modules/.done" ]]; then
  sudo rm -f "$MM_HOME/modules/.done"
fi

echo "Copying MMPM cache"
cp -nr $SCRIPT_PATH/.default/mmpm/* $SCRIPT_PATH/.config/mmpm/

if [[ "$MM_PORT" == "8080" ]]; then
  echo "Copying default modules"
  for module in $(echo "default mmpm MMM-RefreshClientOnly"); do
    sudo rm -fr $MM_HOME/modules/$module >/dev/null 2>&1
    cp -fr $SCRIPT_PATH/.default/modules/$module $MM_HOME/modules/
  done
fi

echo "Copying defaults"
cp -nr $SCRIPT_PATH/.default/config/* $MM_HOME/config/
if [[ ! -f "$MM_HOME/config/config.js" ]]; then
  cp -fr $MM_HOME/config/config.js.sample $MM_HOME/config/config.js
fi
cp -nr $SCRIPT_PATH/.default/css/* $MM_HOME/css/
if [[ ! -f "$MM_HOME/css/custom.css" ]]; then
  touch $MM_HOME/css/custom.css
fi

if [[ "$MM_PORT" == "8080" ]]; then
  for module in $(ls -1 $MM_HOME/modules); do
    if [[ "$module" != "default" ]]; then
      sudo chown -R $MM_USER:$MM_USER $MM_HOME/modules/$module
    fi
    if [[ -d "$MM_HOME/modules/$module/.git" ]]; then
      cd "$MM_HOME/modules/$module/"
      printf "Updating $module: "
      (
        (git checkout . >/dev/null 2>&1 || true) &&
          (git pull >/dev/null 2>&1 || true)
      )
      echo "ok"
      cd $SCRIPT_PATH
    fi
    if [[ -f "$MM_HOME/modules/$module/package.json" ]]; then
      printf "Installing $module: "
      npm install --no-audit --no-fund --omit=dev --prefix "$MM_HOME/modules/$module/" 2>&1 | egrep -v 'npm WARN old lockfile' | egrep -v '^$'
    fi
  done

  echo "Modules detected:"
  ls -1 $MM_HOME/modules | egrep -v '(default|mmpm)' | awk '{print " - "$0}'

  touch "$MM_HOME/modules/.done"
else
  sleep 5
  echo "Waiting modules"
  while [ ! -f "$MM_HOME/modules/.done" ]; do
    sleep 1
  done
fi

echo "Installing MMM-mmpm: "
npm run mmpm-cache:fix --prefix "$SCRIPT_PATH" 2>&1 | egrep -v '^$' | awk '{print "  "$0}'

echo "Preparing environment"
npm run prepare:env --prefix "$SCRIPT_PATH" 2>&1 | egrep -v '^$' | awk '{print "  "$0}'

echo "Starting processes"
touch $SCRIPT_PATH/update
sudo pm2 start --no-daemon --log-date-format "" --log-type raw --merge-logs $SCRIPT_PATH/ecosystem.config.js
