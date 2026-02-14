const dayjs = require("dayjs");
const { grey, green, blue, cyan, yellow, red } = require("kleur");
const { join, sep, basename, dirname } = require("path");
const { spawnSync } = require("child_process");
const fse = require("fs-extra");
const hostedGitInfo = require("hosted-git-info");
const gitConfigParse = require("parse-git-config");
const pm2 = require("pm2");
const prettier = require("prettier");
const util = require("util");
const winston = require("winston");
const {
  unlinkSync,
  chownSync,
  readdirSync,
  writeFileSync,
  symlinkSync,
  existsSync,
  readFileSync,
  lstatSync,
  statSync,
  stat,
  mkdirSync
} = require("fs");

const logger = winston.createLogger({
  level: "debug",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.printf(({ level, message, label, timestamp }) => {
      return `${timestamp} [${label}] ${level.toUpperCase()}: ${message}`;
    }),
    winston.format.colorize()
  ),
  transports: [new winston.transports.Console()]
});

function info(msg) {
  logger.info(msg, { label: "Environment" });
}

function error(msg) {
  logger.error(msg, { label: "Environment" });
}

function warning(msg) {
  logger.warn(msg, { label: "Environment" });
}

if (
  !process.env.INSTANCE ||
  !process.env.MM_PORT ||
  !process.env.MMPM_UI_PORT ||
  !process.env.MMPM_API_PORT ||
  !process.env.MMPM_LOG_PORT ||
  !process.env.MMPM_REPEATER_PORT ||
  !process.env.LOCAL_IP
) {
  error("Invalid environment!");
  process.exit(1);
}

// Paths
const SCRIPT_PATH = __dirname;
const DEFAULTS_PATH = join(SCRIPT_PATH, ".default");
const DEFAULT_MODULES_PATH = join(DEFAULTS_PATH, "modules");
const MMPM_UI_PATH = join(SCRIPT_PATH, "mmpm-ui");
const MM_PATH = join(SCRIPT_PATH, "MagicMirror");
const MM_CONFIG_PATH = join(MM_PATH, "config");
const MM_CSS_PATH = join(MM_PATH, "css");
const MM_MODULES_PATH = join(MM_PATH, "modules");
const MMPM_CONFIG_PATH = join(SCRIPT_PATH, ".config", "mmpm");
const MMPM_FACTORY_SRC_PATH = readFileSync(
  join(DEFAULTS_PATH, ".mmpm-location"),
  {
    encoding: "utf8"
  }
).replace(/[\s\n]+/gi, "");

const doneFile = join(MM_MODULES_PATH, ".done");
const updateFile = join(MM_MODULES_PATH, ".update");
const configFile = join(MM_PATH, "config", "config.js");
const defaultConfigFile = join(MM_PATH, "config", "config.js.sample");
const externalPackagesFile = join(
  MMPM_CONFIG_PATH,
  "mmpm-external-packages.json"
);
const thirdPartyPackagesFile = join(
  MMPM_CONFIG_PATH,
  "MagicMirror-3rd-party-packages-db.json"
);
const mmpmEnvFile = join(MMPM_CONFIG_PATH, "mmpm-env.json");
const mmpmLogFile = join(MMPM_CONFIG_PATH, "log", "mmpm-cli-interface.log");

// Networking
const INSTANCE = process.env.INSTANCE;
const IS_DEBUG = ["1", "true"].includes(
  (process.env.IS_DEBUG || "false").toLowerCase()
);
const MM_PORT = parseInt(process.env.MM_PORT || "8080", 10);
const MMPM_UI_PORT = parseInt(process.env.MMPM_UI_PORT || "7890", 10);
const MMPM_API_PORT = parseInt(process.env.MMPM_API_PORT || "7891", 10);
const MMPM_LOG_PORT = parseInt(process.env.MMPM_LOG_PORT || "6789", 10);
const MMPM_REPEATER_PORT = parseInt(
  process.env.MMPM_REPEATER_PORT || "8907",
  10
);
const LOCAL_IP = process.env.LOCAL_IP || "127.0.0.1";

// Constants
const FIRST_INSTANCE = MM_PORT === 8080;

const PORT_REPLACEMENTS = {
  __MMPM_UI_PORT__: MMPM_UI_PORT,
  __MMPM_API_PORT__: MMPM_API_PORT,
  __MMPM_LOG_PORT__: MMPM_LOG_PORT,
  __MMPM_REPEATER_PORT__: MMPM_REPEATER_PORT
};

const MM_ENFORCED_CONFIG = {
  address: "0.0.0.0",
  port: MM_PORT,
  basePath: "/",
  ipWhitelist: [],
  logging: {
    dateFormat: ""
  }
};

const MM_BASE_CONFIG = {
  timeFormat: 12,
  language: "es",
  locale: "es_CO",
  logLevel: ["INFO", "LOG", "WARN", "ERROR"],
  units: "metric",
  modules: []
};

const MMPM_CONFIG = {
  INSTANCE: INSTANCE,
  MMPM_MAGICMIRROR_ROOT: MM_PATH,
  MMPM_MAGICMIRROR_URI: `http://${LOCAL_IP}:${MM_PORT}`,
  MMPM_MAGICMIRROR_PM2_PROCESS_NAME: "MagicMirror",
  MMPM_MAGICMIRROR_DOCKER_COMPOSE_FILE: "",
  MMPM_IS_DOCKER_IMAGE: false
};

const UPDATABLE_DEFAULT_MODULES = {
  "MMM-RefreshClientOnly":
    "https://github.com/angeldeejay/MMM-RefreshClientOnly.git",
  "MMM-GoogleDriveSlideShow":
    "https://github.com/angeldeejay/MMM-GoogleDriveSlideShow.git"
};

const MM_CONFIG_TPL = `/** MagicMirror² Config Sample
 *
 * By Michael Teeuw https://michaelteeuw.nl
 * MIT Licensed.
 *
 * For more information on how you can configure this file
 * see https://docs.magicmirror.builders/configuration/introduction.html
 * and https://docs.magicmirror.builders/modules/configuration.html
 *
 * You can use environment variables using a \`config.js.template\` file instead of \`config.js\`
 * which will be converted to \`config.js\` while starting. For more information
 * see https://docs.magicmirror.builders/configuration/introduction.html#enviromnent-variables
 *
 * ► LOCAL_IP           : ${LOCAL_IP}
 * ► MM_PORT            : ${MM_PORT}
 * ► MMPM_UI_PORT       : ${MMPM_UI_PORT}
 * ► MMPM_API_PORT      : ${MMPM_API_PORT}
 * ► MMPM_LOG_PORT      : ${MMPM_LOG_PORT}
 * ► MMPM_REPEATER_PORT : ${MMPM_REPEATER_PORT}
 */
\n\n
let config = __PLACEHOLDER__;
\n\n/*************** DO NOT EDIT THE LINE BELOW ***************/
if (typeof module !== 'undefined') {
\tmodule.exports = config;
}`;

const PM2_APPS = [
  {
    name: "MagicMirror",
    instances: 1,
    cwd: MM_PATH,
    script: join(MM_PATH, "serveronly", "index.js"),
    args: [],
    watch: [
      ["." + sep, "config", "config.js"].join(sep),
      ...(IS_DEBUG
        ? [
            ["." + sep, "modules", "**", "*.js"].join(sep),
            ["." + sep, "modules", "**", "*.json"].join(sep),
            ["." + sep, "modules", "**", "*.css"].join(sep)
          ]
        : [])
    ],
    ignore_watch: [
      ["." + sep, "node_modules"].join(sep),
      ["." + sep, "modules", "*", "node_modules"].join(sep)
    ],
    auto_restart: true,
    kill_timeout: 0,
    env: {
      MM_PORT: MM_PORT,
      MMPM_UI_PORT: MMPM_UI_PORT,
      MMPM_API_PORT: MMPM_API_PORT,
      MMPM_LOG_PORT: MMPM_LOG_PORT,
      MMPM_REPEATER_PORT: MMPM_REPEATER_PORT
    }
  },
  {
    name: "mmpm.log-server",
    script: "python3",
    args: [
      "-u",
      "-m",
      "gunicorn",
      "-k",
      "geventwebsocket.gunicorn.workers.GeventWebSocketWorker",
      "-w",
      "1",
      "mmpm.log.server:create()",
      "-b",
      `0.0.0.0:${MMPM_LOG_PORT}`
    ],
    cwd: SCRIPT_PATH,
    auto_restart: true,
    kill_timeout: 0
  },
  {
    name: "mmpm.api",
    instances: 1,
    script: "python3",
    args: [
      "-u",
      "-m",
      "gunicorn",
      "-k",
      "gevent",
      "-b",
      `0.0.0.0:${MMPM_API_PORT}`,
      "mmpm.wsgi:app"
    ],
    cwd: SCRIPT_PATH,
    auto_restart: true,
    kill_timeout: 0
  },
  {
    name: "mmpm.repeater",
    script: "python3",
    args: [
      "-u",
      "-m",
      "gunicorn",
      "-k",
      "geventwebsocket.gunicorn.workers.GeventWebSocketWorker",
      "-w",
      "1",
      "mmpm.api.repeater:create()",
      "-b",
      `0.0.0.0:${MMPM_REPEATER_PORT}`
    ],
    cwd: SCRIPT_PATH,
    auto_restart: true,
    kill_timeout: 0
  },
  {
    name: "mmpm.ui",
    script: "python3",
    args: [
      "-u",
      "-m",
      "http.server",
      "-d",
      `${MMPM_UI_PATH}`,
      "-b",
      "0.0.0.0",
      `${MMPM_UI_PORT}`
    ],
    cwd: MMPM_UI_PATH,
    auto_restart: true,
    kill_timeout: 0
  }
];

info(`Setting environment for instance ${INSTANCE}`);
info(`► IS_DEBUG           : ${IS_DEBUG ? "true" : "false"}`);
info(`► LOCAL_IP           : ${LOCAL_IP}`);
info(`► MM_PORT            : ${MM_PORT}`);
info(`► MMPM_UI_PORT       : ${MMPM_UI_PORT}`);
info(`► MMPM_API_PORT      : ${MMPM_API_PORT}`);
info(`► MMPM_LOG_PORT      : ${MMPM_LOG_PORT}`);
info(`► MMPM_REPEATER_PORT : ${MMPM_REPEATER_PORT}`);

function changeOwnershipRecursive(dirPath, uid, gid) {
  readdirSync(dirPath).forEach((file) => {
    const fullPath = join(dirPath, file);
    lstatSync(fullPath).isDirectory()
      ? changeOwnershipRecursive(fullPath, uid, gid)
      : chownSync(fullPath, uid, gid);
  });
  chownSync(dirPath, uid, gid);
}

function deleteDoneFile() {
  try {
    unlinkSync(doneFile);
  } catch (_) {}
}

function deleteUpdateFile() {
  try {
    unlinkSync(updateFile);
  } catch (_) {}
}

function deepMerge(target, source) {
  if (typeof target !== "object" || typeof source !== "object") {
    return target;
  }

  for (const key in source) {
    if (source.hasOwnProperty(key)) {
      if (typeof source[key] === "object" && !Array.isArray(source[key])) {
        if (!target[key]) {
          target[key] = {};
        }
        deepMerge(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
  }
  return target;
}

function setFixedConfig(filename, tpl, replacement) {
  const contents = prettier.format(
    tpl.replace("__PLACEHOLDER__", JSON.stringify(replacement)),
    {
      parser: "babel",
      quote: "double",
      trailingComma: "none",
      singleQuote: false,
      quoteProps: "as-needed"
    }
  );
  writeFileSync(filename, contents);
  info(`Stored config for ${filename}`);
}

function fixMmpmEnv() {
  // Fixing MMPM
  let mmpmFactoryContents = readFileSync(MMPM_FACTORY_SRC_PATH, {
    encoding: "utf8"
  }).replace(/(SocketIOHandler\([^,]+,\s*)\d+/gi, `\$1${MMPM_LOG_PORT}`);
  writeFileSync(MMPM_FACTORY_SRC_PATH, mmpmFactoryContents);

  info("Copying MMPM defaults");
  copyFolder(join(DEFAULTS_PATH, "mmpm"), MMPM_CONFIG_PATH);
  if (!existsSync(mmpmLogFile)) {
    symlinkSync("/dev/null", mmpmLogFile);
  }
  const envValues = Object.entries(MMPM_CONFIG)
    .map(([key, value]) => `  - ${key}: ${value}`)
    .join("\n");

  info(`Fixing MMPM environment:\n${envValues}`);
  writeFileSync(mmpmEnvFile, JSON.stringify(MMPM_CONFIG, null, 2), "utf-8");
  info(`Stored config for ${mmpmEnvFile}`);

  info("Copying MMPM UI defaults");
  copyFolder(join(DEFAULTS_PATH, "mmpm-ui", "browser"), MMPM_UI_PATH);
  ["main.js", "main.js.map"].forEach((file) => {
    const currentPath = join(MMPM_UI_PATH, file);
    let fileContents = readFileSync(currentPath, {
      encoding: "utf8"
    });
    Object.entries(PORT_REPLACEMENTS).forEach(([_old, _new]) => {
      const re = new RegExp(_old, "ig");
      fileContents = fileContents.replace(re, `${_new}`);
    });
    writeFileSync(currentPath, fileContents);
  });
  changeOwnershipRecursive(MMPM_CONFIG_PATH, 1000, 1000);
  changeOwnershipRecursive(MMPM_UI_PATH, 1000, 1000);
}

function fixMmEnv() {
  // Fixing MagicMirror
  info("Generating default config");
  copyFolder(join(DEFAULTS_PATH, "config"), MM_CONFIG_PATH);
  if (!existsSync(join(MM_CONFIG_PATH, "config.js")))
    copyFileSync(
      join(MM_CONFIG_PATH, "config.js.sample"),
      join(MM_CONFIG_PATH, "config.js")
    );

  info("Generating default styles");
  copyFolder(join(DEFAULTS_PATH, "css"), MM_CSS_PATH);
  if (!existsSync(join(MM_CSS_PATH, "custom.css")))
    writeFileSync(join(MM_CSS_PATH, "custom.css"), "");

  info(`Fixing MagicMirror config`);
  const BASE_MODULES = [
    { module: "MMM-RefreshClientOnly" },
    { module: "MMM-mmpm" }
  ];

  const actualConfig = existsSync(configFile)
    ? require(configFile)
    : existsSync(defaultConfigFile)
    ? require(defaultConfigFile)
    : {};
  const desiredConfig = {
    ...MM_ENFORCED_CONFIG,
    ...MM_BASE_CONFIG,
    ...deepMerge({}, actualConfig),
    ...MM_ENFORCED_CONFIG,
    serverOnly: true,
    electronOptions: {
      webPreferences: {
        webviewTag: true,
        contextIsolation: false,
        enableRemoteModule: true
      }
    }
  };

  for (const requiredModule of BASE_MODULES) {
    const alreadyInConfig = desiredConfig.modules.find(
      (m) => m.module === requiredModule.module
    );
    if (!alreadyInConfig) {
      info(`Adding ${requiredModule.module} module to the config`);
      desiredConfig.modules = [requiredModule, ...desiredConfig.modules];
    }
  }
  setFixedConfig(configFile, MM_CONFIG_TPL, desiredConfig);
  changeOwnershipRecursive(MM_CONFIG_PATH, 1000, 1000);
  changeOwnershipRecursive(MM_CSS_PATH, 1000, 1000);
}

function rmFolder(folderPath, keepParent) {
  const removeParent = typeof keepParent === "undefined" || keepParent !== true;
  if (existsSync(folderPath)) {
    readdirSync(folderPath).forEach((file, index) => {
      const currentPath = join(folderPath, file);
      if (lstatSync(currentPath).isDirectory()) {
        rmFolder(currentPath);
      } else {
        try {
          unlinkSync(currentPath);
        } catch (_) {}
      }
    });
    if (removeParent)
      try {
        rmdirSync(folderPath);
      } catch (_) {}
  }
}

function copyFolder(sourceFolder, targetFolder) {
  if (!existsSync(targetFolder)) mkdirSync(targetFolder, { recursive: true });

  fse.copySync(sourceFolder, targetFolder, {
    overwrite: true,
    errorOnExist: false
  });
}

function getValue(obj, ...keys) {
  const [key, ...rest] = keys;
  if (obj === undefined || obj === null) return undefined;
  else if (rest.length === 0) return obj[key];
  else return getValue(obj[key], ...rest);
}

function isPackage(modulePath) {
  try {
    const definitionsPath = join(modulePath, "package.json");
    return existsSync(definitionsPath) && statSync(definitionsPath).isFile();
  } catch (_) {
    return false;
  }
}

function isGitRepo(modulePath) {
  try {
    const { stdout } = spawnSync(
      "git",
      ["rev-parse", "--is-inside-work-tree"],
      { cwd: modulePath }
    );
    return stdout && `${stdout}`.trim() === "true";
  } catch (_) {
    return false;
  }
}

function getModuleInfo(modulePath) {
  const definitionsPath = join(modulePath, "package.json");
  let packageInfo;
  try {
    packageInfo = isPackage(modulePath) ? require(definitionsPath) : {};
  } catch (err) {
    error(err);
    packageInfo = {};
  }
  let repository = (
    typeof packageInfo.repository === "string"
      ? packageInfo.repository.trim()
      : typeof packageInfo.repository === "object" &&
        typeof packageInfo.repository.url === "string"
      ? packageInfo.repository.url.trim()
      : ""
  ).trim();
  if (isGitRepo(modulePath)) {
    try {
      const newRepoUrl =
        getValue(
          gitConfigParse.sync({
            type: "local",
            cwd: modulePath,
            path: modulePath + "/.git/config"
          }),
          'remote "origin"',
          "url"
        ) ?? repository;
      repository = newRepoUrl;
    } catch (error) {}
  }
  if (repository !== "") {
    repository = hostedGitInfo.fromUrl(repository).browse({});
  }
  return {
    title: packageInfo.name ?? basename(modulePath),
    author: packageInfo.author ?? "",
    repository,
    version: packageInfo.version ?? "0.0.0",
    description:
      packageInfo.description ?? packageInfo.name ?? basename(modulePath)
  };
}

function handleModuleDeps(modulePath) {
  const definitionsPath = join(modulePath, "package.json");
  const isNpmModule =
    existsSync(definitionsPath) && statSync(definitionsPath).isFile();
  if (!isNpmModule) return;
  try {
    const { stderr } = spawnSync(
      "npm",
      ["install", "--no-audit", "--no-fund", "--prefix", modulePath],
      { cwd: modulePath }
    );
    if (stderr && `${stderr}`.trim().length > 0) throw new Error(`${stderr}`);
  } catch (_) {}
}

function cleanRepo(modulePath) {
  try {
    spawnSync("git", ["checkout", "."], { cwd: modulePath });
  } catch (err) {}
}

function cloneRepo(repoUrl, modulePath) {
  try {
    const { stderr } = spawnSync(
      "git",
      ["clone", "-b", "master", "--single-branch", repoUrl, modulePath],
      {
        cwd: dirname(modulePath)
      }
    );
    if (stderr && `${stderr}`.trim().length > 0) throw new Error(`${stderr}`);
    handleModuleDeps(modulePath);
  } catch (_) {}
}

function pullRepo(modulePath) {
  try {
    const { stderr } = spawnSync("git", ["pull", "--force"], {
      cwd: modulePath
    });
    if (
      stderr &&
      !(
        `${stderr}`.trim().startsWith("From ") ||
        `${stderr}`.trim().length === 0
      )
    )
      throw new Error(stderr);
  } catch (_) {}
}

function fixModules() {
  if (FIRST_INSTANCE || existsSync(updateFile)) {
    deleteUpdateFile();
    ["MMM-mmpm", "default", "MMM-RefreshClientOnly"].forEach((module) => {
      rmFolder(join(MM_MODULES_PATH, module));
    });

    info("Updating default modules");
    Object.entries(UPDATABLE_DEFAULT_MODULES).forEach(([module, repoUrl]) => {
      const defaultModulePath = join(DEFAULT_MODULES_PATH, module);
      rmFolder(defaultModulePath);
      cloneRepo(repoUrl, defaultModulePath);
    });

    info("Copying default modules");
    readdirSync(DEFAULT_MODULES_PATH, { withFileTypes: true })
      .filter((m) => m.isDirectory())
      .forEach(({ name: module }) => {
        info(`► ${module}`);
        const sourcePath = join(DEFAULT_MODULES_PATH, module);
        const targetPath = join(MM_MODULES_PATH, module);
        copyFolder(sourcePath, targetPath);
      });

    info("Initializing modules");
    return Promise.allSettled(
      readdirSync(MM_MODULES_PATH, { withFileTypes: true })
        .filter((m) => m.isDirectory() && !["default"].includes(m.name))
        .map(({ name: module }) => {
          return new Promise((resolve) => {
            const modulePath = join(MM_MODULES_PATH, module);
            if (isGitRepo(modulePath) && !IS_DEBUG) {
              cleanRepo(modulePath);
              pullRepo(modulePath);
            }
            if (isPackage(modulePath)) handleModuleDeps(modulePath);
            const moduleInfo = getModuleInfo(modulePath);
            info(
              `► ${module}${
                moduleInfo && moduleInfo.version
                  ? " v" + moduleInfo.version
                  : ""
              }`
            );
            resolve();
          });
        })
    ).then(() => {
      changeOwnershipRecursive(MM_MODULES_PATH, 1000, 1000);
      info("Modules ready");
    });
  }

  info("Waiting modules");
  return new Promise((resolve, reject) => {
    const interval = setInterval(() => {
      stat(doneFile, (err) => {
        if (err) return;
        clearInterval(interval);
        resolve();
      });
    }, 1000);
  });
}

function fixMmpmCache() {
  info("Fixing MMPM cache");
  const packages = [];
  const externalPackages = [];
  try {
    Object.values(JSON.parse(readFileSync(externalPackagesFile))).forEach(
      (packageGroup) => {
        packages.push(...packageGroup);
        externalPackages.push(...packageGroup);
      }
    );
  } catch (_) {}

  try {
    Object.values(JSON.parse(readFileSync(thirdPartyPackagesFile))).forEach(
      (packageGroup) => packages.push(...packageGroup)
    );
  } catch (_) {}

  const repositories = packages.map((p) => p.repository);

  info("► Detected " + packages.length + " registered packages");
  info("► Looking for modules" + MM_PATH);

  let shouldSaveExternalPackages = false;
  readdirSync(MM_MODULES_PATH, { withFileTypes: true })
    .filter(
      (file) => !["mmpm", "default"].includes(file.name) && file.isDirectory()
    )
    .forEach(({ name: module }) => {
      const modulePath = join(MM_MODULES_PATH, module);
      const { title, author, repository, description } =
        getModuleInfo(modulePath);
      // Check if package is not already in database
      if (repository === "" || !repositories.includes(repository)) {
        info(`  - Registering ${module}`);
        externalPackages.push({ title, author, repository, description });
        shouldSaveExternalPackages = true;
      }
    });

  if (shouldSaveExternalPackages) {
    info(`► Saving ${externalPackages.length} external packages found`);
    for (const pkg of externalPackages) {
      try {
        spawnSync("mmpm", [
          "mm-pkg",
          "add",
          "-t",
          pkg.title,
          "-a",
          pkg.author,
          "-r",
          pkg.repository,
          "-d",
          pkg.description
        ]);
      } catch (err) {
        console.log(err);
      }
    }
  }
  changeOwnershipRecursive(MMPM_CONFIG_PATH, 1000, 1000);
}

function startApplication(app) {
  info("starting " + app.name);
  pm2.start(app, (err, proc) => {
    if (err) {
      error(err);
      info(app.name + " not started!");
      setTimeout(() => startApplication(app), 1000);
    }
    info(app.name + " started!");
  });
}

const currentLevels = PM2_APPS.reduce((acc, a) => {
  acc[a.name] = "INFO";
  return acc;
}, {});

function handlePm2Log(_, { data, process: { name } }) {
  if (!PM2_APPS.map((a) => a.name).includes(name) || typeof data !== "string")
    return;

  (data || "")
    .split("\n")
    .filter((line) => line && line.length > 0)
    .forEach(function (line) {
      let fixedLine = line;
      if (name.startsWith("mmpm.")) {
        fixedLine = line
          .replace(/^\[[^\]]+\]\s+\[[^\]]+\]\s+(\[[^\]]+\])\s+(.*)/gim, "$1|$2")
          .replace(/\s+$/g, "");
      }
      const message = fixedLine.startsWith("[")
        ? fixedLine.replace(/^[^\|]+\|(.*)/gim, "$1")
        : fixedLine;
      let level = fixedLine
        .replace(message, "")
        .trim()
        .replace(/\|/i, "")
        .replace(/(\[|\])/gim, "");
      if (level === "" || message.length === 0 || message.startsWith("\n"))
        level = null;
      const currentLevel = (level || currentLevels[name])
        .toUpperCase()
        .replace("WARNING", "WARN")
        .replace("WARN", "WARNING");
      currentLevels[name] = currentLevel;
      if (level !== null) {
        process.stdout.write(
          grey(`${dayjs().format("YYYY/MM/DD HH:mm:ss.SSS")} `)
        );
        process.stdout.write(name.padStart(12, " ") + " |");
        const formattedLevel = currentLevel.padStart(8, " ");
        switch (currentLevel) {
          case "INFO":
            process.stdout.write(green(formattedLevel));
            break;
          case "LOG":
            process.stdout.write(blue(formattedLevel));
            break;
          case "DEBUG":
            process.stdout.write(cyan(formattedLevel));
            break;
          case "WARNING":
            process.stdout.write(yellow(formattedLevel));
            break;
          case "ERROR":
            process.stdout.write(red(formattedLevel));
            break;
        }
        process.stdout.write(": ");
      }
      process.stdout.write(util.format(message) + "\n");
    });
}

new Promise((resolve) => {
  if (FIRST_INSTANCE) {
    deleteUpdateFile();
    deleteDoneFile();
    resolve();
  } else {
    setTimeout(() => resolve(), 2000);
  }
}).then(() => {
  fixMmEnv();
  fixMmpmEnv();

  fixModules().then(async () => {
    if (FIRST_INSTANCE) {
      writeFileSync(doneFile, "");
    }
    writeFileSync(updateFile, "");

    fixMmpmCache();

    pm2.connect(true, (err) => {
      if (err) {
        error(err);
        process.exit(1);
      }

      pm2.launchBus((err, bus) => {
        if (err) {
          error(err);
          process.exit(2);
        }
        bus.on("log:*", (...args) => handlePm2Log(...args));
        PM2_APPS.forEach((app) => startApplication(app));
      });
    });
  });
});
