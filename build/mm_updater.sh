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

MM_HOME="${SCRIPT_PATH}/MagicMirror"
MM_MODULES="${MM_HOME}/modules"

log_this() {
  echo "$(printf '[%(%m.%d.%Y %H:%M:%S.000)T] [UPDATER] ' -1)$1"
}

while true; do
  cd $SCRIPT_PATH

  for MODULE_PATH in $(find $MM_MODULES -maxdepth 1 -mindepth 1 -type d); do
    MODULE="${MODULE_PATH##*/}"
    cd $MODULE_PATH
    if [[ "$MODULE" != "default" && -d "$MODULE_PATH/.git" ]]; then
      log_this "Checking $MODULE"
      if [ "$(git fetch --dry-run)" != "" ]; then
        log_this "Updating $MODULE"
        (
          (git checkout . >/dev/null 2>&1 || true) &&
            git pull &&
            if [[ -f "$MODULE_PATH/package.json" ]]; then
              npm install --omit=dev --no-audit --no-fund --prefix "${MODULE_PATH}"
            fi &&
            "$MODULE updated"
        ) || log_this "$MODULE update failed"
      else
        log_this "$MODULE is up to date"
      fi
    else
      log_this "Skipping $MODULE"
    fi
  done

  log_this "Checking MagicMirror"
  cd $MM_HOME
  CURRENT_VERSION=$(git describe --tags --exact-match 2>/dev/null || git symbolic-ref -q --short HEAD || git rev-parse --short HEAD)
  LATEST_VERSION=$(curl -s "https://api.github.com/repos/MichMich/MagicMirror/releases/latest" | grep '"tag_name":' | cut -d '"' -f 4)

  if [[ "$LATEST_VERSION" != "$CURRENT_VERSION" ]]; then
    log_this "Updating MagicMirror: $CURRENT_VERSION → $LATEST_VERSION"
    (
      pm2 stop $SCRIPT_PATH/ecosystem.config.js --only "MagicMirror,mmpm" &&
        git checkout $LATEST_VERSION &&
        npm run install-mm --prefix "${MM_HOME}" &&
        log_this "MagicMirror updated: $LATEST_VERSION"
    ) || log_this "Update MagicMirror failed"
    pm2 restart $SCRIPT_PATH/ecosystem.config.js
  else
    log_this "MagicMirror is up to date: $CURRENT_VERSION"
  fi
  sleep 60
done
