const { globSync } = require("glob");
const { join } = require("path");
const { simpleGit, CleanOptions } = require("simple-git");
const { spawnSync } = require("child_process");
const { sync: chownFolder } = require("chownr");
const fs = require("fs");
const fse = require("fs-extra");
const git = simpleGit();
const pm2 = require("pm2");
const prettier = require("prettier");
const winston = require("winston");

if (
  !process.env.INSTANCE ||
  !process.env.MM_PORT ||
  !process.env.MMPM_PORT ||
  !process.env.LOCAL_IP
) {
  console.error("Invalid environment!");
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

const MM_BASE_CONFIG = {
  address: "0.0.0.0",
  port: MM_PORT,
  basePath: "/",
  timeFormat: 12,
  ipWhitelist: [],
  language: "es",
  locale: "es_CO",
  logLevel: ["INFO", "LOG", "WARN", "ERROR"],
  logging: {
    dateFormat: ""
  },
  units: "metric",
  serverOnly: true,
  electronOptions: {
    webPreferences: {
      webviewTag: true,
      contextIsolation: false,
      enableRemoteModule: true
    }
  }
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
 * INSTANCE  : ${INSTANCE}
 * MMPM_PORT : ${MMPM_PORT}
 */
\n\n
let config = __PLACEHOLDER__;
\n\n/*************** DO NOT EDIT THE LINE BELOW ***************/
if (typeof module !== 'undefined') {
\tmodule.exports = config;
}`;

const REPO_URL_REGEX = /^([\w]+@)?([^:]+):([^\/]+)\/(.+)(\.git)?$/gi;
const PM2_CONFIG = {
  apps: [
    {
      name: "MagicMirror",
      instances: 1,
      cwd: MM_PATH,
      script: join(MM_PATH, "serveronly", "index.js"),
      args: [],
      exec_mode: "fork",
      watch: [join(MM_PATH, "config", "config.js")],
      auto_restart: true,
      log_date_format: "",
      time: false,
      user: 1000,
      merge_logs: true,
      combine_logs: true,
      kill_timeout: 0,
      env: {
        MM_PORT: MM_PORT
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
      log_date_format: "",
      error_file: "/dev/null",
      time: false,
      user: 1000,
      merge_logs: true,
      combine_logs: true,
      kill_timeout: 0
    },
    {
      name: "nginx",
      instances: 1,
      script: join(NGINX_HOME, "nginx"),
      args: ["-g", "daemon off; master_process on;"],
      exec_mode: "fork",
      auto_restart: true,
      log_date_format: "",
      error_file: "/dev/null",
      time: false,
      merge_logs: true,
      combine_logs: true,
      kill_timeout: 0
    }
  ]
};

console.log(`Setting environment for instance ${INSTANCE}`);
console.log(`► MM_PORT   : ${MM_PORT}`);
console.log(`► MMPM_PORT : ${MMPM_PORT}`);

function deleteDoneFile() {
  try {
    fs.unlinkSync(doneFile);
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
  console.log(`Stored config for ${filename}`);
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
  console.log("Fixing system files");
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
    console.log(`Fixed host and ports:`);
    processed.forEach((f) => console.log(`► ${f}`));

    // Fix logger
    const loggerFile = join(MM_PATH, "node_modules/console-stamp/index.js");
    let loggerData = fs.readFileSync(loggerFile, "utf8");
    loggerData = loggerData.replace(
      /(generateConfig\(\s*)([^\)]+)/gm,
      "$1{ ...options, format: '', pattern: '' }"
    );
    fs.writeFileSync(loggerFile, loggerData);
  }
}

function fixMmpmEnv() {
  // Fixing MMPM
  console.log("Copying MMPM defaults");
  copyFolder(join(DEFAULTS_PATH, "mmpm"), MMPM_CONFIG_PATH);
  if (!fs.existsSync(mmpmLogFile)) {
    fs.symlinkSync("/dev/null", mmpmLogFile);
  }
  const envValues = Object.entries(MMPM_CONFIG)
    .map(([key, value]) => `  - ${key}: ${value}`)
    .join("\n");

  console.log(`Fixing MMPM environment:\n${envValues}`);
  fs.writeFileSync(mmpmEnvFile, JSON.stringify(MMPM_CONFIG, null, 2), "utf-8");
  console.log(`Stored config for ${mmpmEnvFile}`);
}

function fixMmEnv() {
  // Fixing MagicMirror
  console.log("Generating default config");
  copyFolder(join(DEFAULTS_PATH, "config"), MM_CONFIG_PATH);
  if (!fs.existsSync(join(MM_CONFIG_PATH, "config.js")))
    fs.copyFileSync(
      join(MM_CONFIG_PATH, "config.js.sample"),
      join(MM_CONFIG_PATH, "config.js")
    );

  console.log("Generating default styles");
  copyFolder(join(DEFAULTS_PATH, "css"), MM_CSS_PATH);
  if (!fs.existsSync(join(MM_CSS_PATH, "custom.css")))
    fs.writeFileSync(join(MM_CSS_PATH, "custom.css"), "");

  console.log(`Fixing MagicMirror config`);
  const BASE_MODULES = [
    { module: "MMM-RefreshClientOnly" },
    { module: "mmpm" }
  ];

  const actualConfig = fs.existsSync(configFile)
    ? require(configFile)
    : fs.existsSync(defaultConfigFile)
    ? require(defaultConfigFile)
    : {};
  const desiredConfig = deepMerge(deepMerge({}, actualConfig), MM_BASE_CONFIG);

  for (const requiredModule of BASE_MODULES) {
    const alreadyInConfig = desiredConfig.modules.find(
      (m) => m.module === requiredModule.module
    );
    if (!alreadyInConfig) {
      console.log(`Adding ${requiredModule.module} module to the config`);
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
        fs.unlinkSync(currentPath);
      }
    });
    if (removeParent) fs.rmdirSync(folderPath);
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

async function handleModuleDeps(module) {
  const modulePath = join(MM_MODULES_PATH, module);
  const definitionsPath = join(modulePath, "package.json");
  const isNpmModule =
    fs.existsSync(definitionsPath) && fs.statSync(definitionsPath).isFile();
  if (isNpmModule) {
    console.log("  Installing dependencies");
    chownFolder("/root/.npm", 1000, 1000);
    chownFolder("/root/.npmrc", 1000, 1000);
    const modulePath = join(MM_MODULES_PATH, module);
    try {
      spawnSync(
        "npm",
        ["install", "--no-audit", "--no-fund", "--prefix", modulePath],
        { cwd: modulePath }
      );
      console.log("  Dependencies installed");
    } catch (_) {
      console.warn("  Can't install dependencies");
    }
  }
}

async function cleanAndPullRepo(module) {
  const modulePath = join(MM_MODULES_PATH, module);
  const gitPath = join(modulePath, ".git");
  const isGitModule =
    fs.existsSync(gitPath) && fs.statSync(gitPath).isDirectory();
  if (isGitModule) {
    console.log("  Updating repository");
    try {
      await git.addConfig("safe.directory", modulePath, true, "system");
      const repo = simpleGit(modulePath);
      // Clean the repository (remove untracked files and directories)
      await repo.clean(CleanOptions.FORCE + CleanOptions.QUIET);
      // Pull the latest changes from the remote
      await repo.pull();
      console.log("  Updated repository");
    } catch (_) {
      console.warn("  Can't update repository");
    }
  }
}

function fixModules() {
  if (FIRST_INSTANCE) {
    chownFolder(MM_MODULES_PATH, 1000, 1000);
    console.log("Copying default modules");
    fs.readdirSync(DEFAULT_MODULES_PATH, { withFileTypes: true })
      .filter((m) => m.isDirectory())
      .forEach(({ name: module }) => {
        console.log(`► ${module}`);
        const sourcePath = join(DEFAULT_MODULES_PATH, module);
        const targetPath = join(MM_MODULES_PATH, module);
        copyFolder(sourcePath, targetPath);
      });

    console.log("Initializing modules");
    return fs
      .readdirSync(MM_MODULES_PATH, { withFileTypes: true })
      .filter((m) => m.isDirectory() && !["default", "mmpm"].includes(m.name))
      .map(({ name: module }) => {
        console.log(`► ${module}`);
        return [cleanAndPullRepo(module), handleModuleDeps(module)];
      })
      .reduce((acc, promises) => [...acc, ...promises], [])
      .reduce((p, c) => p.then(() => c), Promise.resolve())
      .then(() => {
        chownFolder(MM_MODULES_PATH, 1000, 1000);
        console.log("Modules ready");
      });
  }

  console.log("Waiting modules");
  return new Promise((resolve, reject) => {
    const interval = setInterval(() => {
      fs.stat(doneFile, (err) => {
        if (err) return;
        console.log("Modules ready");
        clearInterval(interval);
        resolve();
      });
    }, 1000);
  });
}

function updatePackageData(module, packageData) {
  return new Promise((resolve, reject) => {
    const modulePath = join(MM_MODULES_PATH, module);
    const gitPath = join(modulePath, ".git");
    const isGitModule =
      fs.existsSync(gitPath) && fs.statSync(gitPath).isDirectory();
    if (!isGitModule) resolve(packageData);
    try {
      const repoData = gitConfigParse.sync({
        type: "local",
        cwd: modulePath,
        path: modulePath + "/.git/config"
      });
      if (typeof repoData['remote "origin"'] !== "undefined") {
        // prefer local repository data over package.json repository
        packageData.repository = `${repoData['remote "origin"'].url}`
          .trim()
          .replace(REPO_URL_REGEX, "https://$2/$3/$4")
          .replace(/\.git$/gi, "");
      }
    } catch (_) {
      resolve(packageData);
    }
  });
}

function fixMmpmCache() {
  console.log("Fixing MMPM cache");
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

  console.log("► Detected " + packages.length + " registered packages");
  console.log("► Looking for modules" + MM_PATH);

  let shouldSaveExternalPackages = false;
  return Promise.all(
    fs
      .readdirSync(MM_MODULES_PATH, { withFileTypes: true })
      .filter(
        (file) => !["mmpm", "default"].includes(file.name) && file.isDirectory()
      )
      .map(({ name: module }) => {
        const modulePath = join(MM_MODULES_PATH, module);
        const definitionsPath = join(modulePath, "package.json");
        const isNpmModule =
          fs.existsSync(definitionsPath) &&
          fs.statSync(definitionsPath).isFile();

        return updatePackageData(module, {
          title: module,
          author: "Anonymous",
          repository: "",
          description: `Local module installation of ${module}`,
          ...(isNpmModule
            ? (({ title, author, repository, description }) => ({
                title,
                author,
                repository,
                description
              }))(JSON.parse(fs.readFileSync(definitionsPath, "utf8")))
            : {})
        }).then((packageData) => {
          // Check if package is not already in database
          if (!repositories.includes(packageData.repository)) {
            console.log(`  - Registering ${module}`);
            externalPackages.push(packageData);
            shouldSaveExternalPackages = true;
          }
        });
      })
  ).then(() => {
    if (shouldSaveExternalPackages) {
      console.log(
        `► Saving ${externalPackages.length} external packages found`
      );
      fs.writeFileSync(
        externalPackagesFile,
        JSON.stringify({ "External Packages": externalPackages }, null, 4)
      );
    }
  });
}

function clearMessages(msg) {
  const ansiPattern = RegExp(
    [
      "[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]+)*|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)",
      "(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~]))"
    ].join("|"),
    "gim"
  );
  return msg
    .toString()
    .trim()
    .replace(ansiPattern, "")
    .replace(
      /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]\n/gim,
      ""
    )
    .replace(/\n{2,}/, "\n");
  // .replace(/(^\s+|\s+$)/g, "");
  // .split(/[\r\n]/gim)
  // .map((line) =>
  //   line
  //     .toString()
  //     .trim()
  //     .replace(ansiPattern, "")
  //     .replace(
  //       /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]\n/gim,
  //       ""
  //     )
  //     .replace(/(^\s+|\s+$)/g, "")
  // )
  // .filter((line) => `${line}`.length > 0);
}

if (FIRST_INSTANCE) {
  deleteDoneFile();
  ["mmpm", "default", "MMM-RefreshClientOnly"].forEach((module) => {
    rmFolder(join(MM_MODULES_PATH, module));
  });
}

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

fixModules().then(async () => {
  if (FIRST_INSTANCE) fs.writeFileSync(doneFile, "DONE");

  fixSystemFiles();
  fixMmEnv();
  fixMmpmEnv();
  fixMmpmCache().then(() => {
    pm2.connect(true, (error) => {
      if (error) {
        console.error(error);
        process.exit(1);
      }
      pm2.launchBus((error, bus) => {
        if (error) {
          console.error(error);
          process.exit(1);
        }

        bus.on("log:out", ({ process: { name: label }, data: message }) => {
          if (label.indexOf("nginx") >= 0) return;
          logger.info(clearMessages(message), { label });
        });

        pm2.start(
          PM2_CONFIG.apps,
          { time: false, log_date_format: "" },
          (error, apps) => {
            if (error) {
              console.error(error);
              process.exit(1);
            }
            apps.forEach((app) =>
              logger.info("started!", { label: app.pm2_env.name })
            );
          }
        );
      });
    });
  });
});
