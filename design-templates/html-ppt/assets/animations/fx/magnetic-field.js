(function(){
  window.HPX = window.HPX || {};
  window.HPX['magnetic-field'] = function(el){
    const U = window.HPX._u;
    const k = U.canvas(el), ctx = k.ctx;
    const pal = U.palette(el);
    const N = 60;
    const parts = Array.from({length:N}, (_,i) => ({
      phase: Math.random()*Math.PI*2,
      freq: U.rand(0.4, 1.2),
      amp: U.rand(30, 90),
      y0: U.rand(0.15, 0.85),
      c: pal[i%pal.length],
      trail: []
    }));
    const stop = U.loop((t) => {
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      ctx.fillRect(0,0,k.w,k.h);
      for (const p of parts){
        const x = ((t*80 + p.phase*50) % (k.w+100)) - 50;
        const y = k.h*p.y0 + Math.sin(x*0.02 + p.phase + t*p.freq)*p.amp;
        p.trail.push([x,y]);
        if (p.trail.length > 18) p.trail.shift();
        ctx.strokeStyle = p.c;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i=0;i<p.trail.length;i++){
          const [tx,ty] = p.trail[i];
          if (i===0) ctx.moveTo(tx,ty); else ctx.lineTo(tx,ty);
        }
        ctx.globalAlpha = 0.7;
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = p.c;
        ctx.beginPath(); ctx.arc(x,y,2.5,0,Math.PI*2); ctx.fill();
      }
    });
    return { stop(){ stop(); k.destroy(); } };
  };
})();
