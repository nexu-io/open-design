(function(){
  window.HPX = window.HPX || {};
  window.HPX['shockwave'] = function(el){
    const U = window.HPX._u;
    const k = U.canvas(el), ctx = k.ctx;
    const ac = U.accent(el,'#7c5cff'), ac2 = U.accent2(el,'#22d3ee');
    let waves = [];
    let last = -1;
    const stop = U.loop((t) => {
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(0,0,k.w,k.h);
      if (t - last > 0.6){ last = t; waves.push({t:0}); }
      const cx=k.w/2, cy=k.h/2;
      const max = Math.hypot(k.w,k.h)/2;
      waves = waves.filter(w => w.t < 1);
      for (const w of waves){
        w.t += 0.012;
        const r = w.t * max;
        const alpha = 1 - w.t;
        ctx.strokeStyle = w.t<0.5?ac2:ac;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = 3 + (1-w.t)*3;
        ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.stroke();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.globalAlpha = alpha*0.4;
        ctx.beginPath(); ctx.arc(cx,cy,r*0.92,0,Math.PI*2); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // core
      const g = ctx.createRadialGradient(cx,cy,0,cx,cy,40);
      g.addColorStop(0,'rgba(255,255,255,0.9)');
      g.addColorStop(1,'rgba(124,92,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx,cy,40,0,Math.PI*2); ctx.fill();
    });
    return { stop(){ stop(); k.destroy(); } };
  };
})();
