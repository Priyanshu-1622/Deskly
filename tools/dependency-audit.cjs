const {spawnSync}=require('node:child_process');
if(!process.env.npm_execpath)throw Error('Run this check through npm run audit:deps.');
const env={...process.env};
// npm 11 forwards a global allow-scripts list into npm-run children, where
// audit rejects it as project-scoped. Audit is read-only and scripts are off.
for(const key of Object.keys(env))if(key.toLowerCase()==='npm_config_allow_scripts')delete env[key];
const result=spawnSync(process.execPath,[process.env.npm_execpath,'audit','--audit-level=moderate','--ignore-scripts'],{env,stdio:'inherit'});
if(result.error)throw result.error;
process.exitCode=result.status??1;
