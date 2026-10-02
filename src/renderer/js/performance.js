/* Sustained frame timing adjusts rendering scale without replacing assets. */
(() => {
  class PerformanceBudget {
    constructor(renderer){this.renderer=renderer;this.scale=1;this.base=1;this.quality='balanced';this.auto=true;this.samples=[];this.elapsed=0;this.cooldown=0;this.fps=60;this.shadowT=0;}
    configure(quality,auto=true){this.quality=quality;this.auto=auto;this.base=quality==='ultra'?Math.min(devicePixelRatio,2):quality==='high'?Math.min(devicePixelRatio,1.5):quality==='low'?.75:Math.min(devicePixelRatio,1.25);this.scale=1;this.samples=[];this.cooldown=4;this.renderer.setPixelRatio(this.base);}
    update(dt,active=true){if(!active||dt<=0){this.samples=[];this.elapsed=0;return;}dt=Math.min(dt,.25);this.samples.push(dt);this.elapsed+=dt;this.cooldown=Math.max(0,this.cooldown-dt);if(this.elapsed<2)return;const avg=this.elapsed/this.samples.length;this.fps=Math.round(1/avg);this.samples=[];this.elapsed=0;if(!this.auto||this.cooldown>0)return;let next=this.scale;if(avg>1/48)next=Math.max(.65,this.scale-.08);else if(avg<1/58)next=Math.min(1,this.scale+.04);if(next!==this.scale){this.scale=next;this.renderer.setPixelRatio(this.base*this.scale);this.cooldown=4;}}
    shadow(dt,active){this.shadowT-=dt;if(this.shadowT<=0){this.renderer.shadowMap.needsUpdate=active;this.shadowT=.1;}}
  }
  window.DesklyPerformance=PerformanceBudget;
})();
