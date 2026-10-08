export const recentProjectFixedStageDeckHtml = `<!doctype html>
<html>
  <head>
    <style>
      html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; }
      .deck-shell {
        position: fixed;
        inset: 0;
        overflow: hidden;
        transform: translateX(1400px);
      }
      .deck-stage {
        position: relative;
        width: 1920px;
        height: 1080px;
        transform: translate(24px, 16px) scale(.6);
        transform-origin: top left;
      }
      .slide { position: absolute; inset: 0; display: none; }
      .slide.active { display: grid; place-items: center; background: rgb(21, 73, 117); }
      .reveal { opacity: 0; transform: translateY(24px); }
    </style>
  </head>
  <body>
    <div class="deck-shell">
      <div class="deck-stage">
        <section class="slide s-title active">
          <h1 class="reveal">A visible first slide</h1>
        </section>
      </div>
    </div>
    <script>document.querySelector('.deck-shell').style.transform = 'none'</script>
  </body>
</html>`;
