(function(){
  window.HPX = window.HPX || {};
  window.HPX['gradient-blob'] = function(el){
    const U = window.HPX._u;
    const k = U.canvas(el), ctx = k.ctx;
    const pal = U.palette(el);
    const blobs = Array.from({length:4}, (_,i) => ({
      x: U.rand(0,1), y: U.rand(0,1),
      vx: U.rand(-0.08,0.08), vy: U.rand(-0.08,0.08),
      r: U.rand(180,320),
      c: pal[i%pal.length]
    }));
    const hex2rgb = (h) => {
      const m = h.replace('#','').match(/.{2}/g);
      if (!m) return [124,92,255];
      return m.map(x=>parseInt(x,16));
    };
    const stop = U.loop((t) => {
      ctx.fillStyle = 'rgba(10,12,22,0.2)';
      ctx.fillRect(0,0,k.w,k.h);
      ctx.globalCompositeOperation = 'lighter';
      for (const b of blobs){
        b.x += b.vx*0.01; b.y += b.vy*0.01;
        if (b.x<0||b.x>1) b.vx*=-1;
        if (b.y<0||b.y>1) b.vy*=-1;
        const px = b.x*k.w, py = b.y*k.h;
        const r = b.r + Math.sin(t*0.8 + b.x*6)*30;
        const [R,G,B] = hex2rgb(b.c);
        const grad = ctx.createRadialGradient(px,py,0,px,py,r);
        grad.addColorStop(0, `rgba(${R},${G},${B},0.55)`);
        grad.addColorStop(1, `rgba(${R},${G},${B},0)`);
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(px,py,r,0,Math.PI*2); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    });
    return { stop(){ stop(); k.destroy(); } };
  };
})();
