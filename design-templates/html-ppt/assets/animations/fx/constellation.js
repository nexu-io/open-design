(function(){
  window.HPX = window.HPX || {};
  window.HPX['constellation'] = function(el){
    const U = window.HPX._u;
    const k = U.canvas(el), ctx = k.ctx;
    const ac = U.accent(el,'#9fb4ff');
    const N = 70;
    let pts = [];
    const seed = () => {
      pts = Array.from({length:N}, () => ({
        x: Math.random()*k.w, y: Math.random()*k.h,
        vx: U.rand(-0.3,0.3), vy: U.rand(-0.3,0.3)
      }));
    };
    seed();
    let lw=k.w, lh=k.h;
    const stop = U.loop(() => {
      if (k.w!==lw||k.h!==lh){ seed(); lw=k.w; lh=k.h; }
      ctx.clearRect(0,0,k.w,k.h);
      for (const p of pts){
        p.x += p.vx; p.y += p.vy;
        if (p.x<0||p.x>k.w) p.vx*=-1;
        if (p.y<0||p.y>k.h) p.vy*=-1;
      }
      for (let i=0;i<N;i++){
        for (let j=i+1;j<N;j++){
          const a=pts[i], b=pts[j];
          const d = Math.hypot(a.x-b.x, a.y-b.y);
          if (d < 150){
            ctx.globalAlpha = 1 - d/150;
            ctx.strokeStyle = ac; ctx.lineWidth=1;
            ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = ac;
      for (const p of pts){
        ctx.beginPath(); ctx.arc(p.x,p.y,1.8,0,Math.PI*2); ctx.fill();
      }
    });
    return { stop(){ stop(); k.destroy(); } };
  };
})();
