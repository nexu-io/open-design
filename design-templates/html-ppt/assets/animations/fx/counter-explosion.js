(function(){
  window.HPX = window.HPX || {};
  window.HPX['counter-explosion'] = function(el){
    const U = window.HPX._u;
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    const target = parseInt(el.getAttribute('data-fx-to') || '2400', 10);
    const k = U.canvas(el), ctx = k.ctx;
    const pal = U.palette(el);
    // number overlay
    const num = document.createElement('div');
    num.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:900 120px system-ui,sans-serif;color:var(--text-1,#fff);pointer-events:none;text-shadow:0 4px 40px rgba(124,92,255,0.5);';
    num.textContent = '0';
    el.appendChild(num);
    let parts = [];
    let state = 'count'; // count | burst | hold
    let stateT = 0;
    let value = 0;
    let cycle = 0;
    const burst = () => {
      const cx = k.w/2, cy = k.h/2;
      for (let i=0;i<120;i++){
        const a = Math.random()*Math.PI*2;
        const s = U.rand(120, 400);
        parts.push({x:cx,y:cy,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:1,r:U.rand(2,5),c:pal[(Math.random()*pal.length)|0]});
      }
    };
    const stop = U.loop(() => {
      ctx.clearRect(0,0,k.w,k.h);
      const dt = 1/60;
      stateT += dt;
      if (state === 'count'){
        const dur = 2.2;
        const p = Math.min(1, stateT/dur);
        const eased = 1 - Math.pow(1-p,3);
        value = Math.round(target*eased);
        num.textContent = value.toLocaleString();
        if (p >= 1){ state='burst'; stateT=0; burst(); }
      } else if (state === 'burst'){
        if (stateT > 0.05 && stateT < 0.3 && parts.length < 200) {}
        if (stateT > 2.5){ state='hold'; stateT=0; }
      } else if (state === 'hold'){
        if (stateT > 1.5){
          state='count'; stateT=0; value=0; num.textContent='0'; cycle++;
        }
      }
      parts = parts.filter(p => p.life > 0);
      for (const p of parts){
        p.vy += 260*dt; p.vx *= 0.985; p.vy *= 0.985;
        p.x += p.vx*dt; p.y += p.vy*dt; p.life -= 0.01;
        ctx.globalAlpha = Math.max(0,p.life);
        ctx.fillStyle = p.c;
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    });
    return { stop(){ stop(); k.destroy(); if (num.parentNode) num.parentNode.removeChild(num); } };
  };
})();
