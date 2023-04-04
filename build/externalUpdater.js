const fs = require('fs');
const path = require('path');
const home = path.dirname(__filename);
const gitConfigParse = require(path.join(
  home,
  'node_modules/parse-git-config'
));

const argv = process.argv;
let mmPath = path.join(home, 'MagicMirror');
let mmpmPath = path.join(home, '.config', 'mmpm');
let setted = argv.length === 0;
while (!setted) {
  switch (argv.shift()) {
    case '--mm-path':
      mmPath = argv.shift() || mmPath;
      if (
        fs.existsSync(mmPath) &&
        fs.statSync(mmPath).isDirectory() &&
        fs.statSync(mmPath + '/modules').isDirectory()
      ) {
        setted = true;
        break;
      } else {
        console.error('mmPath should be a valid installation of MagicMirror');
        process.exit(1);
      }
    case '--mmpm-path':
      mmPath = argv.shift() || mmPath;
      if (
        fs.existsSync(mmPath) &&
        fs.statSync(mmPath).isDirectory() &&
        fs.statSync(mmPath + '/modules').isDirectory()
      ) {
        setted = true;
        break;
      } else {
        console.error('mmPath should be a valid installation of MagicMirror');
        process.exit(1);
      }
  }
  setted = setted || argv.length === 0;
}
console.log(
  '► Using paths:\n  - MagicMirror: ' + mmPath + '\n  - mmpm: ' + mmpmPath
);

const packages = [];
const externalPackages = [];
if (
  fs.existsSync(mmpmPath + '/mmpm-external-packages.json') &&
  fs.existsSync(mmpmPath + '/mmpm-external-packages.json') &&
  fs.statSync(mmpmPath + '/mmpm-external-packages.json').isFile()
) {
  try {
    Object.values(
      JSON.parse(fs.readFileSync(mmpmPath + '/mmpm-external-packages.json'))
    ).forEach((packageGroup) => {
      packages.push(...packageGroup);
      externalPackages.push(...packageGroup);
    });
  } catch (_) {}
}

if (
  fs.existsSync(mmpmPath + '/MagicMirror-3rd-party-packages-db.json') &&
  fs.existsSync(mmpmPath + '/MagicMirror-3rd-party-packages-db.json') &&
  fs.statSync(mmpmPath + '/MagicMirror-3rd-party-packages-db.json').isFile()
) {
  try {
    Object.values(
      JSON.parse(
        fs.readFileSync(mmpmPath + '/MagicMirror-3rd-party-packages-db.json')
      )
    ).forEach((packageGroup) => packages.push(...packageGroup));
  } catch (_) {}
}
const repositories = packages.map((p) => p.repository);

console.log('► Detected ' + packages.length + ' registered packages');
console.log('► Looking for modules' + mmPath);

let shouldSaveExternalPackages = false;
fs.readdirSync(mmPath + '/modules', { withFileTypes: true })
  .filter(
    (file) =>
      file.name !== 'mmpm' &&
      file.name !== 'default' &&
      file.isDirectory() &&
      fs.existsSync(mmPath + '/modules/' + file.name + '/package.json') &&
      fs.statSync(mmPath + '/modules/' + file.name + '/package.json').isFile()
  )
  // eslint-disable-next-line unicorn/no-array-for-each
  .forEach((file, index) => {
    const modulePath = mmPath + '/modules/' + file.name;
    const definitionsPath = modulePath + '/package.json';
    const defaultPackageData = {
      title: file.name,
      author: 'Anonymous',
      repository: '',
      description: `Local module installation of ${file.name}`
    };

    let packageData = { ...defaultPackageData };
    if (
      fs.existsSync(definitionsPath) &&
      fs.existsSync(definitionsPath) &&
      fs.statSync(definitionsPath).isFile()
    ) {
      packageData = {
        ...defaultPackageData,
        ...JSON.parse(fs.readFileSync(definitionsPath))
      };
    }
    packageData = (({ title, author, repository, description }) => ({
      title,
      author,
      repository,
      description
    }))(packageData);

    if (
      fs.existsSync(modulePath + '/.git') &&
      fs.statSync(modulePath + '/.git').isDirectory()
    ) {
      try {
        const repoData = gitConfigParse.sync({
          type: 'local',
          cwd: modulePath,
          path: modulePath + '/.git/config'
        });
        if (typeof repoData['remote "origin"'] !== 'undefined') {
          // prefer local repository data over package.json repository
          packageData.repository = `${repoData['remote "origin"'].url}`
            .trim()
            .replace(
              /^([\w]+@)?([^:]+):([^\/]+)\/(.+)(\.git)?$/gi,
              'https://$2/$3/$4'
            )
            .replace(/\.git$/gi, '');
        }
      } catch (_) {}
    }
    for (const k of Object.keys(defaultPackageData)) {
      if (
        packageData[k] !== defaultPackageData[k] &&
        packageData[k].trim() === ''
      ) {
        packageData[k] = defaultPackageData[k];
      }
    }

    // Check if package is not already in database
    if (!repositories.includes(packageData.repository)) {
      console.log('  - Registering ' + file.name);
      externalPackages.push(packageData);
      shouldSaveExternalPackages = true;
    }
  });

if (shouldSaveExternalPackages) {
  console.log(
    '► Saving ' + externalPackages.length + ' external packages found'
  );
  fs.writeFileSync(
    mmpmPath + '/mmpm-external-packages.json',
    JSON.stringify({ 'External Packages': externalPackages }, null, 4)
  );
}
console.log('► Done');
