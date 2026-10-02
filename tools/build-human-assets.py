"""Convert CC0 MakeHuman graphics data to portable, textured employee GLBs.

Requires numpy and Pillow. MakeHuman program code is neither used nor bundled.
Source ZIP and graphics data are prepared by import-human-sources.cjs.
"""
import json, pathlib, zipfile, struct, io, hashlib, re
import numpy as np
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[1]
SRC = ROOT / '.cache/asset-sources/makehuman'
OUT = ROOT / 'src/renderer/assets/characters'
OUT.mkdir(parents=True, exist_ok=True)
PACK = zipfile.ZipFile(ROOT / '.cache/asset-sources/makehuman-system.zip')
RIG = json.loads((SRC / 'default.mhskel').read_text())
WEIGHTS = json.loads((SRC / 'default_weights.mhw').read_text())['weights']

def obj(text):
    vertices, uv, faces, group = [], [], [], 'body'
    for line in text.splitlines():
        p = line.split()
        if not p: continue
        if p[0] == 'v': vertices.append(list(map(float,p[1:4])))
        elif p[0] == 'vt': uv.append(list(map(float,p[1:3])))
        elif p[0] == 'g': group = p[1]
        elif p[0] == 'f':
            points = [(int(s.split('/')[0])-1,int(s.split('/')[1])-1) for s in p[1:]]
            for i in range(1,len(points)-1): faces.append((group,[points[0],points[i],points[i+1]]))
    return np.array(vertices),np.array(uv),faces

BASE,UV,FACES = obj((SRC/'base.obj').read_text())
NAMES=list(RIG['bones'])
# Order parents before children for retargeting and bind transforms.
ORDER=[]
def visit(name):
    parent=RIG['bones'][name]['parent']
    if parent and parent not in ORDER: visit(parent)
    if name not in ORDER: ORDER.append(name)
for name in NAMES: visit(name)
BI={name:i for i,name in enumerate(ORDER)}
BW=np.zeros((len(BASE),len(ORDER)),dtype=np.float32)
for name,pairs in WEIGHTS.items():
    for vertex,weight in pairs: BW[vertex,BI[name]]=weight
# Clothing helper vertices have no source skin weights. Transfer the nearest
# weighted body vertex before using the garment's authored barycentric mapping.
valid=np.where(BW.sum(axis=1)>0)[0]; missing=np.where(BW.sum(axis=1)==0)[0]
for i in range(0,len(missing),64):
    chunk=missing[i:i+64]; distance=((BASE[chunk,None,:]-BASE[valid][None,:,:])**2).sum(axis=2)
    BW[chunk]=BW[valid[np.argmin(distance,axis=1)]]
BW/=BW.sum(axis=1,keepdims=True)

def target(name):
    out=np.zeros_like(BASE); rows=[line for line in (SRC/name).read_text().splitlines() if line.strip() and not line.startswith('#')]
    if not rows: return out
    values=np.loadtxt(io.StringIO('\n'.join(rows)),ndmin=2)
    out[values[:,0].astype(int)]=values[:,1:]; return out

def fitted(name,body):
    raw=PACK.read(name+'.mhclo').decode('utf-8',errors='replace')
    reference,_,faces=obj(PACK.read(name+'.obj').decode('utf-8',errors='replace'))
    lines=raw.splitlines(); mapping=[]; deleting=set(); section=None
    scale=np.ones(3)
    for line in lines:
        p=line.split()
        if not p or p[0].startswith('#'): continue
        if p[0] in ['x_scale','y_scale','z_scale']:
            axis='xyz'.index(p[0][0]); scale[axis]=abs(body[int(p[1]),axis]-body[int(p[2]),axis])/float(p[3])
        elif p[0]=='verts': section='verts'
        elif p[0]=='delete_verts': section='delete'
        elif section=='verts' and p[0].lstrip('-').isdigit():
            if len(p)==1: mapping.append(([int(p[0])],[1.],np.zeros(3)))
            elif len(p)>=9: mapping.append((list(map(int,p[:3])),list(map(float,p[3:6])),np.array(list(map(float,p[6:9])))))
        elif section=='delete':
            i=0
            while i<len(p):
                if i+2<len(p) and p[i+1]=='-': deleting.update(range(int(p[i]),int(p[i+2])+1));i+=3
                else: deleting.add(int(p[i]));i+=1
    if len(mapping)!=len(reference): raise ValueError('Invalid garment map '+name)
    positions=np.array([(body[ids]*np.array(weights)[:,None]).sum(axis=0)+offset*scale for ids,weights,offset in mapping])
    weights=np.array([(BW[ids]*np.array(w)[:,None]).sum(axis=0) for ids,w,_ in mapping])
    weights=np.maximum(weights,0);weights/=weights.sum(axis=1,keepdims=True)
    return positions,obj(PACK.read(name+'.obj').decode('utf-8',errors='replace'))[1],faces,weights,deleting

def write_character(sex):
    body=BASE+target('caucasian-'+sex+'-young.target')+target('universal-'+sex+'-young-averagemuscle-averageweight.target')
    min_y=body[:13380,1].min(); height=body[:13380,1].max()-min_y; factor=1.75/height
    def normalize(points): out=points.copy();out[:,1]-=min_y;return out*factor
    heads={name:normalize(body[RIG['joints'][bone['head']]].mean(axis=0)[None,:])[0] for name,bone in RIG['bones'].items()}
    tails={name:normalize(body[RIG['joints'][bone['tail']]].mean(axis=0)[None,:])[0] for name,bone in RIG['bones'].items()}
    doc={'asset':{'version':'2.0','generator':'Deskly CC0 character build'},'scene':0,'scenes':[{'nodes':[]}], 'nodes':[], 'meshes':[], 'materials':[], 'textures':[], 'images':[], 'samplers':[{'magFilter':9729,'minFilter':9987,'wrapS':10497,'wrapT':10497}], 'bufferViews':[], 'accessors':[], 'skins':[]}
    blocks=[];length=0
    def block(bytes):
        nonlocal length
        pad=(-len(bytes))%4; index=len(doc['bufferViews']);doc['bufferViews'].append({'buffer':0,'byteOffset':length,'byteLength':len(bytes)});blocks.append(bytes+b'\0'*pad);length+=len(bytes)+pad;return index
    def accessor(data,type,component,bounds=False):
        data=np.asarray(data);a={'bufferView':block(data.tobytes()),'componentType':component,'count':len(data),'type':type}
        if bounds:a.update(min=data.min(axis=0).tolist(),max=data.max(axis=0).tolist())
        doc['accessors'].append(a);return len(doc['accessors'])-1
    def texture(filename):
        image=Image.open(io.BytesIO(PACK.read(filename)));image.thumbnail((2048,2048),Image.Resampling.LANCZOS)
        if filename.startswith(('hair/','eyebrows/')):
            # Neutralize the source dye while retaining strand detail and alpha.
            rgba=image.convert('RGBA');gray=rgba.convert('L');values=np.asarray(gray,dtype=np.float32)
            values=np.clip(np.power(values/255,.6)*200+25,0,255).astype(np.uint8)
            neutral=Image.fromarray(values);image=Image.merge('RGBA',(neutral,neutral,neutral,rgba.getchannel('A')))
        output=io.BytesIO();image.save(output,format='PNG');doc['images'].append({'bufferView':block(output.getvalue()),'mimeType':'image/png'});doc['textures'].append({'sampler':0,'source':len(doc['images'])-1});return {'index':len(doc['textures'])-1}
    def material(name,diffuse,normal=None,roughness=.7,alpha=False):
        m={'name':name,'pbrMetallicRoughness':{'baseColorTexture':texture(diffuse),'metallicFactor':0,'roughnessFactor':roughness},'doubleSided':alpha}
        if normal:m['normalTexture']=dict(texture(normal),scale=.4)
        if alpha:m.update(alphaMode='MASK',alphaCutoff=.28)
        doc['materials'].append(m);return len(doc['materials'])-1
    skin=material('Skin','skins/young_caucasian_'+sex+'/young_lightskinned_'+sex+'_diffuse.png',roughness=.6)
    material('Skin_Medium','skins/young_asian_'+sex+'/young_lightskinned_'+sex+'_diffuse3.png',roughness=.6)
    material('Skin_Deep','skins/young_african_'+sex+'/young_darkskinned_'+sex+'_diffuse.png',roughness=.6)
    outfit_id='female_elegantsuit01' if sex=='female' else 'male_casualsuit01'
    outfit_name='clothes/'+outfit_id+'/'+outfit_id
    cloth=fitted(outfit_name,body)
    shoe_name='clothes/shoes03/shoes03';shoe_fit=fitted(shoe_name,body)
    outfit=material('Outfit',outfit_name+'_diffuse.png',outfit_name+'_normal.png',.84)
    hair_names=['hair/short01/short01','hair/bob01/bob01','hair/ponytail01/ponytail01']
    hair_materials=[material('Hair_'+str(i),n+'_diffuse.png',roughness=.72,alpha=True) for i,n in enumerate(hair_names)]
    eye=material('Eyes','eyes/materials/brown_eye.png',roughness=.22,alpha=True)
    brows=material('Brows','eyebrows/eyebrow001/eyebrow001.png',roughness=.8,alpha=True)
    shoe_material=material('Shoes',shoe_name+'_diffuse.png',roughness=.65)
    face_masks={}
    neck=heads['neck01'][1]/factor+min_y
    for name,ancestry in [('Face_A','african'),('Face_B','asian')]:
        delta=(target(ancestry+'-'+sex+'-young.target')-target('caucasian-'+sex+'-young.target'))*factor
        # Source identity targets also change stature. Facial customization
        # must remain anchored to this character's existing head skeleton.
        head_anchor=RIG['joints'][RIG['bones']['head']['head']]
        delta-=delta[head_anchor].mean(axis=0)
        blend=np.clip((body[:,1]-neck)/.75,0,1);blend=blend*blend*(3-2*blend)
        delta*=blend[:,None];face_masks[name]=delta
    # Authored geometry is stored in UV-split indexed form. Source weight indices
    # follow the mesh vertices; splitting UV seams preserves their weights.
    def mesh(name,positions,uv,faces,weights,mat,hidden=set(),body_only=False,morph=False,head_only=False,shape_data=None):
        vertices=[];tex=[];source_ids=[];indices=[];table={}
        for group,triangle in faces:
            if body_only and group!='body':continue
            if any(v in hidden for v,t in triangle):continue
            for v,t in triangle:
                key=(v,t)
                if key not in table:table[key]=len(vertices);vertices.append(positions[v]);tex.append(uv[t]);source_ids.append(v)
                indices.append(table[key])
        p=np.array(vertices,dtype=np.float32);tri=np.array(indices,dtype=np.uint32).reshape(-1,3)
        texture_uv=np.array(tex,dtype=np.float32)
        w=weights[source_ids]
        shapes=[d[source_ids].copy() for d in (shape_data or face_masks).values()] if morph else []
        if name=='Body':
            # Curved edge refinement only on the face. Preserve the authored
            # vertices, UV seams, rig weights, and the rest of the body budget.
            source_n=np.zeros_like(positions)
            cross=np.cross(p[tri[:,1]]-p[tri[:,0]],p[tri[:,2]]-p[tri[:,0]])
            for j in range(3):np.add.at(source_n,np.array(source_ids)[tri[:,j]],cross)
            source_n/=np.maximum(np.linalg.norm(source_n,axis=1,keepdims=True),1e-8)
            n=source_n[source_ids]
            points=list(p);coords=list(texture_uv);skin_weights=list(w)
            shape_points=[list(d) for d in shapes];edges={};refined=[]
            threshold=heads['neck01'][1]+.04
            def midpoint(a,b):
                if min(p[a,1],p[b,1])<threshold:return None
                key=tuple(sorted((int(a),int(b))))
                if key in edges:return edges[key]
                middle=(p[a]+p[b])*.5
                curved=middle-.5*(np.dot(middle-p[a],n[a])*n[a]+np.dot(middle-p[b],n[b])*n[b])
                correction=curved-middle;distance=np.linalg.norm(correction)
                # Long edges near the mouth or throat must not bulge or
                # bridge facial cavities while rounding the silhouette.
                curved=middle+correction*min(1,.001/max(distance,1e-8))
                index=len(points);edges[key]=index;points.append(curved);coords.append((texture_uv[a]+texture_uv[b])*.5);skin_weights.append((w[a]+w[b])*.5)
                for i,d in enumerate(shapes):shape_points[i].append((d[a]+d[b])*.5)
                return index
            for a,b,c in tri:
                ab,bc,ca=midpoint(a,b),midpoint(b,c),midpoint(c,a)
                count=sum(e is not None for e in [ab,bc,ca])
                if count==3:refined.extend([(a,ab,ca),(ab,b,bc),(ca,bc,c),(ab,bc,ca)])
                elif count==0:refined.append((a,b,c))
                elif count==1:
                    if ab is not None:refined.extend([(a,ab,c),(ab,b,c)])
                    elif bc is not None:refined.extend([(b,bc,a),(bc,c,a)])
                    else:refined.extend([(c,ca,b),(ca,a,b)])
                elif ab is None:refined.extend([(c,ca,bc),(ca,a,b),(ca,b,bc)])
                elif bc is None:refined.extend([(a,ab,ca),(ab,b,c),(ab,c,ca)])
                else:refined.extend([(b,bc,ab),(bc,c,a),(bc,a,ab)])
            p=np.array(points,dtype=np.float32);texture_uv=np.array(coords,dtype=np.float32);w=np.array(skin_weights)
            shapes=[np.array(d,dtype=np.float32) for d in shape_points];tri=np.array(refined,dtype=np.uint32);indices=tri.reshape(-1)
            # Shared positions receive shared normals even across UV seams.
            _,ids=np.unique(np.round(p,7),axis=0,return_inverse=True)
        else:ids=np.array(source_ids)
        source_normals=np.zeros((int(ids.max())+1,3));face_normals=np.cross(p[tri[:,1]]-p[tri[:,0]],p[tri[:,2]]-p[tri[:,0]])
        for j in range(3):np.add.at(source_normals,ids[tri[:,j]],face_normals)
        normals=source_normals[ids].astype(np.float32)
        normals/=np.maximum(np.linalg.norm(normals,axis=1,keepdims=True),1e-8)
        if head_only:w=np.zeros_like(w);w[:,BI['head']]=1
        joints=np.argsort(w,axis=1)[:,-4:][:,::-1].astype(np.uint16); selected=np.take_along_axis(w,joints,axis=1).astype(np.float32);selected/=selected.sum(axis=1,keepdims=True)
        texture_uv[:,1]=1-texture_uv[:,1]
        attr={'POSITION':accessor(p,'VEC3',5126,True),'NORMAL':accessor(normals,'VEC3',5126),'TEXCOORD_0':accessor(texture_uv,'VEC2',5126),'JOINTS_0':accessor(joints,'VEC4',5123),'WEIGHTS_0':accessor(selected,'VEC4',5126)}
        primitive={'attributes':attr,'indices':accessor(np.array(indices,dtype=np.uint32),'SCALAR',5125),'material':mat}
        m={'name':name,'primitives':[primitive]}
        if morph:
            primitive['targets']=[]
            for d in shapes:
                moved=p+d;cross=np.cross(moved[tri[:,1]]-moved[tri[:,0]],moved[tri[:,2]]-moved[tri[:,0]])
                accum=np.zeros_like(source_normals)
                for j in range(3):np.add.at(accum,ids[tri[:,j]],cross)
                moved_n=accum[ids];moved_n/=np.maximum(np.linalg.norm(moved_n,axis=1,keepdims=True),1e-8)
                primitive['targets'].append({'POSITION':accessor(d.astype(np.float32),'VEC3',5126,True),'NORMAL':accessor((moved_n-normals).astype(np.float32),'VEC3',5126)})
            m['weights']=[0,0];m['extras']={'targetNames':list(face_masks)}
        doc['meshes'].append(m);index=len(doc['nodes']);doc['nodes'].append({'name':name,'mesh':len(doc['meshes'])-1,'skin':0});doc['scenes'][0]['nodes'].append(index)
        print(sex,name,len(indices)//3,'triangles')
    # Bones use identity world orientation. Retargeting works in world space and
    # converts desired authored rest-direction rotations into each parent frame.
    for name in ORDER:
        bone=RIG['bones'][name];parent=bone['parent'];position=heads[name]-(heads[parent] if parent else 0)
        doc['nodes'].append({'name':name,'translation':position.tolist(),'extras':{'restHead':heads[name].tolist(),'restTail':tails[name].tolist()}})
        if parent:doc['nodes'][BI[parent]].setdefault('children',[]).append(BI[name])
        else:doc['scenes'][0]['nodes'].append(BI[name])
    inverse=np.tile(np.eye(4,dtype=np.float32),(len(ORDER),1,1));inverse[:,:3,3]=-np.array([heads[n] for n in ORDER])
    doc['skins'].append({'joints':list(range(len(ORDER))),'skeleton':BI['root'],'inverseBindMatrices':accessor(inverse.transpose(0,2,1).reshape(-1,16),'MAT4',5126)})
    mesh('Body',normalize(body),UV,FACES,BW,skin,cloth[4]|shoe_fit[4],True,True)
    mesh('Clothes',normalize(cloth[0]),cloth[1],cloth[2],cloth[3],outfit)
    mesh('Shoes',normalize(shoe_fit[0]),shoe_fit[1],shoe_fit[2],shoe_fit[3],shoe_material)
    def fitted_shapes(name,base_fit):return {key:(fitted(name,body+delta/factor)[0]-base_fit[0])*factor for key,delta in face_masks.items()}
    for i,name in enumerate(hair_names):
        fitted_hair=fitted(name,body);mesh('Hair_'+str(i),normalize(fitted_hair[0]),fitted_hair[1],fitted_hair[2],fitted_hair[3],hair_materials[i],head_only=True,morph=True,shape_data=fitted_shapes(name,fitted_hair))
    eyes=fitted('eyes/high-poly/high-poly',body);mesh('Eyeballs',normalize(eyes[0]),eyes[1],eyes[2],eyes[3],eye,head_only=True,morph=True,shape_data=fitted_shapes('eyes/high-poly/high-poly',eyes))
    brow_name='eyebrows/eyebrow001/eyebrow001';brow_fit=fitted(brow_name,body);mesh('Eyebrows',normalize(brow_fit[0]),brow_fit[1],brow_fit[2],brow_fit[3],brows,head_only=True,morph=True,shape_data=fitted_shapes(brow_name,brow_fit))
    data=b''.join(blocks);doc['buffers']=[{'byteLength':len(data)}]
    raw=json.dumps(doc,separators=(',',':')).encode();raw+=b' '*((-len(raw))%4)
    glb=struct.pack('<III',0x46546c67,2,12+8+len(raw)+8+len(data))+struct.pack('<II',len(raw),0x4e4f534a)+raw+struct.pack('<II',len(data),0x004e4942)+data
    filename='employee-'+sex+'.glb';(OUT/filename).write_bytes(glb)
    return {'id':'employee-'+sex,'label':'Detailed '+('broad' if sex=='male' else 'narrow')+' build','body':sex,'path':'assets/characters/'+filename,'driver':'deskly','rightHand':'wrist.R','skinMaterials':['Skin','Skin_Medium','Skin_Deep'],'referenceSeatHeight':.5,'sha256':hashlib.sha256(glb).hexdigest()}

if __name__=='__main__':
    models=[write_character(sex) for sex in ['male','female']]
    (OUT/'manifest.json').write_text(json.dumps({'version':1,'models':models},indent=2)+'\n')
    (OUT/'LICENSE-MakeHuman.txt').write_text((SRC/'LICENSE.md').read_text())
    (OUT/'sources.json').write_text(json.dumps({'license':'CC0-1.0','graphicsSource':'https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html','pack':'https://files.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip','packSha256':hashlib.sha256((ROOT/'.cache/asset-sources/makehuman-system.zip').read_bytes()).hexdigest(),'core':json.loads((SRC/'sources.json').read_text())},indent=2)+'\n')
