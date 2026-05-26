(function(){
  window.HPX = window.HPX || {};
  window.HPX['sparkle-trail'] = function(el){
    const U = window.HPX._u;
    const k = U.canvas(el), ctx = k.ctx;
    k.c.style.pointerEvents = 'none';
    el.style.cursor = 'crosshair';
    const pal = U.palette(el);
    let sparks = [];
    const onMove = (e) => {
      const r = el.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      for (let i=0;i<3;i++){
        sparks.push({
          x, y,
          vx: U.rand(-60,60), vy: U.rand(-80,20),
          life: 1, c: pal[(Math.random()*pal.length)|0],
          r: U.rand(1.5,3.5)
        });
      }
    };
    // auto-wiggle if no mouse moves
    let auto = true, autoT = 0;
    const onAny = () => { auto = false; };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerenter', onAny);
    const stop = U.loop(() => {
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.fillRect(0,0,k.w,k.h);
      if (auto){
        autoT += 0.04;
        const x = k.w/2 + Math.cos(autoT)*k.w*0.3;
        const y = k.h/2 + Math.sin(autoT*1.3)*k.h*0.3;
        for (let i=0;i<3;i++){
          sparks.push({
            x, y,
            vx: U.rand(-60,60), vy: U.rand(-80,20),
            life: 1, c: pal[(Math.random()*pal.length)|0],
            r: U.rand(1.5,3.5)
          });
        }
      }
      const dt = 1/60;
      sparks = sparks.filter(s => s.life > 0);
      for (const s of sparks){
        s.vy += 160*dt;
        s.x += s.vx*dt; s.y += s.vy*dt;
        s.life -= 0.018;
        ctx.globalAlpha = Math.max(0, s.life);
        ctx.fillStyle = s.c;
        ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    });
    return { stop(){
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerenter', onAny);
      el.style.cursor = '';
      stop(); k.destroy();
    }};
  };
})();
