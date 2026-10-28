// Install, open or remove CleanFrame on a TV added with ares-setup-device. Each run is a device action.
//   npm run tv:install | tv:launch | tv:remove      (device name: CLEANFRAME_TV, default "tv")
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const info = JSON.parse(readFileSync(root + 'app/appinfo.json', 'utf8'));
const device = process.env.CLEANFRAME_TV || 'tv';
const ipk = root + 'dist/' + info.id + '_' + info.version + '_all.ipk';
const actions = {
  install: ['ares-install', ['--device', device, ipk]],
  launch: ['ares-launch', ['--device', device, info.id]],
  remove: ['ares-install', ['--device', device, '--remove', info.id]]
};
const action = actions[process.argv[2]];
if (!action) { console.error('Usage: node scripts/tv.mjs install|launch|remove'); process.exit(2); }
if (process.argv[2] === 'install' && !existsSync(ipk)) { console.error('Build the package first: npm run package'); process.exit(1); }
// The CLI's own scripts run the same way on Windows, macOS and Linux.
const cli = root + 'node_modules/@webos-tools/cli/bin/' + action[0] + '.js';
if (!existsSync(cli)) { console.error("Run npm ci first: LG's webOS CLI is a development dependency."); process.exit(1); }
console.log('TV "' + device + '": ' + action[0] + ' ' + action[1].slice(2).join(' '));
const result = spawnSync(process.execPath, [cli].concat(action[1]), { stdio: 'inherit' });
process.exit(result.status === null ? 1 : result.status);
