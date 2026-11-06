(function(){
  window.HPX = window.HPX || {};
  window.HPX['neural-net'] = function(el){
    const U = window.HPX._u;
    const k = U.canvas(el), ctx = k.ctx;
    const ac = U.accent(el,'#7c5cff'), ac2 = U.accent2(el,'#22d3ee');
    const layers = [4,6,6,3];
    let nodes = [], edges = [], pulses = [];
    const layout = () => {
      nodes = [];
      const pad = 40;
      const cw = k.w - pad*2, ch = k.h - pad*2;
      for (let L=0; L<layers.length; L++){
        const x = pad + (cw * L / (layers.length-1));
        const n = layers[L];
        for (let i=0;i<n;i++){
          const y = pad + (ch * (i+0.5) / n);
          nodes.push({x,y,L,i});
        }
      }
      edges = [];
      for (let L=0; L<layers.length-1; L++){
        const a = nodes.filter(n=>n.L===L), b = nodes.filter(n=>n.L===L+1);
        for (const x of a) for (const y of b) edges.push([nodes.indexOf(x),nodes.indexOf(y)]);
      }
    };
    layout();
    let lw=k.w, lh=k.h, last=0;
    const stop = U.loop((t) => {
      if (k.w!==lw||k.h!==lh){ layout(); lw=k.w; lh=k.h; }
      ctx.clearRect(0,0,k.w,k.h);
      ctx.strokeStyle = 'rgba(160,160,200,0.22)'; ctx.lineWidth=1;
      for (const [i,j] of edges){
        const a=nodes[i], b=nodes[j];
        ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
      }
      if (t - last > 0.25){
        last = t;
        const starts = nodes.filter(n=>n.L===0);
        const s = starts[(Math.random()*starts.length)|0];
        pulses.push({node:s, L:0, t:0});
      }
      pulses = pulses.filter(p => p.L < layers.length-1);
      for (const p of pulses){
        p.t += 0.03;
        if (p.t >= 1){
          const next = nodes.filter(n=>n.L===p.L+1);
          p.node2 = next[(Math.random()*next.length)|0];
          if (!p._started){ p._started = true; }
        }
      }
      // animate progression
      for (const p of pulses){
        if (!p.target){
          const next = nodes.filter(n=>n.L===p.L+1);
          p.target = next[(Math.random()*next.length)|0];
        }
        p.t += 0.04;
        const a = p.node, b = p.target;
        const x = a.x + (b.x-a.x)*Math.min(1,p.t);
        const y = a.y + (b.y-a.y)*Math.min(1,p.t);
        ctx.fillStyle = ac2;
        ctx.beginPath(); ctx.arc(x,y,4,0,Math.PI*2); ctx.fill();
        if (p.t >= 1){ p.node = b; p.target=null; p.L++; p.t=0; }
      }
      for (const n of nodes){
        ctx.fillStyle = ac;
        ctx.beginPath(); ctx.arc(n.x,n.y,6,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle = ac2; ctx.lineWidth=1.5;
        ctx.beginPath(); ctx.arc(n.x,n.y,8,0,Math.PI*2); ctx.stroke();
      }
    });
    return { stop(){ stop(); k.destroy(); } };
  };
})();
