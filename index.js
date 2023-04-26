/* eslint-disable camelcase */
/* eslint-disable no-template-curly-in-string */
/* eslint-disable no-setter-return */
/* eslint-disable grouped-accessor-pairs */
const yaml = require("js-yaml");
const fs = require("node:fs");
const path = require("node:path");
const { networkInterfaces } = require("os");
const { DockerComposeFile } = require("./DockerComposeFile");

const HOST_SCRIPT_PATH = __dirname;
const HOST_CACHE_PATH = path.join(HOST_SCRIPT_PATH, ".cache");
const HOST_INSTANCES_PATH = path.join(HOST_SCRIPT_PATH, "instances");
const HOST_MM_MODULES_PATH = path.join(HOST_SCRIPT_PATH, "modules");
const HOST_MM_CONFIG_PATH = path.join(
  HOST_INSTANCES_PATH,
  "${INSTANCE}",
  "config"
);
const HOST_MM_CSS_PATH = path.join(HOST_INSTANCES_PATH, "${INSTANCE}", "css");
const HOST_SHARED_PATH = path.join(HOST_SCRIPT_PATH, "shared");
const HOST_MMPM_CONFIG_PATH = path.join(HOST_CACHE_PATH, "mmpm_${INSTANCE}");

const CONTAINER_SCRIPT_PATH = path.join("/home", "pn");
const CONTAINER_MM_PATH = path.join(CONTAINER_SCRIPT_PATH, "MagicMirror");
const CONTAINER_MM_CONFIG_PATH = path.join(CONTAINER_MM_PATH, "config");
const CONTAINER_MM_MODULES_PATH = path.join(CONTAINER_MM_PATH, "modules");
const CONTAINER_MM_CSS_PATH = path.join(CONTAINER_MM_PATH, "css");
const CONTAINER_SHARED_PATH = path.join(CONTAINER_MM_PATH, "shared");
const CONTAINER_MMPM_CONFIG_PATH = path.join(
  CONTAINER_SCRIPT_PATH,
  ".config",
  "mmpm"
);

const dockerComposeFile = path.join(HOST_SCRIPT_PATH, "docker-compose.yml");

console.log("► Looking for network interfaces");
const ipToBind = Object.entries(networkInterfaces())
  .reduce((acc, [name, net]) => {
    const isEthernet = name.indexOf("eth") === 0;
    const isWireless = name.indexOf("wlan") === 0;
    const __match = net.find((addr) => {
      const familyV4Value = typeof addr.family === "string" ? "IPv4" : 4;
      return (
        addr.family === familyV4Value &&
        !addr.internal &&
        (isEthernet || isWireless)
      );
    });
    if (__match !== undefined) {
      acc.push({ name, address: __match.address });
    }
    return acc;
  }, [])
  .sort((a, b) => {
    if (a.name.substr(0, 3) === b.name.substr(0, 3))
      return a.name.localeCompare(b.name);
    else return a.name.substr(0, 3).localeCompare(a.name.substr(0, 3));
  })
  .shift();

if ([null, undefined].includes(ipToBind)) {
  console.error("  Could not find a valid network interface to bind");
  console.error("  Only LAN/WiFi connections accepted");
  process.exit(1);
}
console.log("► Binding to " + ipToBind.address + " (" + ipToBind.name + ")");

const globalTemplate = yaml.dump({
  version: "3"
});

const instanceTemplate = yaml.dump(
  {
    version: "3",
    services: {
      "${INSTANCE}_mm": {
        image: "andresvanegas/mm-swarm",
        container_name: "${INSTANCE}",
        environment: [
          "INSTANCE=${INSTANCE}",
          "MM_PORT=${MM_PORT}",
          "MMPM_PORT=${MMPM_PORT}",
          "LOCAL_IP=${LOCAL_IP}",
          "CLIENT_ID=",
          "CLIENT_SECRET="
        ],
        ulimits: {
          nofile: {
            soft: 65536,
            hard: 65536
          }
        },
        ports: [
          "0.0.0.0:${MM_PORT}:${MM_PORT}",
          "0.0.0.0:${MMPM_PORT}:${MMPM_PORT}"
        ],
        volumes: [
          `${HOST_MMPM_CONFIG_PATH}:${CONTAINER_MMPM_CONFIG_PATH}`,
          `${HOST_MM_MODULES_PATH}:${CONTAINER_MM_MODULES_PATH}`,
          `${HOST_MM_CONFIG_PATH}:${CONTAINER_MM_CONFIG_PATH}`,
          `${HOST_MM_CSS_PATH}:${CONTAINER_MM_CSS_PATH}`,
          `${HOST_SHARED_PATH}:${CONTAINER_SHARED_PATH}`
        ],
        privileged: true,
        restart: "always",
        networks: ["${INSTANCE}-network"]
      }
    },
    // separate networks to avoid undesired effects on notifications system
    networks: {
      "${INSTANCE}-network": {
        driver: "bridge"
      }
    }
  },
  {
    noCompatMode: true,
    sortKeys: false
  }
);

const replacements = {
  LOCAL_IP: [],
  INSTANCE: [],
  MM_PORT: [],
  MMPM_PORT: []
};

console.log("► Looking for instances");
let instances = 0;
fs.readdirSync(HOST_INSTANCES_PATH, { withFileTypes: true })
  .filter((file) => file.isDirectory())
  // eslint-disable-next-line unicorn/no-array-for-each
  .forEach((file, index) => {
    const { name: instance } = file;
    instances++;
    const mmPort = 8080 + index;
    const mmpmPort = 7890 + index * 4;
    console.log("⦿ Found instance: " + instance);
    replacements.LOCAL_IP.push(ipToBind.address);
    replacements.INSTANCE.push(instance);
    replacements.MM_PORT.push(mmPort);
    replacements.MMPM_PORT.push(mmpmPort);
    console.log("  - MM_PORT       : " + mmPort);
    console.log("  - MMPM_PORT     : " + mmpmPort);
    fs.mkdirSync(path.join(HOST_CACHE_PATH, `mmpm_${instance}`), {
      recursive: true
    });
  });
console.log(`► Processed ${instances} instances`);
console.log("► Generating docker-compose.yml");
let mergedMap;
if (instances > 0) {
  const composeTemplate = new DockerComposeFile(instanceTemplate);
  const composeFiles = composeTemplate.mapTemplate(
    ...Object.entries(replacements)
  );
  mergedMap = new DockerComposeFile(...composeFiles);
} else {
  mergedMap = new DockerComposeFile(...[globalTemplate]);
}
mergedMap.write(dockerComposeFile);
console.log("► Done");
