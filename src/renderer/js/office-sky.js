/* A camera-centred atmospheric sky. The cloud map is a deterministic texture,
   while sun, moon, haze, colour, and light direction follow the office clock. */
(function () {
  function cloudTexture(T) {
    const W = 512, H = 256, data = new Uint8Array(W * H * 4);
    const random = (x, y) => {
      let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + 1442695041;
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
    };
    const noise = (x, y, frequency) => {
      const xx = x * frequency, yy = y * frequency;
      const ix = Math.floor(xx), iy = Math.floor(yy);
      const fx = xx - ix, fy = yy - iy;
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const a = random(ix % frequency, iy % frequency), b = random((ix + 1) % frequency, iy % frequency);
      const c = random(ix % frequency, (iy + 1) % frequency), d = random((ix + 1) % frequency, (iy + 1) % frequency);
      return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
    };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const u = x / W, v = y / H;
      const broad = noise(u, v, 5) * 0.48 + noise(u, v, 11) * 0.28 + noise(u, v, 23) * 0.15 + noise(u, v, 47) * 0.09;
      const density = Math.max(0, Math.min(1, (broad - 0.43) * 5.5));
      const i = (y * W + x) * 4, value = Math.round(density * 255);
      data[i] = data[i + 1] = data[i + 2] = value; data[i + 3] = 255;
    }
    const tex = new T.DataTexture(data, W, H, T.RGBAFormat);
    tex.wrapS = tex.wrapT = T.RepeatWrapping;
    tex.magFilter = T.LinearFilter; tex.minFilter = T.LinearMipmapLinearFilter;
    tex.generateMipmaps = true; tex.needsUpdate = true;
    return tex;
  }
  function create(T) {
    const uniforms = {
      cloudMap: { value: cloudTexture(T) },
      sunDir: { value: new T.Vector3(0, 1, 0) },
      moonDir: { value: new T.Vector3(0, -1, 0) },
      daylight: { value: 1 }, twilight: { value: 0 },
      moonPhase: { value: 0.5 }, drift: { value: 0 }
    };
    const material = new T.ShaderMaterial({ uniforms, side: T.BackSide, depthWrite: false, fog: false,
      vertexShader: `varying vec3 skyDirection; varying vec2 skyUv;
        void main(){ skyDirection=normalize(position); skyUv=uv;
          gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `precision highp float;
        uniform sampler2D cloudMap; uniform vec3 sunDir, moonDir;
        uniform float daylight, twilight, moonPhase, drift;
        varying vec3 skyDirection; varying vec2 skyUv;
        float smooth01(float a,float b,float x){return smoothstep(a,b,x);}
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        void main(){
          vec3 d=normalize(skyDirection);
          float height=clamp(d.y,0.0,1.0);
          float zenith=smooth01(0.0,0.77,height);
          vec3 night=mix(vec3(0.065,0.105,0.19),vec3(0.005,0.018,0.055),zenith);
          vec3 day=mix(vec3(0.64,0.79,0.89),vec3(0.105,0.37,0.69),zenith);
          vec3 sky=mix(night,day,daylight);
          float towardSun=max(dot(normalize(vec3(d.x,max(d.y,0.0),d.z)),normalize(vec3(sunDir.x,max(sunDir.y,0.01),sunDir.z))),0.0);
          float warm=twilight*pow(towardSun,5.0)*pow(1.0-height,1.8);
          sky=mix(sky,vec3(1.0,0.35,0.14),clamp(warm*0.88,0.0,0.82));
          sky+=vec3(0.78,0.42,0.21)*twilight*pow(towardSun,22.0)*0.36;
          float horizon=smooth01(-0.16,0.025,d.y);
          sky=mix(vec3(0.15,0.18,0.21),sky,horizon);
          vec2 cuv=vec2(skyUv.x*2.0+drift,skyUv.y*1.3);
          float cloud=texture2D(cloudMap,cuv).r;
          float fine=texture2D(cloudMap,cuv*2.0+vec2(0.16,0.23)).r;
          float body=smooth01(0.20,0.76,cloud*0.82+fine*0.18);
          float cloudCover=body*smooth01(0.01,0.17,d.y)*0.76;
          vec3 cloudLight=mix(vec3(0.14,0.18,0.25),vec3(0.96,0.97,0.95),daylight);
          cloudLight=mix(cloudLight,vec3(1.0,0.56,0.37),twilight*pow(towardSun,2.0)*0.72);
          sky=mix(sky,cloudLight,cloudCover);
          float sd=dot(d,normalize(sunDir));
          float sunVisible=smooth01(-0.045,0.005,sunDir.y);
          float sunGlow=pow(max(sd,0.0),160.0)*sunVisible;
          float sunDisc=smooth01(0.99966,0.99978,sd)*sunVisible;
          sky+=vec3(1.0,0.69,0.36)*sunGlow*0.48*(1.0-cloudCover*0.45);
          sky=mix(sky,vec3(1.0,0.93,0.73),sunDisc*(1.0-cloudCover*0.66));
          float md=dot(d,normalize(moonDir));
          float moonVisible=smooth01(-0.04,0.03,moonDir.y)*(1.0-daylight);
          float moonDisc=smooth01(0.99952,0.99969,md)*moonVisible;
          vec3 moonRight=normalize(cross(normalize(moonDir),vec3(0.0,1.0,0.001)));
          vec3 moonUp=normalize(cross(moonRight,normalize(moonDir)));
          float mx=dot(d,moonRight)/0.031;
          float my=dot(d,moonUp)/0.031;
          float waxing=moonPhase<0.5?1.0:-1.0;
          float terminator=cos(6.283185*moonPhase)*sqrt(max(0.0,1.0-my*my));
          float lit=smooth01(-0.08,0.08,mx*waxing-terminator);
          float crater=texture2D(cloudMap,skyUv*vec2(9.0,5.0)).r;
          float lunarLight=0.12+0.88*lit;
          sky+=vec3(0.17,0.23,0.36)*pow(max(md,0.0),85.0)*moonVisible*0.22;
          sky=mix(sky,vec3(0.70,0.77,0.84)*(0.75+0.25*crater),moonDisc*lunarLight*(1.0-cloudCover*0.55));
          vec2 starCell=floor(skyUv*vec2(620.0,290.0));
          vec2 starUv=fract(skyUv*vec2(620.0,290.0))-0.5;
          float star=step(0.99835,hash(starCell))*pow(hash(starCell+13.7),2.0)*(1.0-smooth01(0.04,0.20,length(starUv)));
          sky+=vec3(0.50,0.64,0.81)*star*(1.0-daylight)*smooth01(0.07,0.30,d.y)*(1.0-cloudCover);
          gl_FragColor=vec4(sky,1.0);
        }` });
    const mesh = new T.Mesh(new T.SphereGeometry(110, 64, 40), material);
    mesh.frustumCulled = false; mesh.renderOrder = -1000;
    return { mesh, uniforms };
  }
  window.DesklyOfficeSky = { create };
})();
