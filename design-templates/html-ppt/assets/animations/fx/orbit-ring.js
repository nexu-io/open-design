(function(){
  window.HPX = window.HPX || {};
  window.HPX['orbit-ring'] = function(el){
    const U = window.HPX._u;
    const k = U.canvas(el), ctx = k.ctx;
    const pal = U.palette(el);
    const rings = [
      {r:40,  n:3,  sp:1.2, c:pal[0]},
      {r:75,  n:5,  sp:0.8, c:pal[1]},
      {r:110, n:8,  sp:-0.6, c:pal[2]},
      {r:145, n:12, sp:0.4, c:pal[3]},
      {r:180, n:16, sp:-0.3, c:pal[4]}
    ];
    const stop = U.loop((t) => {
      ctx.clearRect(0,0,k.w,k.h);
      const cx=k.w/2, cy=k.h/2;
      // radial glow
      const g = ctx.createRadialGradient(cx,cy,0,cx,cy,210);
      g.addColorStop(0,'rgba(124,92,255,0.25)');
      g.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0,0,k.w,k.h);
      for (const R of rings){
        ctx.strokeStyle = 'rgba(200,200,230,0.2)'; ctx.lineWidth=1;
        ctx.beginPath(); ctx.arc(cx,cy,R.r,0,Math.PI*2); ctx.stroke();
        for (let i=0;i<R.n;i++){
          const a = (i/R.n)*Math.PI*2 + t*R.sp;
          const x = cx + Math.cos(a)*R.r;
          const y = cy + Math.sin(a)*R.r;
          ctx.fillStyle = R.c;
          ctx.beginPath(); ctx.arc(x,y,4,0,Math.PI*2); ctx.fill();
        }
      }
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(cx,cy,5,0,Math.PI*2); ctx.fill();
    });
    return { stop(){ stop(); k.destroy(); } };
  };
})();
