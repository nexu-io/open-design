(function(){
  window.HPX = window.HPX || {};
  window.HPX['data-stream'] = function(el){
    const U = window.HPX._u;
    const k = U.canvas(el), ctx = k.ctx;
    const ac = U.accent(el,'#22d3ee'), ac2 = U.accent2(el,'#7c5cff');
    const rows = [];
    const rh = 22;
    const genRow = (y) => ({
      y, dir: Math.random()<0.5?-1:1,
      speed: U.rand(30, 90),
      offset: Math.random()*2000,
      text: Array.from({length:120}, () => {
        const r = Math.random();
        if (r<0.3) return Math.random()<0.5?'0':'1';
        if (r<0.6) return '0x' + Math.floor(Math.random()*256).toString(16).padStart(2,'0');
        return Math.random().toString(16).slice(2,6);
      }).join(' ')
    });
    const init = () => {
      rows.length = 0;
      const n = Math.ceil(k.h/rh);
      for (let i=0;i<n;i++) rows.push(genRow(i*rh + rh*0.7));
    };
    init();
    let lh = k.h;
    const stop = U.loop((t) => {
      if (k.h!==lh){ init(); lh=k.h; }
      ctx.fillStyle = 'rgba(5,8,14,0.35)';
      ctx.fillRect(0,0,k.w,k.h);
      ctx.font = '13px ui-monospace,Menlo,monospace';
      for (let i=0;i<rows.length;i++){
        const r = rows[i];
        const x = r.dir>0
          ? ((t*r.speed + r.offset) % (k.w+400)) - 400
          : k.w - (((t*r.speed + r.offset) % (k.w+400)) - 400);
        ctx.fillStyle = (i%3===0)?ac:ac2;
        ctx.globalAlpha = 0.65 + (i%2)*0.3;
        ctx.fillText(r.text, x, r.y);
      }
      ctx.globalAlpha = 1;
    });
    return { stop(){ stop(); k.destroy(); } };
  };
})();
