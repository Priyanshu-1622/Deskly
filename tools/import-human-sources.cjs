// Source graphics data only: MakeHuman code is not bundled or executed.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const base='https://raw.githubusercontent.com/makehumancommunity/makehuman/master/';
async function main(){
  const root=path.resolve('.cache/asset-sources/makehuman');await fs.mkdir(root,{recursive:true});
  const names=['LICENSE.md','makehuman/data/3dobjs/base.obj','makehuman/data/rigs/default.mhskel','makehuman/data/rigs/default_weights.mhw'];
  for(const sex of ['male','female'])for(const ancestry of ['caucasian','african','asian'])names.push('makehuman/data/targets/macrodetails/'+ancestry+'-'+sex+'-young.target');
  for(const sex of ['male','female'])names.push('makehuman/data/targets/macrodetails/universal-'+sex+'-young-averagemuscle-averageweight.target');
  const records=[];
  for(const name of names){const r=await fetch(base+name);if(!r.ok)throw Error(name+': '+r.status);const bytes=Buffer.from(await r.arrayBuffer());const file=path.join(root,path.basename(name));await fs.writeFile(file,bytes);records.push({file:path.basename(name),source:base+name,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});}
  await fs.writeFile(path.join(root,'sources.json'),JSON.stringify(records,null,2));console.log('Imported MakeHuman mesh, rig and shape data');
}
main().catch(e=>{console.error(e);process.exitCode=1});
