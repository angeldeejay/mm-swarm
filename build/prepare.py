import os
import re
from os.path import dirname, join, exists
from json import dumps, loads
from glob import glob
import jsbeautifier
import yaml

# Paths
SCRIPT_PATH = dirname(__file__)
PYTHON_BIN_HOME = join(SCRIPT_PATH, '.local', 'bin')
MM_HOME = join(SCRIPT_PATH, 'MagicMirror')
MMPM_HOME = join(SCRIPT_PATH, '.config', 'mmpm')

# Networking
INSTANCE = os.environ.get('INSTANCE')
LOCAL_IP = os.environ.get('LOCAL_IP')
MM_PORT = os.environ.get('MM_PORT')
MMPM_PORT = os.environ.get('MMPM_PORT')

PORTS = {
    '8080': MM_PORT,
    '7890': MMPM_PORT,
}

HOSTS = {
    '127.0.0.1': LOCAL_IP,
    'localhost': LOCAL_IP,
}

print('Instance: %s' % INSTANCE)
print('%s' % yaml.dump({'Ports': {
    'Host address': LOCAL_IP,
    'MagicMirror port': int(MM_PORT),
    'MMPM port': int(MMPM_PORT),
}}))

all_files = []
for ext in ('js', 'json', 'conf', 'ini', 'txt'):
    all_files.extend(
        glob(join(MM_HOME, 'js', '**/*.%s' % ext), recursive=True))

files_to_fix = []
for file in all_files:
    if 'assets' in file:
        continue

    file_contents = None
    with open(file) as f:
        try:
            file_contents = f.read()
        except BaseException:
            file_contents = None

    if file_contents is None or len(file_contents.strip()) == 0:
        continue

    for old_value, new_value in {**HOSTS, **PORTS}.items():
        if (
            old_value == new_value or
            old_value not in file_contents or
            file == join(MM_HOME, 'config/config.js')
        ):
            continue
        files_to_fix.append(file)
        break


files_to_fix = sorted(list(set(files_to_fix)))
if len(files_to_fix) > 0:
    print('Patching %s' % yaml.dump({'files': files_to_fix}))
    for file in files_to_fix:
        for patch_type, replacements in {'port': PORTS, 'host': HOSTS}.items():
            file_contents = None
            with open(file) as f:
                file_contents = f.read()

            mutated = False
            for old_value, new_value in replacements.items():

                if (
                    (patch_type == 'host' and file.startswith(MM_HOME)) or
                    old_value not in file_contents
                ):
                    continue

                if file == join(MM_HOME, 'config', 'config.js'):
                    pattern = re.compile(
                        '(port\s*[:=]\s*)%s' % old_value, flags=re.M | re.I | re.DOTALL)
                    repl = '\\1%s' % new_value
                else:
                    pattern = re.compile(
                        old_value, flags=re.M | re.I | re.DOTALL)
                    repl = new_value
                print('- %s [%s]: %s %s → %s' % (
                    file, pattern, patch_type, old_value, new_value))
                file_contents = re.sub(
                    pattern=pattern,
                    repl=repl,
                    string=file_contents,
                )
                mutated = True

            if mutated is True:
                with open(file, 'w') as f:
                    f.write(file_contents)

MMPM_CONFIG = {
    'MMPM_MAGICMIRROR_ROOT': MM_HOME,
    'MMPM_MAGICMIRROR_URI': 'http://%s:%s' % (LOCAL_IP, MM_PORT),
    'MMPM_MAGICMIRROR_PM2_PROCESS_NAME': 'MagicMirror',
    'MMPM_MAGICMIRROR_DOCKER_COMPOSE_FILE': '',
    'MMPM_IS_DOCKER_IMAGE': False
}

print('Fixing MMPM %s' % yaml.dump({'environment': MMPM_CONFIG}))
with open(join(MMPM_HOME, 'mmpm-env.json'), 'w') as fp:
    fp.write(dumps(
        MMPM_CONFIG,
        indent=2,
        default=str,
        sort_keys=False,
        ensure_ascii=False
    ))

ECOSYSTEM_FILE = join(SCRIPT_PATH, 'ecosystem.config.js')

if not exists(ECOSYSTEM_FILE):
    ECOSYSTEM_CONFIG = {
        'apps': [
            {
                'name': 'MagicMirror',
                'cwd': MM_HOME,
                'script': 'npm',
                'args': ['run', 'server'],
                'exec_mode': 'fork',
                'watch': ['./config', './css'],
                'log_date_format': INSTANCE,
                'combine_log': True,
                'env': {
                    'MM_PORT': os.environ.get('MM_PORT')
                },
            },
            {
                'name': 'mmpm',
                'script': join(SCRIPT_PATH, 'start_process.sh'),
                'args': [],
                'exec_mode': 'fork',
                'log_date_format': INSTANCE,
                'combine_log': True,
            }
        ]
    }

    print('Generating PM2 ecosystem config: %s' % dumps(
        ECOSYSTEM_CONFIG, indent=2, default=str, sort_keys=False))
    config = re.sub('\'([^\']+)\':', r'\1:', dumps(
        ECOSYSTEM_CONFIG,
        indent=2,
        default=str,
        sort_keys=False,
        ensure_ascii=False
    ))

    with open(ECOSYSTEM_FILE, 'w') as fp:
        fp.write('module.exports = %s' % config)

MM_CONFIG = {
    'address': '0.0.0.0',
    'port': MM_PORT,
    'basePath': '/',
    'timeFormat': 12,
    'ipWhitelist': [],
    'language': 'es',
    'locale': 'es_CO',
    'logLevel': ['INFO', 'LOG', 'WARN', 'ERROR'],
    'units': 'metric',
    'serverOnly': True,
}

MODULES = [
    {'module': 'MMM-RefreshClientOnly'},
    {'module': 'mmpm'}
]

MM_CONFIG_TEMPLATE = """/**
 * MagicMirror² Test config default weather
 *
 * By fewieden https://github.com/fewieden
 * MIT Licensed.
 */
let config = %s;

/*************** DO NOT EDIT THE LINE BELOW ***************/
if (typeof module !== 'undefined') {
  module.exports = config;
}
"""


def merge(source, destination):
    for key, value in source.items():
        if isinstance(value, dict):
            # get node or create one
            node = destination.setdefault(key, {})
            merge(value, node)
        else:
            destination[key] = value

    return destination


def remove_comments(string):
    pattern = r"(\".*?\"|\'.*?\')|(/\*.*?\*/|//[^\r\n]*$)"
    # first group captures quoted strings (double or single)
    # second group captures comments (//single-line or /* multi-line */)
    regex = re.compile(pattern, re.MULTILINE | re.DOTALL)

    def _replacer(match):
        # if the 2nd group (capturing comments) is not None,
        # it means we have captured a non-quoted (real) comment string.
        if match.group(2) is not None:
            return ""  # so we will return empty to remove the comment
        else:  # otherwise, we will return the 1st group
            return match.group(1)  # captured quoted-string
    return re.sub('(\n\s*){2,}', '\n', str(regex.sub(_replacer, string)), flags=re.M | re.DOTALL)


def sortModulesByPriority(a, _):
    first_always = ['mmpm', 'MMM-RefreshClientOnly']
    if a["module"] not in first_always:
        return 0
    else:
        if a["module"] == 'mmpm':
            return -2
        if a["module"] == 'MMM-RefreshClientOnly':
            return -1
        else:
            return 0


for file in glob(join(MM_HOME, 'config/config.js')):
    print('Fixing MagicMirror config: %s' % file)
    res = jsbeautifier.beautify_file(file)
    file_contents = None
    with open(file) as f:
        file_contents = f.read()

    pattern = re.compile(
        ".*let\s+config\s*=\s*(\{.*\});?\s+\/\*{2,}\s*DO NOT EDIT THE LINE BELOW.*", flags=re.I | re.M | re.DOTALL)
    actual_config = re.sub(pattern, '\\1', file_contents)
    actual_config = remove_comments(actual_config)
    actual_config = actual_config.translate(
        str.maketrans({'"': '\\"', '\'': '"'}))
    pattern = re.compile("([\s\,])([\w_]+):", flags=re.I | re.M | re.DOTALL)
    actual_config = re.sub(
        pattern, '\\1"\\2":', actual_config)
    pattern = r'''(?<=[}\]"']),(?!\s*[{["'])'''
    actual_config = re.sub(pattern, "", actual_config, 0)
    actual_config = {**loads(actual_config), **MM_CONFIG}
    modules_in_config = actual_config.get("modules", [])
    used_modules = list(set([m['module'] for m in modules_in_config]))
    for m in [m for m in MODULES if m['module'] not in used_modules]:
        modules_in_config.append(m)

    actual_config["modules"] = modules_in_config
    pattern = re.compile(
        "['\"](\w[^\"]+)['\"]:", flags=re.I | re.M | re.DOTALL)
    new_config = re.sub(pattern, '\\1:', dumps(
        actual_config,
        indent=2,
        default=str,
        sort_keys=False,
        ensure_ascii=False
    ))

    with open(file, "w") as f:
        f.write(MM_CONFIG_TEMPLATE % new_config)
