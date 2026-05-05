(function(){
  window.HPX = window.HPX || {};
  window.HPX['particle-burst'] = function(el){
    const U = window.HPX._u;
    const k = U.canvas(el), ctx = k.ctx;
    const pal = U.palette(el);
    let parts = [];
    const spawn = () => {
      const cx = k.w/2, cy = k.h/2;
      const n = 90;
      for (let i=0;i<n;i++){
        const a = Math.random()*Math.PI*2;
        const s = U.rand(80, 260);
        parts.push({
          x: cx, y: cy,
          vx: Math.cos(a)*s, vy: Math.sin(a)*s,
          life: 1, r: U.rand(2,5),
          c: pal[(Math.random()*pal.length)|0]
        });
      }
    };
    spawn();
    let lastSpawn = 0;
    const stop = U.loop((t) => {
      ctx.clearRect(0,0,k.w,k.h);
      if (t - lastSpawn > 2.5) { spawn(); lastSpawn = t; }
      const dt = 1/60;
      parts = parts.filter(p => p.life > 0);
      for (const p of parts){
        p.vy += 220*dt;
        p.vx *= 0.985; p.vy *= 0.985;
        p.x += p.vx*dt; p.y += p.vy*dt;
        p.life -= 0.012;
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.c;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    });
    return { stop(){ stop(); k.destroy(); } };
  };
})();
