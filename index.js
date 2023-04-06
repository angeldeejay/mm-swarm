/* eslint-disable camelcase */
/* eslint-disable no-template-curly-in-string */
/* eslint-disable no-setter-return */
/* eslint-disable grouped-accessor-pairs */
const yaml = require('js-yaml');
const fs = require('node:fs');
const { networkInterfaces } = require('os');
const { DockerComposeFile } = require('./DockerComposeFile');

console.log('► Looking for network interfaces');
const ipToBind = Object.entries(networkInterfaces())
  .reduce((acc, [name, net]) => {
    const isEthernet = name.indexOf('eth') === 0;
    const isWireless = name.indexOf('wlan') === 0;
    const __match = net.find((addr) => {
      const familyV4Value = typeof addr.family === 'string' ? 'IPv4' : 4;
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
  console.error('  Could not find a valid network interface to bind');
  console.error('  Only LAN/WiFi connections accepted');
  process.exit(1);
}
console.log('► Binding to ' + ipToBind.address + ' (' + ipToBind.name + ')');

const globalTemplate = yaml.dump({
  version: '3'
});

const instanceTemplate = yaml.dump(
  {
    version: '3',
    services: {
      '${INSTANCE}_mm': {
        image: 'mm-swarm/mm-mmpm',
        container_name: '${INSTANCE}_mm',
        build: {
          context: 'build',
          dockerfile: 'Dockerfile'
        },
        environment: [
          'INSTANCE=${INSTANCE}',
          'MM_PORT=${MM_PORT}',
          'MMPM_PORT=${MMPM_PORT}',
          'LOCAL_IP=${LOCAL_IP}'
        ],
        user: '1000:1000',
        ports: [
          '0.0.0.0:${MM_PORT}:${MM_PORT}',
          '0.0.0.0:${MMPM_PORT}:${MMPM_PORT}'
        ],
        volumes: [
          './.cache/${INSTANCE}/mmpm:/home/pn/.config/mmpm',
          './instances/${INSTANCE}/config:/home/pn/MagicMirror/config',
          './instances/${INSTANCE}/css:/home/pn/MagicMirror/css',
          './modules:/home/pn/MagicMirror/modules',
          './shared:/home/pn/MagicMirror/shared'
        ],
        privileged: true,
        restart: 'always',
        networks: ['mmpm-${INSTANCE}-network']
      }
    },
    // separate networks to avoid undesired effects on notifications system
    networks: {
      'mmpm-${INSTANCE}-network': {
        driver: 'bridge'
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

console.log('► Looking for instances');
let instances = 0;
fs.readdirSync(__dirname + '/instances', { withFileTypes: true })
  .filter((file) => file.isDirectory())
  // eslint-disable-next-line unicorn/no-array-for-each
  .forEach((file, index) => {
    instances++;
    const mmPort = 8080 + index;
    const mmpmPort = 7890 + index * 4;
    console.log('⦿ Found instance: ' + file.name);
    replacements.LOCAL_IP.push(ipToBind.address);
    replacements.INSTANCE.push(file.name);
    replacements.MM_PORT.push(mmPort);
    replacements.MMPM_PORT.push(mmpmPort);
    console.log('  - MM_PORT       : ' + mmPort);
    console.log('  - MMPM_PORT     : ' + mmpmPort);
  });
console.log('► Processed ' + instances + ' instances');

console.log('► Generating docker-compose.yml');
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
mergedMap.write(__dirname + '/docker-compose.yml');
console.log('► Done');
