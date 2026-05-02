(function(){
  window.HPX = window.HPX || {};
  window.HPX['galaxy-swirl'] = function(el){
    const U = window.HPX._u;
    const k = U.canvas(el), ctx = k.ctx;
    const pal = U.palette(el);
    const N = 800;
    const parts = Array.from({length:N}, (_,i) => {
      const arm = i%3;
      const t = Math.random();
      const r = t*180 + 8;
      const base = (arm/3)*Math.PI*2;
      return { r, a: base + Math.log(r+1)*1.6 + U.rand(-0.2,0.2),
               c: pal[arm%pal.length],
               s: U.rand(0.8, 2.2) };
    });
    const stop = U.loop((t) => {
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.fillRect(0,0,k.w,k.h);
      const cx=k.w/2, cy=k.h/2;
      for (const p of parts){
        const a = p.a + t*0.15;
        const x = cx + Math.cos(a)*p.r;
        const y = cy + Math.sin(a)*p.r*0.7;
        ctx.fillStyle = p.c;
        ctx.globalAlpha = 0.7;
        ctx.beginPath(); ctx.arc(x,y,p.s,0,Math.PI*2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    });
    return { stop(){ stop(); k.destroy(); } };
  };
})();
