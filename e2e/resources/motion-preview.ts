export const motionPreviewTimeline = `
    var time = 0, paused = true;
    window.__timelines = {main: {
      duration: function(){return 30}, timeScale: function(){return 1},
      repeat: function(){return 0}, delay: function(){return 0},
      seek: function(t){time=t}, play: function(){paused=false},
      pause: function(){paused=true}, paused: function(){return paused}, time: function(){return time}
    }};
    document.getElementById('scene').textContent = 'Motion preview recovered';
  `;

export const motionPreviewHtml = `<!doctype html><html><head>
    <meta name="od-motion-output" content="video">
    <style>html,body{margin:0;background:#080b0a;color:#63fe13}
    #scene{width:1920px;height:1080px;display:grid;place-items:center;font:80px sans-serif}</style>
    </head><body><main id="scene" data-composition-id="main" data-duration="30"
    data-width="1920" data-height="1080"></main><script src="./timeline.js"></script></body></html>`;
