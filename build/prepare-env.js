const fs = require("fs");
const { globSync } = require("glob");
const yaml = require("js-yaml");
const { join } = require("path");
const prettier = require("prettier");

// Paths
const SCRIPT_PATH = __dirname;
const PYTHON_BIN_HOME = join(SCRIPT_PATH, ".local", "bin");
const NGINX_HOME = "/usr/sbin";
const NGINX_CONFIG_PATH = "/etc/nginx/http.d";
const DOCUMENT_ROOT = "/var/www";
const MAGIC_MIRROR_PATH = join(SCRIPT_PATH, "MagicMirror");
const MMPM_CONFIG_PATH = join(SCRIPT_PATH, ".config", "mmpm");
const MMPM_STATIC_PATH = join(DOCUMENT_ROOT, "mmpm", "static");

// Config files paths
const configFile = join(MAGIC_MIRROR_PATH, "config", "config.js");
const defaultConfigFile = join(MAGIC_MIRROR_PATH, "config", "config.js.sample");
const ecosystemFile = join(SCRIPT_PATH, "ecosystem.config.js");

// Networking
const INSTANCE = process.env.INSTANCE;
const MM_PORT = parseInt(process.env.MM_PORT || "8080", 10);
const MMPM_PORT = parseInt(process.env.MMPM_PORT || "7890", 10);
const LOCAL_IP = process.env.LOCAL_IP || "127.0.0.1";

if (!process.env.INSTANCE) {
  throw new Error("Invalid instance!");
}

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
  modules: [],
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
  MMPM_MAGICMIRROR_ROOT: MAGIC_MIRROR_PATH,
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

const ECOSYSTEM_TPL = "module.exports = __PLACEHOLDER__";

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

// Define the glob patterns and whether to replace localhost
const extensions = ["conf", "ini", "json", "js", "txt"].join(",");
const patternPrefixes = {
  [NGINX_CONFIG_PATH]: false,
  [MMPM_STATIC_PATH]: true,
  [MMPM_CONFIG_PATH]: false,
  [join(MAGIC_MIRROR_PATH, "js")]: false
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
      `${MAGIC_MIRROR_PATH}/js/defaults.js`,
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
  processed.forEach((f) => console.log(`- ${f}`));
}

// Fixing MMPM
console.log(`Fixing MMPM ${yaml.dump({ environment: MMPM_CONFIG })}`);
fs.writeFileSync(
  join(MMPM_CONFIG_PATH, "mmpm-env.json"),
  JSON.stringify(MMPM_CONFIG, null, 2),
  "utf-8"
);

// Fixxing MagicMirror
console.log(`Fixing MagicMirror config`);
const BASE_MODULES = [{ module: "MMM-RefreshClientOnly" }, { module: "mmpm" }];

const actualConfig = fs.existsSync(configFile)
  ? require(configFile)
  : fs.existsSync(defaultConfigFile)
  ? require(defaultConfigFile)
  : {};
const desiredConfig = deepMerge(deepMerge({}, MM_BASE_CONFIG), {
  ...actualConfig,
  port: MM_PORT
});

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

// Fixing PM2
console.log(`Fixing PM2 config`);
const pm2Config = {
  apps: [
    {
      name: "MagicMirror",
      instances: 1,
      cwd: MAGIC_MIRROR_PATH,
      script: "npm",
      args: ["run", "server"],
      exec_mode: "fork",
      watch: ["./config", "./css", "../update"],
      auto_restart: true,
      log_date_format: "",
      combine_logs: true,
      merge_logs: true,
      time: false,
      user: 1000,
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
      combine_logs: true,
      merge_logs: true,
      error_file: "/dev/null",
      time: false,
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
      log_date_format: "",
      combine_logs: true,
      merge_logs: true,
      error_file: "/dev/null",
      time: false,
      kill_timeout: 0
    }
  ]
};
setFixedConfig(ecosystemFile, ECOSYSTEM_TPL, pm2Config);
