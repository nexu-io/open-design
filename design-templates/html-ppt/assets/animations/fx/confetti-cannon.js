(function(){
  window.HPX = window.HPX || {};
  window.HPX['confetti-cannon'] = function(el){
    const U = window.HPX._u;
    const k = U.canvas(el), ctx = k.ctx;
    const pal = U.palette(el);
    let parts = [];
    const fire = () => {
      for (let side=0; side<2; side++){
        const x0 = side===0 ? 20 : k.w-20;
        const y0 = k.h - 20;
        for (let i=0;i<40;i++){
          const a = side===0 ? U.rand(-Math.PI*0.7, -Math.PI*0.4) : U.rand(-Math.PI*0.6, -Math.PI*0.3) - Math.PI/2 - Math.PI/6;
          const spd = U.rand(300, 520);
          parts.push({
            x: x0, y: y0,
            vx: Math.cos(a)*spd, vy: Math.sin(a)*spd,
            w: U.rand(6,12), h: U.rand(3,7),
            rot: Math.random()*Math.PI, vr: U.rand(-6,6),
            c: pal[(Math.random()*pal.length)|0],
            life: 1
          });
        }
      }
    };
    fire();
    let last = 0;
    const stop = U.loop((t) => {
      ctx.clearRect(0,0,k.w,k.h);
      if (t - last > 3) { fire(); last = t; }
      const dt = 1/60;
      parts = parts.filter(p => p.life > 0 && p.y < k.h+40);
      for (const p of parts){
        p.vy += 520*dt;
        p.x += p.vx*dt; p.y += p.vy*dt;
        p.rot += p.vr*dt;
        p.life -= 0.006;
        ctx.save();
        ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    });
    return { stop(){ stop(); k.destroy(); } };
  };
})();
