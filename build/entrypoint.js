const dayjs = require("dayjs");
const { grey, green, blue, cyan, yellow, red } = require("kleur");
const { globSync } = require("glob");
const { join, sep, basename } = require("path");
const { spawnSync } = require("child_process");
const { sync: chownFolder } = require("chownr");
const fs = require("fs");
const fse = require("fs-extra");
const hostedGitInfo = require("hosted-git-info");
const gitConfigParse = require("parse-git-config");
const pm2 = require("pm2");
const prettier = require("prettier");
const util = require("util");
const winston = require("winston");

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
  !process.env.MMPM_PORT ||
  !process.env.LOCAL_IP
) {
  error("Invalid environment!");
  process.exit(1);
}

// Paths
const SCRIPT_PATH = __dirname;
const DEFAULTS_PATH = join(SCRIPT_PATH, ".default");
const DEFAULT_MODULES_PATH = join(DEFAULTS_PATH, "modules");
const DOCUMENT_ROOT = "/var/www";
const MM_PATH = join(SCRIPT_PATH, "MagicMirror");
const MM_CONFIG_PATH = join(MM_PATH, "config");
const MM_CSS_PATH = join(MM_PATH, "css");
const MM_MODULES_PATH = join(MM_PATH, "modules");
const MMPM_CONFIG_PATH = join(SCRIPT_PATH, ".config", "mmpm");
const MMPM_STATIC_PATH = join(DOCUMENT_ROOT, "mmpm", "static");
const NGINX_CONFIG_PATH = "/etc/nginx/http.d";
const NGINX_HOME = "/usr/sbin";
const PYTHON_BIN_HOME = join(SCRIPT_PATH, ".local", "bin");

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
const MM_PORT = parseInt(process.env.MM_PORT || "8080", 10);
const MMPM_PORT = parseInt(process.env.MMPM_PORT || "7890", 10);
const API_PORT = parseInt(process.env.API_PORT || "1984", 10);
const RTSP_PORT = parseInt(process.env.RTSP_PORT || "8554", 10);
const SRTP_PORT = parseInt(process.env.SRTP_PORT || "8443", 10);
const WEBRTC_PORT = parseInt(process.env.WEBRTC_PORT || "8555", 10);
const LOCAL_IP = process.env.LOCAL_IP || "127.0.0.1";

// Constants
const FIRST_INSTANCE = MM_PORT === 8080;

const PORTS = {
  8080: MM_PORT,
  7890: MMPM_PORT
};

const HOSTS = {
  "127.0.0.1": LOCAL_IP,
  localhost: LOCAL_IP
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
 * ► LOCAL_IP    : ${LOCAL_IP}
 * ► MM_PORT     : ${MM_PORT}
 * ► MMPM_PORT   : ${MMPM_PORT}
 * ► API_PORT    : ${API_PORT}
 * ► RTSP_PORT   : ${RTSP_PORT}
 * ► SRTP_PORT   : ${SRTP_PORT}
 * ► WEBRTC_PORT : ${WEBRTC_PORT}
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
    exec_mode: "fork",
    watch: ["./", "config", "config.js"].join(sep),
    auto_restart: true,
    user: 1000,
    kill_timeout: 0,
    env: {
      MM_PORT: MM_PORT,
      API_PORT: API_PORT,
      RTSP_PORT: RTSP_PORT,
      SRTP_PORT: SRTP_PORT,
      WEBRTC_PORT: WEBRTC_PORT
    }
  },
  {
    name: "mmpm",
    instances: 1,
    script: "/bin/bash",
    cwd: SCRIPT_PATH,
    args: [
      "-c",
      [
        join(PYTHON_BIN_HOME, "gunicorn"),
        "--reload",
        "--worker-class",
        "gevent",
        "--bind",
        "localhost:7891",
        "mmpm.wsgi:app",
        "--user=pn"
      ].join(" ")
    ],
    exec_mode: "fork",
    auto_restart: true,
    user: 1000,
    kill_timeout: 0
  },
  {
    name: "nginx",
    instances: 1,
    script: join(NGINX_HOME, "nginx"),
    args: ["-g", "daemon off; master_process on;"],
    exec_mode: "fork",
    auto_restart: true,
    log_file: "/dev/null",
    error_file: "/dev/null",
    kill_timeout: 0
  }
];

info(`Setting environment for instance ${INSTANCE}`);
info(`► LOCAL_IP    : ${LOCAL_IP}`);
info(`► MM_PORT     : ${MM_PORT}`);
info(`► MMPM_PORT   : ${MMPM_PORT}`);
info(`► API_PORT    : ${API_PORT}`);
info(`► RTSP_PORT   : ${RTSP_PORT}`);
info(`► SRTP_PORT   : ${SRTP_PORT}`);
info(`► WEBRTC_PORT : ${WEBRTC_PORT}`);

function deleteDoneFile() {
  try {
    fs.unlinkSync(doneFile);
  } catch (_) {}
}

function deleteUpdateFile() {
  try {
    fs.unlinkSync(updateFile);
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
  fs.writeFileSync(filename, contents);
  info(`Stored config for ${filename}`);
}

// Function to process each file and replace the content
function updateFiles(file, replacements) {
  let data = fs.readFileSync(file, "utf8"),
    updated = false;
  for (const [oldValue, newValue] of Object.entries(replacements)) {
    const regex = new RegExp(`${oldValue}`, "gim");
    const replacement = `${newValue}`;
    if (data.match(regex)) {
      data = data.replace(regex, replacement);
      updated = true;
    }
  }
  if (updated) fs.writeFileSync(file, data);
  return updated;
}

function fixSystemFiles() {
  info("Fixing system files");
  // Define the glob patterns and whether to replace localhost
  const extensions = ["conf", "ini", "json", "js", "txt"].join(",");
  const patternPrefixes = {
    [NGINX_CONFIG_PATH]: false,
    [MMPM_STATIC_PATH]: true,
    [MMPM_CONFIG_PATH]: false,
    [join(MM_PATH, "js")]: false
  };

  // Find files based on the patterns and process them
  let processed = [];
  Object.entries(patternPrefixes).forEach(([prefix, replaceHosts]) => {
    const replacements = Object.entries({
      ...PORTS,
      ...(replaceHosts ? HOSTS : {})
    }).reduce((acc, [o, n]) => {
      if (`${o}` !== `${n}`) acc[o] = n;
      return acc;
    }, {});
    if (replacements.length === 0) return;

    const pattern = join(prefix, `**/*.{${extensions}}`);
    globSync(pattern, {
      follow: true,
      ignore: [
        `${MM_PATH}/js/defaults.js`,
        `${MMPM_STATIC_PATH}/assets/**/*`,
        `${MMPM_CONFIG_PATH}/mmpm-env.json`,
        `**/node_modules/**/*`,
        `**/*.sample`
      ]
    }).forEach((file) => {
      if (updateFiles(file, replacements)) processed.push(file);
    });
  });
  if (processed.length > 0) {
    info(`Fixed host and ports:`);
    processed.forEach((f) => info(`► ${f}`));

    const loggerFile = join(MM_PATH, "node_modules/console-stamp/index.js");
    let loggerData = fs.readFileSync(loggerFile, "utf8");
    loggerData = loggerData.replace(
      /(generateConfig\(\s*)([^\)]+)/gm,
      "$1{ ...options, format: ':label|:msg', pattern: ':label|:msg' }"
    );
    fs.writeFileSync(loggerFile, loggerData);
  }
}

function fixMmpmEnv() {
  // Fixing MMPM
  info("Copying MMPM defaults");
  copyFolder(join(DEFAULTS_PATH, "mmpm"), MMPM_CONFIG_PATH);
  if (!fs.existsSync(mmpmLogFile)) {
    fs.symlinkSync("/dev/null", mmpmLogFile);
  }
  const envValues = Object.entries(MMPM_CONFIG)
    .map(([key, value]) => `  - ${key}: ${value}`)
    .join("\n");

  info(`Fixing MMPM environment:\n${envValues}`);
  fs.writeFileSync(mmpmEnvFile, JSON.stringify(MMPM_CONFIG, null, 2), "utf-8");
  info(`Stored config for ${mmpmEnvFile}`);
}

function fixMmEnv() {
  // Fixing MagicMirror
  info("Generating default config");
  copyFolder(join(DEFAULTS_PATH, "config"), MM_CONFIG_PATH);
  if (!fs.existsSync(join(MM_CONFIG_PATH, "config.js")))
    fs.copyFileSync(
      join(MM_CONFIG_PATH, "config.js.sample"),
      join(MM_CONFIG_PATH, "config.js")
    );

  info("Generating default styles");
  copyFolder(join(DEFAULTS_PATH, "css"), MM_CSS_PATH);
  if (!fs.existsSync(join(MM_CSS_PATH, "custom.css")))
    fs.writeFileSync(join(MM_CSS_PATH, "custom.css"), "");

  info(`Fixing MagicMirror config`);
  const BASE_MODULES = [
    { module: "MMM-RefreshClientOnly" },
    { module: "mmpm" }
  ];

  const actualConfig = fs.existsSync(configFile)
    ? require(configFile)
    : fs.existsSync(defaultConfigFile)
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
}

function rmFolder(folderPath, keepParent) {
  const removeParent = typeof keepParent === "undefined" || keepParent !== true;
  if (fs.existsSync(folderPath)) {
    fs.readdirSync(folderPath).forEach((file, index) => {
      const currentPath = join(folderPath, file);
      if (fs.lstatSync(currentPath).isDirectory()) {
        rmFolder(currentPath);
      } else {
        try {
          fs.unlinkSync(currentPath);
        } catch (_) {}
      }
    });
    if (removeParent)
      try {
        fs.rmdirSync(folderPath);
      } catch (_) {}
  }
}

function copyFolder(sourceFolder, targetFolder) {
  if (!fs.existsSync(targetFolder))
    fs.mkdirSync(targetFolder, { recursive: true });

  fse.copySync(sourceFolder, targetFolder, {
    overwrite: true,
    errorOnExist: false
  });

  chownFolder(targetFolder, 1000, 1000);
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
    return (
      fs.existsSync(definitionsPath) && fs.statSync(definitionsPath).isFile()
    );
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
    description: packageInfo.description ?? module
  };
}

function handleModuleDeps(modulePath) {
  const definitionsPath = join(modulePath, "package.json");
  const isNpmModule =
    fs.existsSync(definitionsPath) && fs.statSync(definitionsPath).isFile();
  if (!isNpmModule) return;
  info("  Installing dependencies");
  chownFolder("/root/.npm", 1000, 1000);
  chownFolder("/root/.npmrc", 1000, 1000);
  try {
    const { stderr } = spawnSync(
      "npm",
      ["install", "--no-audit", "--no-fund", "--prefix", modulePath],
      { cwd: modulePath }
    );
    if (stderr && `${stderr}`.trim().length > 0) throw new Error(`${stderr}`);
    info(`  - Done`);
  } catch (err) {
    warning(`  - Error: ${err}`);
  }
}

function cleanRepo(modulePath) {
  try {
    spawnSync("git", ["checkout", "."], { cwd: modulePath });
  } catch (err) {}
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
    info(`  - Done`);
  } catch (err) {
    warning(`  - Error: ${err}`);
  }
}

function fixModules() {
  if (FIRST_INSTANCE || fs.existsSync(updateFile)) {
    chownFolder(MM_MODULES_PATH, 1000, 1000);

    deleteUpdateFile();
    ["mmpm", "default", "MMM-RefreshClientOnly"].forEach((module) => {
      rmFolder(join(MM_MODULES_PATH, module));
    });

    info("Copying default modules");
    fs.readdirSync(DEFAULT_MODULES_PATH, { withFileTypes: true })
      .filter((m) => m.isDirectory())
      .forEach(({ name: module }) => {
        info(`► ${module}`);
        const sourcePath = join(DEFAULT_MODULES_PATH, module);
        const targetPath = join(MM_MODULES_PATH, module);
        copyFolder(sourcePath, targetPath);
      });

    info("Initializing modules");
    return new Promise((resolve) => {
      fs.readdirSync(MM_MODULES_PATH, { withFileTypes: true })
        .filter((m) => m.isDirectory() && !["default", "mmpm"].includes(m.name))
        .forEach(({ name: module }) => {
          const modulePath = join(MM_MODULES_PATH, module);
          const currentVersion = getModuleInfo(modulePath).version;
          info(`► ${module}`);
          if (isGitRepo(modulePath)) {
            info("  Updating repository");
            cleanRepo(modulePath);
            pullRepo(modulePath);
            const newVersion = getModuleInfo(modulePath).version;
            if (newVersion !== currentVersion)
              info(`  Version setted as ${newVersion}`);
          }
          if (isPackage(modulePath)) handleModuleDeps(modulePath);
        });
      chownFolder(MM_MODULES_PATH, 1000, 1000);
      info("Modules ready");
      resolve();
    });
  }

  info("Waiting modules");
  return new Promise((resolve, reject) => {
    const interval = setInterval(() => {
      fs.stat(doneFile, (err) => {
        if (err) return;
        info("Modules ready");
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
    Object.values(JSON.parse(fs.readFileSync(externalPackagesFile))).forEach(
      (packageGroup) => {
        packages.push(...packageGroup);
        externalPackages.push(...packageGroup);
      }
    );
  } catch (_) {}

  try {
    Object.values(JSON.parse(fs.readFileSync(thirdPartyPackagesFile))).forEach(
      (packageGroup) => packages.push(...packageGroup)
    );
  } catch (_) {}

  const repositories = packages.map((p) => p.repository);

  info("► Detected " + packages.length + " registered packages");
  info("► Looking for modules" + MM_PATH);

  let shouldSaveExternalPackages = false;
  fs.readdirSync(MM_MODULES_PATH, { withFileTypes: true })
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
    fs.writeFileSync(
      externalPackagesFile,
      JSON.stringify({ "External Packages": externalPackages }, null, 4)
    );
  }
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
  acc[a.name] = null;
  return acc;
}, {});

function handlePm2Log(_, { data, process: { name } }) {
  if (!PM2_APPS.map((a) => a.name).includes(name) || typeof data !== "string")
    return;
  const rawData = data || "";

  rawData
    .split("\n")
    .filter((line) => line && line.length > 0)
    .forEach(function (line) {
      let fixedLine = line;
      if (name === "mmpm") {
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
  fixModules().then(async () => {
    if (FIRST_INSTANCE) {
      fs.writeFileSync(doneFile, "");
    }
    fs.writeFileSync(updateFile, "");

    fixSystemFiles();
    fixMmEnv();
    fixMmpmEnv();
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
