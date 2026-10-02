// Source-only release hygiene. This never builds or starts an installer.
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const tracked=execFileSync('git',['-c',`safe.directory=${root.replace(/\\/g,'/')}`,'ls-files','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
const errors=[];
for(const name of tracked){
  if(/^(dist|out|release|node_modules|\.cache|docs\/visual-checks)\//.test(name)||/\.(exe|msi|dmg|AppImage|asar|log|bak|tmp|pyc|pem|p12|pfx)$/i.test(name)||/\.corrupt-/.test(name))errors.push('Generated/private artifact tracked: '+name);
  if(/(^|\/)(\.env(?:\..+)?|deskly-(config|secrets)\.json|team-context\.json|group-conversations\.json|tasks\.json|audit\.jsonl)$/.test(name)&&!name.endsWith('.env.example'))errors.push('Local private data tracked: '+name);
  if(!fs.existsSync(path.join(root,name))){errors.push('Tracked file missing: '+name);continue;}
  if(fs.statSync(path.join(root,name)).size>=100*1024*1024)errors.push('File exceeds GitHub size limit: '+name);
  if(name.endsWith('.md')){
    const text=fs.readFileSync(path.join(root,name),'utf8');
    const links=[...text.matchAll(/(?:src|href)="([^"]+)"|\]\(([^\s)]+)\)/g)].map(m=>m[1]||m[2]);
    for(const target of links){if(/^(https?:|#|mailto:)/.test(target))continue;const local=decodeURIComponent(target.split('#')[0]);if(local&&!fs.existsSync(path.resolve(root,path.dirname(name),local)))errors.push('Broken documentation link in '+name+': '+target);}
  }
}
for(const name of ['LICENSE','THIRD_PARTY_NOTICES.md','src/renderer/vendor/LICENSE-three.txt','src/renderer/assets/characters/LICENSE-MakeHuman.txt','src/renderer/fonts/big-shoulders-display-LICENSE.txt','src/renderer/fonts/public-sans-LICENSE.txt','src/renderer/fonts/jetbrains-mono-LICENSE.txt'])if(!fs.existsSync(path.join(root,name)))errors.push('Required license missing: '+name);
if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}else console.log(`Repository hygiene passed: ${tracked.length} tracked files; no app packages, private data, oversized files or broken documentation links.`);
