/* eslint-disable camelcase */
/* eslint-disable no-template-curly-in-string */
/* eslint-disable no-setter-return */
/* eslint-disable grouped-accessor-pairs */
const yaml = require('js-yaml');
const fs = require('node:fs');
const deepmerge = require('deepmerge');
const { networkInterfaces } = require('os');

/**
 * Docker Compose File class.
 * Represents the yaml object of a docker-compose file.
 * Allows for merging and mapping of compose files.
 */
class DockerComposeFile {
  /**
   * Creates a DockerComposeFile instance with provided docker-compose.yml file or string.
   * @param {String|DockerComposeFile} composeFileString a path to a docker-compose.yml file, a full yaml string or a DockerComposeFile instance.
   * @example
   * const composeFile = new DockerComposeFile(`${__dirname}/docker-compose.yml`);
   * @example
   * const composeFile = new DockerComposeFile(`${__dirname}/docker-compose.yml`, `${__dirname}/docker-compose.vpn.yml`);
   * @example
   * const composeFile = new DockerComposeFile(`${__dirname}/docker-compose.yml, "version: '3'");
   * @returns {DockerComposeFile} DockerComposeFile instance with all files or strings merged together.
   */
  constructor(...composeFiles) {
    this.add(...composeFiles);
  }

  /**
   * Merges the provided compose files into the current yaml class object.
   * @param {String|DockerComposeFile} composeFiles Any number of compose file paths or DockerComposeFile objects.
   * @returns {String} Merged yaml string.
   */
  add(...composeFiles) {
    for (let composeFile of composeFiles) {
      if (composeFile instanceof DockerComposeFile) {
        composeFile = composeFile.yaml;
      } else if (composeFile?.includes('.yml')) {
        composeFile = fs.readFileSync(composeFile, 'utf8').trim();
      }

      this.yamlObject = deepmerge(this.yamlObject, yaml.load(composeFile), {
        // eslint-disable-next-line object-shorthand
        arrayMerge: (target, source, options) => {
          return [...target, ...source]
            .filter((value, index, self) => self.indexOf(value) === index)
            .map(function (element) {
              return options.cloneUnlessOtherwiseSpecified(element, options);
            });
        }
      });
    }

    return this.yaml;
  }

  /**
   * Merges the new yaml string to the current yaml also takes file paths or DockerComposeFiles.
   * @type {String}
   */
  set yaml(yamlString) {
    return this.add(yamlString);
  }

  get yaml() {
    return yaml.dump(this.yamlObject, { sortKeys: false }).trim();
  }

  /**
   * Save the yaml file to disk.
   * @param path File path to save the yaml.
   */
  write(path) {
    fs.writeFileSync(path, this.yaml);
  }

  /**
   * Takes a docker-compose file with template strings and generates an array of substituted docker compose files.
   * Only operates with arrays of substitutions of the same length.
   * @param {Array<String, Array<String>>} substitutions Each set of substitutions an key and an array of values to map.
   * @example
   * // docker-compose file containing template strings for ${REGION} and ${ID}.
   * const yamlString =
   * `
   * services:
   *   vpn-${REGION}-${ID}:
   *     container_name: 'vpn-${REGION}-${ID}'
   *     environment:
   *       - REGION=${REGION}
   * `;
   * const composeFileTemplate = new DockerComposeFile(yamlString);
   * // Will return a array of 2 compose files for each substitution.
   * const composeFiles = composeFileTemplate.mapTemplate(
   *    ['REGION', ['US_West', 'US_Seattle']],
   *    ['ID', ['1', '2']]
   * );
   * @returns Array of substituted docker compose files.
   * @todo allow for variable length substitutions.
   */
  mapTemplate(...substitutions) {
    const composeTemplate = this.yaml;
    const composeFiles = [];
    while (substitutions.length > 0) {
      const [stringTemplate, subs] = substitutions.pop();
      for (const [index, sub] of subs.entries()) {
        if (composeFiles[index] === undefined) {
          composeFiles[index] = composeTemplate;
        }

        composeFiles[index] = composeFiles[index].replaceAll(
          '${' + stringTemplate + '}',
          sub
        );
      }
    }

    return composeFiles.map((file) => new DockerComposeFile(file));
  }
}

console.log("► Looking for network interfaces");
const ipToBind = Object.entries(networkInterfaces())
  .reduce((acc, [name, net]) => {
    const isEthernet = name.indexOf('eth') === 0;
    const isWireless = name.indexOf('wlan') === 0;
    const __match = net.find((addr) => {
      const familyV4Value = typeof addr.family === 'string' ? 'IPv4' : 4;
      return addr.family === familyV4Value && !addr.internal && (isEthernet || isWireless);
    })
    if (__match !== undefined) {
      acc.push({ name, address: __match.address });
    }
    return acc;
  }, [])
  .sort((a, b) => {
    if (a.name.substr(0, 3) === b.name.substr(0, 3)) return a.name.localeCompare(b.name);
    else return a.name.substr(0, 3).localeCompare(a.name.substr(0, 3));
  }).
  shift();

if ([null, undefined].includes(ipToBind)) {
  console.error('  Could not find a valid network interface to bind');
  console.error('  Only LAN/WiFi connections accepted');
  process.exit(1);
}
console.log("► Binding to " + ipToBind.address + " (" + ipToBind.name + ")");

const instanceTemplate = yaml.dump(
  {
    version: '3',
    services: {
      '${INSTANCE}_mm': {
        image: 'andresvanegas/mm',
        build: {
          context: 'build',
          dockerfile: 'Dockerfile-mm',
        },
        container_name: '${INSTANCE}_mm',
        environment: {
          MM_PORT: '${MM_PORT}',
        },
        ports: ['${MM_PORT}:${MM_PORT}'],
        volumes: [
          './instances/${INSTANCE}/config:/opt/magic_mirror/config',
          './instances/${INSTANCE}/css:/opt/magic_mirror/css',
          './modules:/opt/magic_mirror/modules',
          './shared:/opt/magic_mirror/shared'
        ],
        privileged: true,
        restart: 'always',
        networks: ['mmpm-${INSTANCE}-network'],
      },
      '${INSTANCE}_mmpm': {
        image: 'andresvanegas/mmpm',
        build: {
          context: 'build',
          dockerfile: 'Dockerfile-mmpm',
        },
        container_name: '${INSTANCE}_mmpm',
        environment: {
          MM_PORT: '${MM_PORT}',
          MMPM_PORT: '${MMPM_PORT}',
          MMPM_WSSH_PORT: '${MMPM_WSSH_PORT}',
          LOCAL_IP: '${LOCAL_IP}',
        },
        ports: ['${MMPM_PORT}:${MMPM_PORT}', '${MMPM_WSSH_PORT}:${MMPM_WSSH_PORT}'],
        volumes: [
          './instances/${INSTANCE}/config:/home/node/MagicMirror/config',
          './instances/${INSTANCE}/css:/home/node/MagicMirror/css',
          './modules:/home/node/MagicMirror/modules',
          '${INSTANCE}-mmpm-config:/home/node/.config/mmpm',
        ],
        privileged: true,
        restart: 'always',
        networks: ['mmpm-${INSTANCE}-network'],
        depends_on: ['${INSTANCE}_mm'],
      }
    },
    // separate networks to avoid undesired effects on notifications system
    networks: {
      'mmpm-${INSTANCE}-network': {
        driver: 'bridge',
      },
    },
    //don't cache mmpm config
    volumes: {
      '${INSTANCE}-mmpm-config': null,
    },
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
  MMPM_PORT: [],
  MMPM_WSSH_PORT: []
};

console.log('► Looking for instances');
fs.readdirSync(__dirname + '/instances', { withFileTypes: true })
  .filter((file) => file.isDirectory())
  // eslint-disable-next-line unicorn/no-array-for-each
  .forEach((file, index) => {
    const mmPort = 8080 + index;
    const mmpmPort = 7890 + (index * 4);
    const mmpmWsshPort = mmpmPort + 2;
    console.log('⦿ Found instance: ' + file.name);
    replacements.LOCAL_IP.push(ipToBind.address);
    replacements.INSTANCE.push(file.name);
    replacements.MM_PORT.push(mmPort);
    replacements.MMPM_PORT.push(mmpmPort);
    replacements.MMPM_WSSH_PORT.push(mmpmWsshPort);
    console.log('  - MM_PORT       : ' + mmPort);
    console.log('  - MMPM_PORT     : ' + mmpmPort);
    console.log('  - MMPM_WSSH_PORT: ' + mmpmWsshPort);
  });
console.log('► Processed ' + replacements.INSTANCE.length + ' instances');

console.log('► Generating docker-compose.yml');
const composeTemplate = new DockerComposeFile(instanceTemplate);
const composeFiles = composeTemplate.mapTemplate(
  ...Object.entries(replacements)
);
const mergedMap = new DockerComposeFile(...composeFiles);
mergedMap.write(__dirname + '/docker-compose.yml');
console.log('► Done');
