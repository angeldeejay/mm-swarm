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

git config --global core.fileMode false 2>&1 || true
touch $SCRIPT_PATH/.gitignore 2>&1 || true
git config --global core.excludesfile $SCRIPT_PATH/.gitignore 2>&1 || true
echo "shared" >$SCRIPT_PATH/.gitignore

fix_perms() {
  sudo chown -R $MM_USER:$MM_USER $SCRIPT_PATH/.config/mmpm $MM_HOME/config $MM_HOME/css
  sudo chmod -R a+rw $SCRIPT_PATH/.config/mmpm $MM_HOME/config $MM_HOME/css
  if [[ "$MM_PORT" == "8080" ]]; then
    sudo chown -R $MM_USER:$MM_USER $MM_HOME/modules $MM_HOME/shared
    sudo chmod -R a+rw $MM_HOME/modules $MM_HOME/shared
  fi
}

if [[ -d "$MM_HOME/modules/MMM-mmpm" ]]; then
  sudo rm -fr "$MM_HOME/modules/MMM-mmpm"
fi

if [[ ! -d "$SCRIPT_PATH/.config/mmpm" ]]; then
  mkdir -p $SCRIPT_PATH/.config/mmpm
fi

fix_perms

if [[ "$MM_PORT" == "8080" && -f "$MM_HOME/modules/.done" ]]; then
  sudo rm -f "$MM_HOME/modules/.done"
fi

echo "Copying MMPM cache"
cp -nr $SCRIPT_PATH/.default/mmpm/* $SCRIPT_PATH/.config/mmpm/

if [[ "$MM_PORT" == "8080" ]]; then

  echo "Copying default modules"
  for module in $(echo "mmpm MMM-RefreshClientOnly"); do
    sudo rm -fr $MM_HOME/modules/$module >/dev/null 2>&1
    cp -fr $SCRIPT_PATH/.default/modules/$module $MM_HOME/modules/
  done
fi

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

if [[ "$MM_PORT" == "8080" ]]; then
  fix_perms

  for module in $(ls -1 $MM_HOME/modules); do
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
      npm install --no-audit --no-fund --omit=dev --prefix "$MM_HOME/modules/$module/" 2>&1 | egrep -v '^$'
    fi
  done

  if [[ -d "$MM_HOME/modules/default" ]]; then
    sudo rm -fr "$MM_HOME/modules/default"
  fi
  cd $MM_HOME
  git checkout modules/default
  git checkout js/defaults.js
  git checkout config/*.sample
  git checkout css/*.sample
  cd $SCRIPT_PATH

  touch "$MM_HOME/modules/.done"
else
  echo "Waiting modules"
  sleep 5
  while [ ! -f "$MM_HOME/modules/.done" ]; do
    sleep 1
  done
fi

printf "Installing MMM-mmpm: "
npm install --no-audit --no-fund --prefix "$SCRIPT_PATH" 2>&1 | egrep -v '^$'
npm run mmpm-cache:fix --prefix "$SCRIPT_PATH" 2>&1 | egrep -v '^$' | awk '{print "  "$0}'

echo "Starting processes"
touch $SCRIPT_PATH/update
pm2 start $SCRIPT_PATH/ecosystem.config.js
if [[ $? -ne 0 ]]; then
  exit 1
else
  pm2 logs --raw --lines 0 --timestamp ''
fi
