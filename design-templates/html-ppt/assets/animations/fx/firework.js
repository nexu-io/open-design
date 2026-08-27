(function(){
  window.HPX = window.HPX || {};
  window.HPX['firework'] = function(el){
    const U = window.HPX._u;
    const k = U.canvas(el), ctx = k.ctx;
    const pal = U.palette(el);
    let rockets = [], sparks = [];
    const launch = () => {
      rockets.push({
        x: U.rand(k.w*0.2, k.w*0.8), y: k.h+10,
        vx: U.rand(-30,30), vy: U.rand(-520,-380),
        tgtY: U.rand(k.h*0.15, k.h*0.45),
        c: pal[(Math.random()*pal.length)|0]
      });
    };
    const burst = (x, y, c) => {
      const n = 70;
      for (let i=0;i<n;i++){
        const a = Math.random()*Math.PI*2;
        const s = U.rand(60, 240);
        sparks.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:1,c});
      }
    };
    let last = -1;
    const stop = U.loop((t) => {
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(0,0,k.w,k.h);
      if (t - last > 0.7) { launch(); last = t; }
      const dt = 1/60;
      rockets = rockets.filter(r => {
        r.x += r.vx*dt; r.y += r.vy*dt; r.vy += 260*dt;
        ctx.fillStyle = r.c;
        ctx.beginPath(); ctx.arc(r.x, r.y, 2.5, 0, Math.PI*2); ctx.fill();
        if (r.y <= r.tgtY || r.vy >= 0) { burst(r.x, r.y, r.c); return false; }
        return true;
      });
      sparks = sparks.filter(p => p.life > 0);
      for (const p of sparks){
        p.vy += 90*dt;
        p.vx *= 0.98; p.vy *= 0.98;
        p.x += p.vx*dt; p.y += p.vy*dt;
        p.life -= 0.012;
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.c;
        ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI*2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    });
    return { stop(){ stop(); k.destroy(); } };
  };
})();
