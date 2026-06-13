(function(){
  window.HPX = window.HPX || {};
  window.HPX['chain-react'] = function(el){
    const U = window.HPX._u;
    const k = U.canvas(el), ctx = k.ctx;
    const ac = U.accent(el,'#7c5cff'), ac2 = U.accent2(el,'#22d3ee');
    const N = 8;
    const stop = U.loop((t) => {
      ctx.clearRect(0,0,k.w,k.h);
      const cy = k.h/2;
      const pad = 60;
      const dx = (k.w - pad*2)/(N-1);
      const period = 2.4;
      const phase = (t % period) / period; // 0..1
      for (let i=0;i<N;i++){
        const x = pad + i*dx;
        const my = i/(N-1);
        const d = Math.abs(phase - my);
        const pulse = Math.max(0, 1 - d*6);
        const r = 18 + pulse*18;
        // glow
        const g = ctx.createRadialGradient(x,cy,0,x,cy,r*2);
        g.addColorStop(0, `rgba(124,92,255,${0.4*pulse})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x-r*2, cy-r*2, r*4, r*4);
        // circle
        ctx.fillStyle = pulse>0.1 ? ac2 : ac;
        ctx.beginPath(); ctx.arc(x,cy,r,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle='rgba(255,255,255,0.4)'; ctx.lineWidth=2;
        ctx.stroke();
        // connectors
        if (i<N-1){
          ctx.strokeStyle='rgba(200,200,230,0.3)'; ctx.lineWidth=2;
          ctx.beginPath(); ctx.moveTo(x+r,cy); ctx.lineTo(x+dx-r,cy); ctx.stroke();
        }
      }
    });
    return { stop(){ stop(); k.destroy(); } };
  };
})();
