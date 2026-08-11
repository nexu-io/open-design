/*
 * The revealed drop markup, kept out of the page so an unopened day is never
 * present in a response. `functions/launch-week/drops.ts` releases each entry
 * once its date has passed; the page fetches them and slots them in.
 */
export const LW_DROP_MARKUP: Record<string, string[]> = {
  en: [
    `<article class="drop reveal" data-day="1" data-launch-day="1" id="day-1" data-secret>
      <div class="drop-meta">
        <span class="day-no">01</span>
        <span class="day">DAY 01/05</span>
        <span>AUG 10</span>
        <span data-status>RELEASED</span>
      </div>
      <div class="drop-content">
        <span class="drop-code">OPEN DESIGN TEAM WORKSPACE</span>
        <h3>Collaborative Codex Is Live.</h3>
        <p class="proof">Your team and their Codex agents are now designing together on one live canvas.</p>
        <div class="killstrip">CAN THEY KILL <span class="brand-target"><img src="/launch-week/figma-icon.svg" alt="Figma" loading="lazy" decoding="async" width="24" height="24"> FIGMA?</span></div>
        <a class="watch" href="#">WATCH THE DROP ↗</a>
      </div>
    </article>`,
    `<article class="drop reveal" data-day="2" data-launch-day="2" id="day-2" data-secret>
      <div class="drop-meta">
        <span class="day-no">02</span>
        <span class="day">DAY 02/05</span>
        <span>AUG 11</span>
        <img class="live-stamp" src="/launch-week/stamp-live.svg" alt="Live now" loading="lazy" decoding="async">
      </div>
      <div class="drop-content">
        <span class="drop-code">NATIVE SLIDE GENERATION &amp; EDITING</span>
        <h3>The Creative Slide Studio Is Live.</h3>
        <p class="proof">Stunning by default. Effortless to edit. Ready in minutes.</p>
        <div class="killstrip">CAN IT KILL <span class="brand-target"><img src="/launch-week/gamma-icon.png" alt="Gamma" loading="lazy" decoding="async" width="24" height="24"> GAMMA?</span></div>
        <a class="watch" href="#">WATCH THE DROP ↗</a>
      </div>
    </article>`,
    `<article class="drop reveal" data-day="3" data-launch-day="3" id="day-3" data-secret>
      <div class="drop-meta">
        <span class="day-no">03</span>
        <span class="day">DAY 03/05</span>
        <span>AUG 12</span>
        <span data-status>UP NEXT</span>
      </div>
      <div class="drop-content">
        <span class="drop-code">NATIVE IMAGE GENERATION &amp; EDITING</span>
        <h3>The Campaign Engine Is Live.</h3>
        <p class="proof">One brief in. A full campaign out—social creatives, animated assets, and landing pages. Ready for every channel.</p>
        <div class="killstrip">CAN IT KILL <span class="brand-target"><img src="/launch-week/canva-icon.png" alt="Canva" loading="lazy" decoding="async" width="24" height="24"> CANVA?</span></div>
        <a class="watch" href="#">WATCH THE DROP ↗</a>
      </div>
    </article>`,
    `<article class="drop reveal" data-day="4" data-launch-day="4" id="day-4" data-secret>
      <div class="drop-meta">
        <span class="day-no">04</span>
        <span class="day">DAY 04/05</span>
        <span>AUG 13</span>
        <span data-status>UP NEXT</span>
      </div>
      <div class="drop-content">
        <span class="drop-code">NATIVE VIDEO GENERATION &amp; EDITING</span>
        <h3>The Product Film Studio Is Live.</h3>
        <p class="proof">A campaign-ready product film—cinematic, polished, and built to perform.</p>
        <div class="killstrip">CAN IT KILL <span class="brand-target"><img src="/launch-week/higgsfield-icon.png" alt="Higgsfield" loading="lazy" decoding="async" width="24" height="24"> HIGGSFIELD?</span></div>
        <a class="watch" href="#">WATCH THE DROP ↗</a>
      </div>
    </article>`,
    `<article class="drop reveal" data-day="5" data-launch-day="5" id="day-5" data-secret>
      <div class="drop-meta">
        <span class="day-no">05</span>
        <span class="day">DAY 05/05</span>
        <span>AUG 14</span>
        <span data-status>UP NEXT</span>
      </div>
      <div class="drop-content">
        <span class="drop-code">OPEN DESIGN COMMUNITY SHOWCASE</span>
        <h3>The Community Showcase Is Live.</h3>
        <p class="proof">Everything the community built this week, in one place. Submissions close tonight.</p>
        <div class="killstrip">SO — DID WE KILL ANYTHING?</div>
      </div>
    </article>`,
  ],
  zh: [
    `<article class="drop reveal" data-day="1" data-launch-day="1" id="day-1" data-secret>
      <div class="drop-meta">
        <span class="day-no">01</span>
        <span class="day">DAY 01/05</span>
        <span>8月10日</span>
        <span data-status>已发布</span>
      </div>
      <div class="drop-content">
        <span class="drop-code">OPEN DESIGN 团队协作空间</span>
        <h3>协作版 Codex 已上线。</h3>
        <p class="proof">你的团队和他们的 Codex 智能体，现在在同一块实时画布上一起做设计。</p>
        <div class="killstrip">CAN THEY KILL <span class="brand-target"><img src="/launch-week/figma-icon.svg" alt="Figma" loading="lazy" decoding="async" width="24" height="24"> FIGMA?</span></div>
        <a class="watch" href="#">观看当日发布 ↗</a>
      </div>
    </article>`,
    `<article class="drop reveal" data-day="2" data-launch-day="2" id="day-2" data-secret>
      <div class="drop-meta">
        <span class="day-no">02</span>
        <span class="day">DAY 02/05</span>
        <span>8月11日</span>
        <img class="live-stamp" src="/launch-week/stamp-live.svg" alt="Live now" loading="lazy" decoding="async">
      </div>
      <div class="drop-content">
        <span class="drop-code">原生幻灯片生成与编辑</span>
        <h3>创意幻灯片工作室已上线。</h3>
        <p class="proof">默认就好看。改起来毫不费力。几分钟就能交付。</p>
        <div class="killstrip">CAN IT KILL <span class="brand-target"><img src="/launch-week/gamma-icon.png" alt="Gamma" loading="lazy" decoding="async" width="24" height="24"> GAMMA?</span></div>
        <a class="watch" href="#">观看当日发布 ↗</a>
      </div>
    </article>`,
    `<article class="drop reveal" data-day="3" data-launch-day="3" id="day-3" data-secret>
      <div class="drop-meta">
        <span class="day-no">03</span>
        <span class="day">DAY 03/05</span>
        <span>8月12日</span>
        <span data-status>即将到来</span>
      </div>
      <div class="drop-content">
        <span class="drop-code">原生图像生成与编辑</span>
        <h3>营销物料引擎已上线。</h3>
        <p class="proof">输入一份 brief，产出一整套 campaign——社媒素材、动态资源、落地页，每个渠道都能直接用。</p>
        <div class="killstrip">CAN IT KILL <span class="brand-target"><img src="/launch-week/canva-icon.png" alt="Canva" loading="lazy" decoding="async" width="24" height="24"> CANVA?</span></div>
        <a class="watch" href="#">观看当日发布 ↗</a>
      </div>
    </article>`,
    `<article class="drop reveal" data-day="4" data-launch-day="4" id="day-4" data-secret>
      <div class="drop-meta">
        <span class="day-no">04</span>
        <span class="day">DAY 04/05</span>
        <span>8月13日</span>
        <span data-status>即将到来</span>
      </div>
      <div class="drop-content">
        <span class="drop-code">原生视频生成与编辑</span>
        <h3>产品影片工作室已上线。</h3>
        <p class="proof">一支可直接投放的产品影片——有电影感、够精致、为效果而生。</p>
        <div class="killstrip">CAN IT KILL <span class="brand-target"><img src="/launch-week/higgsfield-icon.png" alt="Higgsfield" loading="lazy" decoding="async" width="24" height="24"> HIGGSFIELD?</span></div>
        <a class="watch" href="#">观看当日发布 ↗</a>
      </div>
    </article>`,
    `<article class="drop reveal" data-day="5" data-launch-day="5" id="day-5" data-secret>
      <div class="drop-meta">
        <span class="day-no">05</span>
        <span class="day">DAY 05/05</span>
        <span>8月14日</span>
        <span data-status>即将到来</span>
      </div>
      <div class="drop-content">
        <span class="drop-code">OPEN DESIGN 社区作品展</span>
        <h3>社区作品展已上线。</h3>
        <p class="proof">社区这一周做出来的全部作品，都在这里。今晚截止投稿。</p>
        <div class="killstrip">SO — DID WE KILL ANYTHING?</div>
      </div>
    </article>`,
  ],
  ja: [
    `<article class="drop reveal" data-day="1" data-launch-day="1" id="day-1" data-secret>
      <div class="drop-meta">
        <span class="day-no">01</span>
        <span class="day">DAY 01/05</span>
        <span>8月10日</span>
        <span data-status>公開済み</span>
      </div>
      <div class="drop-content">
        <span class="drop-code">OPEN DESIGN チームワークスペース</span>
        <h3>コラボレーティブ Codex、公開。</h3>
        <p class="proof">チームと Codex エージェントが、ひとつのライブキャンバス上で一緒にデザインします。</p>
        <div class="killstrip">CAN THEY KILL <span class="brand-target"><img src="/launch-week/figma-icon.svg" alt="Figma" loading="lazy" decoding="async" width="24" height="24"> FIGMA?</span></div>
        <a class="watch" href="#">ドロップを見る ↗</a>
      </div>
    </article>`,
    `<article class="drop reveal" data-day="2" data-launch-day="2" id="day-2" data-secret>
      <div class="drop-meta">
        <span class="day-no">02</span>
        <span class="day">DAY 02/05</span>
        <span>8月11日</span>
        <img class="live-stamp" src="/launch-week/stamp-live.svg" alt="Live now" loading="lazy" decoding="async">
      </div>
      <div class="drop-content">
        <span class="drop-code">ネイティブスライド生成・編集</span>
        <h3>クリエイティブ・スライド・スタジオ、公開。</h3>
        <p class="proof">はじめから美しく。編集は手間いらず。数分で仕上がります。</p>
        <div class="killstrip">CAN IT KILL <span class="brand-target"><img src="/launch-week/gamma-icon.png" alt="Gamma" loading="lazy" decoding="async" width="24" height="24"> GAMMA?</span></div>
        <a class="watch" href="#">ドロップを見る ↗</a>
      </div>
    </article>`,
    `<article class="drop reveal" data-day="3" data-launch-day="3" id="day-3" data-secret>
      <div class="drop-meta">
        <span class="day-no">03</span>
        <span class="day">DAY 03/05</span>
        <span>8月12日</span>
        <span data-status>次回</span>
      </div>
      <div class="drop-content">
        <span class="drop-code">ネイティブ画像生成・編集</span>
        <h3>キャンペーン・エンジン、公開。</h3>
        <p class="proof">ブリーフをひとつ入れれば、キャンペーン一式が出てきます。SNS クリエイティブ、アニメーション素材、ランディングページ。どのチャネルにもそのまま使えます。</p>
        <div class="killstrip">CAN IT KILL <span class="brand-target"><img src="/launch-week/canva-icon.png" alt="Canva" loading="lazy" decoding="async" width="24" height="24"> CANVA?</span></div>
        <a class="watch" href="#">ドロップを見る ↗</a>
      </div>
    </article>`,
    `<article class="drop reveal" data-day="4" data-launch-day="4" id="day-4" data-secret>
      <div class="drop-meta">
        <span class="day-no">04</span>
        <span class="day">DAY 04/05</span>
        <span>8月13日</span>
        <span data-status>次回</span>
      </div>
      <div class="drop-content">
        <span class="drop-code">ネイティブ動画生成・編集</span>
        <h3>プロダクト・フィルム・スタジオ、公開。</h3>
        <p class="proof">そのまま配信できるプロダクト映像。シネマティックで、磨かれていて、成果を出すために作られています。</p>
        <div class="killstrip">CAN IT KILL <span class="brand-target"><img src="/launch-week/higgsfield-icon.png" alt="Higgsfield" loading="lazy" decoding="async" width="24" height="24"> HIGGSFIELD?</span></div>
        <a class="watch" href="#">ドロップを見る ↗</a>
      </div>
    </article>`,
    `<article class="drop reveal" data-day="5" data-launch-day="5" id="day-5" data-secret>
      <div class="drop-meta">
        <span class="day-no">05</span>
        <span class="day">DAY 05/05</span>
        <span>8月14日</span>
        <span data-status>次回</span>
      </div>
      <div class="drop-content">
        <span class="drop-code">OPEN DESIGN コミュニティ・ショーケース</span>
        <h3>コミュニティ・ショーケース、公開。</h3>
        <p class="proof">今週コミュニティが作ったものが、すべてここに。応募は今夜締め切りです。</p>
        <div class="killstrip">SO — DID WE KILL ANYTHING?</div>
      </div>
    </article>`,
  ],
  ko: [
    `<article class="drop reveal" data-day="1" data-launch-day="1" id="day-1" data-secret>
      <div class="drop-meta">
        <span class="day-no">01</span>
        <span class="day">DAY 01/05</span>
        <span>8월 10일</span>
        <span data-status>공개됨</span>
      </div>
      <div class="drop-content">
        <span class="drop-code">OPEN DESIGN 팀 워크스페이스</span>
        <h3>협업 Codex가 공개되었습니다.</h3>
        <p class="proof">팀과 Codex 에이전트가 하나의 실시간 캔버스에서 함께 디자인합니다.</p>
        <div class="killstrip">CAN THEY KILL <span class="brand-target"><img src="/launch-week/figma-icon.svg" alt="Figma" loading="lazy" decoding="async" width="24" height="24"> FIGMA?</span></div>
        <a class="watch" href="#">드롭 보기 ↗</a>
      </div>
    </article>`,
    `<article class="drop reveal" data-day="2" data-launch-day="2" id="day-2" data-secret>
      <div class="drop-meta">
        <span class="day-no">02</span>
        <span class="day">DAY 02/05</span>
        <span>8월 11일</span>
        <img class="live-stamp" src="/launch-week/stamp-live.svg" alt="Live now" loading="lazy" decoding="async">
      </div>
      <div class="drop-content">
        <span class="drop-code">네이티브 슬라이드 생성 및 편집</span>
        <h3>크리에이티브 슬라이드 스튜디오가 공개되었습니다.</h3>
        <p class="proof">기본부터 아름답게. 편집은 손쉽게. 몇 분이면 완성.</p>
        <div class="killstrip">CAN IT KILL <span class="brand-target"><img src="/launch-week/gamma-icon.png" alt="Gamma" loading="lazy" decoding="async" width="24" height="24"> GAMMA?</span></div>
        <a class="watch" href="#">드롭 보기 ↗</a>
      </div>
    </article>`,
    `<article class="drop reveal" data-day="3" data-launch-day="3" id="day-3" data-secret>
      <div class="drop-meta">
        <span class="day-no">03</span>
        <span class="day">DAY 03/05</span>
        <span>8월 12일</span>
        <span data-status>다음 차례</span>
      </div>
      <div class="drop-content">
        <span class="drop-code">네이티브 이미지 생성 및 편집</span>
        <h3>캠페인 엔진이 공개되었습니다.</h3>
        <p class="proof">브리프 하나를 넣으면 캠페인 전체가 나옵니다. 소셜 크리에이티브, 애니메이션 에셋, 랜딩 페이지까지 모든 채널에 바로 쓸 수 있습니다.</p>
        <div class="killstrip">CAN IT KILL <span class="brand-target"><img src="/launch-week/canva-icon.png" alt="Canva" loading="lazy" decoding="async" width="24" height="24"> CANVA?</span></div>
        <a class="watch" href="#">드롭 보기 ↗</a>
      </div>
    </article>`,
    `<article class="drop reveal" data-day="4" data-launch-day="4" id="day-4" data-secret>
      <div class="drop-meta">
        <span class="day-no">04</span>
        <span class="day">DAY 04/05</span>
        <span>8월 13일</span>
        <span data-status>다음 차례</span>
      </div>
      <div class="drop-content">
        <span class="drop-code">네이티브 비디오 생성 및 편집</span>
        <h3>제품 필름 스튜디오가 공개되었습니다.</h3>
        <p class="proof">바로 집행할 수 있는 제품 영상. 시네마틱하고, 정교하며, 성과를 내도록 만들어졌습니다.</p>
        <div class="killstrip">CAN IT KILL <span class="brand-target"><img src="/launch-week/higgsfield-icon.png" alt="Higgsfield" loading="lazy" decoding="async" width="24" height="24"> HIGGSFIELD?</span></div>
        <a class="watch" href="#">드롭 보기 ↗</a>
      </div>
    </article>`,
    `<article class="drop reveal" data-day="5" data-launch-day="5" id="day-5" data-secret>
      <div class="drop-meta">
        <span class="day-no">05</span>
        <span class="day">DAY 05/05</span>
        <span>8월 14일</span>
        <span data-status>다음 차례</span>
      </div>
      <div class="drop-content">
        <span class="drop-code">OPEN DESIGN 커뮤니티 쇼케이스</span>
        <h3>커뮤니티 쇼케이스가 공개되었습니다.</h3>
        <p class="proof">이번 주 커뮤니티가 만든 모든 것이 한곳에. 제출은 오늘 밤 마감됩니다.</p>
        <div class="killstrip">SO — DID WE KILL ANYTHING?</div>
      </div>
    </article>`,
  ],
  de: [
    `<article class="drop reveal" data-day="1" data-launch-day="1" id="day-1" data-secret>
      <div class="drop-meta">
        <span class="day-no">01</span>
        <span class="day">DAY 01/05</span>
        <span>10. AUG</span>
        <span data-status>VERÖFFENTLICHT</span>
      </div>
      <div class="drop-content">
        <span class="drop-code">OPEN DESIGN TEAM-WORKSPACE</span>
        <h3>Collaborative Codex ist live.</h3>
        <p class="proof">Dein Team und seine Codex-Agenten gestalten jetzt gemeinsam auf einer Live-Canvas.</p>
        <div class="killstrip">CAN THEY KILL <span class="brand-target"><img src="/launch-week/figma-icon.svg" alt="Figma" loading="lazy" decoding="async" width="24" height="24"> FIGMA?</span></div>
        <a class="watch" href="#">DEN DROP ANSEHEN ↗</a>
      </div>
    </article>`,
    `<article class="drop reveal" data-day="2" data-launch-day="2" id="day-2" data-secret>
      <div class="drop-meta">
        <span class="day-no">02</span>
        <span class="day">DAY 02/05</span>
        <span>11. AUG</span>
        <img class="live-stamp" src="/launch-week/stamp-live.svg" alt="Live now" loading="lazy" decoding="async">
      </div>
      <div class="drop-content">
        <span class="drop-code">NATIVE SLIDE-ERZEUGUNG &amp; -BEARBEITUNG</span>
        <h3>Das Creative-Slide-Studio ist live.</h3>
        <p class="proof">Von Haus aus beeindruckend. Mühelos zu bearbeiten. In Minuten fertig.</p>
        <div class="killstrip">CAN IT KILL <span class="brand-target"><img src="/launch-week/gamma-icon.png" alt="Gamma" loading="lazy" decoding="async" width="24" height="24"> GAMMA?</span></div>
        <a class="watch" href="#">DEN DROP ANSEHEN ↗</a>
      </div>
    </article>`,
    `<article class="drop reveal" data-day="3" data-launch-day="3" id="day-3" data-secret>
      <div class="drop-meta">
        <span class="day-no">03</span>
        <span class="day">DAY 03/05</span>
        <span>12. AUG</span>
        <span data-status>ALS NÄCHSTES</span>
      </div>
      <div class="drop-content">
        <span class="drop-code">NATIVE BILDERZEUGUNG &amp; -BEARBEITUNG</span>
        <h3>Die Kampagnen-Engine ist live.</h3>
        <p class="proof">Ein Briefing rein, eine komplette Kampagne raus — Social Creatives, animierte Assets und Landingpages. Bereit für jeden Kanal.</p>
        <div class="killstrip">CAN IT KILL <span class="brand-target"><img src="/launch-week/canva-icon.png" alt="Canva" loading="lazy" decoding="async" width="24" height="24"> CANVA?</span></div>
        <a class="watch" href="#">DEN DROP ANSEHEN ↗</a>
      </div>
    </article>`,
    `<article class="drop reveal" data-day="4" data-launch-day="4" id="day-4" data-secret>
      <div class="drop-meta">
        <span class="day-no">04</span>
        <span class="day">DAY 04/05</span>
        <span>13. AUG</span>
        <span data-status>ALS NÄCHSTES</span>
      </div>
      <div class="drop-content">
        <span class="drop-code">NATIVE VIDEOERZEUGUNG &amp; -BEARBEITUNG</span>
        <h3>Das Produktfilm-Studio ist live.</h3>
        <p class="proof">Ein kampagnenfertiger Produktfilm — filmisch, ausgefeilt und auf Wirkung gebaut.</p>
        <div class="killstrip">CAN IT KILL <span class="brand-target"><img src="/launch-week/higgsfield-icon.png" alt="Higgsfield" loading="lazy" decoding="async" width="24" height="24"> HIGGSFIELD?</span></div>
        <a class="watch" href="#">DEN DROP ANSEHEN ↗</a>
      </div>
    </article>`,
    `<article class="drop reveal" data-day="5" data-launch-day="5" id="day-5" data-secret>
      <div class="drop-meta">
        <span class="day-no">05</span>
        <span class="day">DAY 05/05</span>
        <span>14. AUG</span>
        <span data-status>ALS NÄCHSTES</span>
      </div>
      <div class="drop-content">
        <span class="drop-code">OPEN DESIGN COMMUNITY-SHOWCASE</span>
        <h3>Der Community-Showcase ist live.</h3>
        <p class="proof">Alles, was die Community diese Woche gebaut hat, an einem Ort. Einsendeschluss ist heute Abend.</p>
        <div class="killstrip">SO — DID WE KILL ANYTHING?</div>
      </div>
    </article>`,
  ],
  ru: [
    `<article class="drop reveal" data-day="1" data-launch-day="1" id="day-1" data-secret>
      <div class="drop-meta">
        <span class="day-no">01</span>
        <span class="day">DAY 01/05</span>
        <span>10 АВГ</span>
        <span data-status>ВЫШЛО</span>
      </div>
      <div class="drop-content">
        <span class="drop-code">КОМАНДНОЕ ПРОСТРАНСТВО OPEN DESIGN</span>
        <h3>Совместный Codex запущен.</h3>
        <p class="proof">Ваша команда и её агенты Codex теперь работают над дизайном на одном живом холсте.</p>
        <div class="killstrip">CAN THEY KILL <span class="brand-target"><img src="/launch-week/figma-icon.svg" alt="Figma" loading="lazy" decoding="async" width="24" height="24"> FIGMA?</span></div>
        <a class="watch" href="#">СМОТРЕТЬ ВЫПУСК ↗</a>
      </div>
    </article>`,
    `<article class="drop reveal" data-day="2" data-launch-day="2" id="day-2" data-secret>
      <div class="drop-meta">
        <span class="day-no">02</span>
        <span class="day">DAY 02/05</span>
        <span>11 АВГ</span>
        <img class="live-stamp" src="/launch-week/stamp-live.svg" alt="Live now" loading="lazy" decoding="async">
      </div>
      <div class="drop-content">
        <span class="drop-code">ВСТРОЕННАЯ ГЕНЕРАЦИЯ И РЕДАКТИРОВАНИЕ СЛАЙДОВ</span>
        <h3>Студия креативных слайдов запущена.</h3>
        <p class="proof">Красиво по умолчанию. Редактируется без усилий. Готово за минуты.</p>
        <div class="killstrip">CAN IT KILL <span class="brand-target"><img src="/launch-week/gamma-icon.png" alt="Gamma" loading="lazy" decoding="async" width="24" height="24"> GAMMA?</span></div>
        <a class="watch" href="#">СМОТРЕТЬ ВЫПУСК ↗</a>
      </div>
    </article>`,
    `<article class="drop reveal" data-day="3" data-launch-day="3" id="day-3" data-secret>
      <div class="drop-meta">
        <span class="day-no">03</span>
        <span class="day">DAY 03/05</span>
        <span>12 АВГ</span>
        <span data-status>ДАЛЕЕ</span>
      </div>
      <div class="drop-content">
        <span class="drop-code">ВСТРОЕННАЯ ГЕНЕРАЦИЯ И РЕДАКТИРОВАНИЕ ИЗОБРАЖЕНИЙ</span>
        <h3>Движок кампаний запущен.</h3>
        <p class="proof">Один бриф на входе — целая кампания на выходе: креативы для соцсетей, анимированные ассеты и лендинги. Готово для любого канала.</p>
        <div class="killstrip">CAN IT KILL <span class="brand-target"><img src="/launch-week/canva-icon.png" alt="Canva" loading="lazy" decoding="async" width="24" height="24"> CANVA?</span></div>
        <a class="watch" href="#">СМОТРЕТЬ ВЫПУСК ↗</a>
      </div>
    </article>`,
    `<article class="drop reveal" data-day="4" data-launch-day="4" id="day-4" data-secret>
      <div class="drop-meta">
        <span class="day-no">04</span>
        <span class="day">DAY 04/05</span>
        <span>13 АВГ</span>
        <span data-status>ДАЛЕЕ</span>
      </div>
      <div class="drop-content">
        <span class="drop-code">ВСТРОЕННАЯ ГЕНЕРАЦИЯ И МОНТАЖ ВИДЕО</span>
        <h3>Студия продуктовых роликов запущена.</h3>
        <p class="proof">Продуктовый ролик, готовый к запуску: кинематографичный, отточенный и нацеленный на результат.</p>
        <div class="killstrip">CAN IT KILL <span class="brand-target"><img src="/launch-week/higgsfield-icon.png" alt="Higgsfield" loading="lazy" decoding="async" width="24" height="24"> HIGGSFIELD?</span></div>
        <a class="watch" href="#">СМОТРЕТЬ ВЫПУСК ↗</a>
      </div>
    </article>`,
    `<article class="drop reveal" data-day="5" data-launch-day="5" id="day-5" data-secret>
      <div class="drop-meta">
        <span class="day-no">05</span>
        <span class="day">DAY 05/05</span>
        <span>14 АВГ</span>
        <span data-status>ДАЛЕЕ</span>
      </div>
      <div class="drop-content">
        <span class="drop-code">ВИТРИНА СООБЩЕСТВА OPEN DESIGN</span>
        <h3>Витрина сообщества открыта.</h3>
        <p class="proof">Всё, что сообщество создало за эту неделю, в одном месте. Приём работ закрывается сегодня вечером.</p>
        <div class="killstrip">SO — DID WE KILL ANYTHING?</div>
      </div>
    </article>`,
  ],
  fr: [
    `<article class="drop reveal" data-day="1" data-launch-day="1" id="day-1" data-secret>
      <div class="drop-meta">
        <span class="day-no">01</span>
        <span class="day">DAY 01/05</span>
        <span>10 AOÛT</span>
        <span data-status>PUBLIÉ</span>
      </div>
      <div class="drop-content">
        <span class="drop-code">ESPACE D'ÉQUIPE OPEN DESIGN</span>
        <h3>Codex collaboratif est en ligne.</h3>
        <p class="proof">Votre équipe et ses agents Codex conçoivent désormais ensemble sur un même canevas en direct.</p>
        <div class="killstrip">CAN THEY KILL <span class="brand-target"><img src="/launch-week/figma-icon.svg" alt="Figma" loading="lazy" decoding="async" width="24" height="24"> FIGMA?</span></div>
        <a class="watch" href="#">VOIR LE DROP ↗</a>
      </div>
    </article>`,
    `<article class="drop reveal" data-day="2" data-launch-day="2" id="day-2" data-secret>
      <div class="drop-meta">
        <span class="day-no">02</span>
        <span class="day">DAY 02/05</span>
        <span>11 AOÛT</span>
        <img class="live-stamp" src="/launch-week/stamp-live.svg" alt="Live now" loading="lazy" decoding="async">
      </div>
      <div class="drop-content">
        <span class="drop-code">GÉNÉRATION ET ÉDITION DE SLIDES NATIVES</span>
        <h3>Le studio de slides créatives est en ligne.</h3>
        <p class="proof">Superbes par défaut. Faciles à modifier. Prêtes en quelques minutes.</p>
        <div class="killstrip">CAN IT KILL <span class="brand-target"><img src="/launch-week/gamma-icon.png" alt="Gamma" loading="lazy" decoding="async" width="24" height="24"> GAMMA?</span></div>
        <a class="watch" href="#">VOIR LE DROP ↗</a>
      </div>
    </article>`,
    `<article class="drop reveal" data-day="3" data-launch-day="3" id="day-3" data-secret>
      <div class="drop-meta">
        <span class="day-no">03</span>
        <span class="day">DAY 03/05</span>
        <span>12 AOÛT</span>
        <span data-status>À VENIR</span>
      </div>
      <div class="drop-content">
        <span class="drop-code">GÉNÉRATION ET ÉDITION D'IMAGES NATIVES</span>
        <h3>Le moteur de campagne est en ligne.</h3>
        <p class="proof">Un brief en entrée, une campagne complète en sortie : créations sociales, assets animés et landing pages. Prêts pour chaque canal.</p>
        <div class="killstrip">CAN IT KILL <span class="brand-target"><img src="/launch-week/canva-icon.png" alt="Canva" loading="lazy" decoding="async" width="24" height="24"> CANVA?</span></div>
        <a class="watch" href="#">VOIR LE DROP ↗</a>
      </div>
    </article>`,
    `<article class="drop reveal" data-day="4" data-launch-day="4" id="day-4" data-secret>
      <div class="drop-meta">
        <span class="day-no">04</span>
        <span class="day">DAY 04/05</span>
        <span>13 AOÛT</span>
        <span data-status>À VENIR</span>
      </div>
      <div class="drop-content">
        <span class="drop-code">GÉNÉRATION ET MONTAGE VIDÉO NATIFS</span>
        <h3>Le studio de films produit est en ligne.</h3>
        <p class="proof">Un film produit prêt pour la campagne — cinématographique, soigné et conçu pour performer.</p>
        <div class="killstrip">CAN IT KILL <span class="brand-target"><img src="/launch-week/higgsfield-icon.png" alt="Higgsfield" loading="lazy" decoding="async" width="24" height="24"> HIGGSFIELD?</span></div>
        <a class="watch" href="#">VOIR LE DROP ↗</a>
      </div>
    </article>`,
    `<article class="drop reveal" data-day="5" data-launch-day="5" id="day-5" data-secret>
      <div class="drop-meta">
        <span class="day-no">05</span>
        <span class="day">DAY 05/05</span>
        <span>14 AOÛT</span>
        <span data-status>À VENIR</span>
      </div>
      <div class="drop-content">
        <span class="drop-code">VITRINE DE LA COMMUNAUTÉ OPEN DESIGN</span>
        <h3>La vitrine de la communauté est en ligne.</h3>
        <p class="proof">Tout ce que la communauté a construit cette semaine, au même endroit. Les soumissions ferment ce soir.</p>
        <div class="killstrip">SO — DID WE KILL ANYTHING?</div>
      </div>
    </article>`,
  ],
  es: [
    `<article class="drop reveal" data-day="1" data-launch-day="1" id="day-1" data-secret>
      <div class="drop-meta">
        <span class="day-no">01</span>
        <span class="day">DAY 01/05</span>
        <span>10 AGO</span>
        <span data-status>PUBLICADO</span>
      </div>
      <div class="drop-content">
        <span class="drop-code">ESPACIO DE EQUIPO DE OPEN DESIGN</span>
        <h3>Codex colaborativo ya está disponible.</h3>
        <p class="proof">Tu equipo y sus agentes de Codex ahora diseñan juntos en un mismo lienzo en vivo.</p>
        <div class="killstrip">CAN THEY KILL <span class="brand-target"><img src="/launch-week/figma-icon.svg" alt="Figma" loading="lazy" decoding="async" width="24" height="24"> FIGMA?</span></div>
        <a class="watch" href="#">VER EL DROP ↗</a>
      </div>
    </article>`,
    `<article class="drop reveal" data-day="2" data-launch-day="2" id="day-2" data-secret>
      <div class="drop-meta">
        <span class="day-no">02</span>
        <span class="day">DAY 02/05</span>
        <span>11 AGO</span>
        <img class="live-stamp" src="/launch-week/stamp-live.svg" alt="Live now" loading="lazy" decoding="async">
      </div>
      <div class="drop-content">
        <span class="drop-code">GENERACIÓN Y EDICIÓN DE DIAPOSITIVAS NATIVAS</span>
        <h3>El estudio de diapositivas creativas ya está disponible.</h3>
        <p class="proof">Impresionantes por defecto. Fáciles de editar. Listas en minutos.</p>
        <div class="killstrip">CAN IT KILL <span class="brand-target"><img src="/launch-week/gamma-icon.png" alt="Gamma" loading="lazy" decoding="async" width="24" height="24"> GAMMA?</span></div>
        <a class="watch" href="#">VER EL DROP ↗</a>
      </div>
    </article>`,
    `<article class="drop reveal" data-day="3" data-launch-day="3" id="day-3" data-secret>
      <div class="drop-meta">
        <span class="day-no">03</span>
        <span class="day">DAY 03/05</span>
        <span>12 AGO</span>
        <span data-status>PRÓXIMAMENTE</span>
      </div>
      <div class="drop-content">
        <span class="drop-code">GENERACIÓN Y EDICIÓN DE IMÁGENES NATIVAS</span>
        <h3>El motor de campañas ya está disponible.</h3>
        <p class="proof">Un brief a la entrada. Una campaña completa a la salida: creatividades sociales, recursos animados y landing pages. Listas para cada canal.</p>
        <div class="killstrip">CAN IT KILL <span class="brand-target"><img src="/launch-week/canva-icon.png" alt="Canva" loading="lazy" decoding="async" width="24" height="24"> CANVA?</span></div>
        <a class="watch" href="#">VER EL DROP ↗</a>
      </div>
    </article>`,
    `<article class="drop reveal" data-day="4" data-launch-day="4" id="day-4" data-secret>
      <div class="drop-meta">
        <span class="day-no">04</span>
        <span class="day">DAY 04/05</span>
        <span>13 AGO</span>
        <span data-status>PRÓXIMAMENTE</span>
      </div>
      <div class="drop-content">
        <span class="drop-code">GENERACIÓN Y EDICIÓN DE VIDEO NATIVAS</span>
        <h3>El estudio de películas de producto ya está disponible.</h3>
        <p class="proof">Una película de producto lista para campaña: cinematográfica, pulida y hecha para rendir.</p>
        <div class="killstrip">CAN IT KILL <span class="brand-target"><img src="/launch-week/higgsfield-icon.png" alt="Higgsfield" loading="lazy" decoding="async" width="24" height="24"> HIGGSFIELD?</span></div>
        <a class="watch" href="#">VER EL DROP ↗</a>
      </div>
    </article>`,
    `<article class="drop reveal" data-day="5" data-launch-day="5" id="day-5" data-secret>
      <div class="drop-meta">
        <span class="day-no">05</span>
        <span class="day">DAY 05/05</span>
        <span>14 AGO</span>
        <span data-status>PRÓXIMAMENTE</span>
      </div>
      <div class="drop-content">
        <span class="drop-code">ESCAPARATE DE LA COMUNIDAD DE OPEN DESIGN</span>
        <h3>El escaparate de la comunidad ya está disponible.</h3>
        <p class="proof">Todo lo que la comunidad construyó esta semana, en un solo lugar. Las propuestas cierran esta noche.</p>
        <div class="killstrip">SO — DID WE KILL ANYTHING?</div>
      </div>
    </article>`,
  ],
  "pt-br": [
    `<article class="drop reveal" data-day="1" data-launch-day="1" id="day-1" data-secret>
      <div class="drop-meta">
        <span class="day-no">01</span>
        <span class="day">DAY 01/05</span>
        <span>10 DE AGO</span>
        <span data-status>PUBLICADO</span>
      </div>
      <div class="drop-content">
        <span class="drop-code">ESPAÇO DE EQUIPE DO OPEN DESIGN</span>
        <h3>O Codex colaborativo está no ar.</h3>
        <p class="proof">Sua equipe e seus agentes Codex agora projetam juntos em uma mesma tela ao vivo.</p>
        <div class="killstrip">CAN THEY KILL <span class="brand-target"><img src="/launch-week/figma-icon.svg" alt="Figma" loading="lazy" decoding="async" width="24" height="24"> FIGMA?</span></div>
        <a class="watch" href="#">VER O DROP ↗</a>
      </div>
    </article>`,
    `<article class="drop reveal" data-day="2" data-launch-day="2" id="day-2" data-secret>
      <div class="drop-meta">
        <span class="day-no">02</span>
        <span class="day">DAY 02/05</span>
        <span>11 DE AGO</span>
        <img class="live-stamp" src="/launch-week/stamp-live.svg" alt="Live now" loading="lazy" decoding="async">
      </div>
      <div class="drop-content">
        <span class="drop-code">GERAÇÃO E EDIÇÃO NATIVA DE SLIDES</span>
        <h3>O estúdio de slides criativos está no ar.</h3>
        <p class="proof">Impressionantes por padrão. Fáceis de editar. Prontas em minutos.</p>
        <div class="killstrip">CAN IT KILL <span class="brand-target"><img src="/launch-week/gamma-icon.png" alt="Gamma" loading="lazy" decoding="async" width="24" height="24"> GAMMA?</span></div>
        <a class="watch" href="#">VER O DROP ↗</a>
      </div>
    </article>`,
    `<article class="drop reveal" data-day="3" data-launch-day="3" id="day-3" data-secret>
      <div class="drop-meta">
        <span class="day-no">03</span>
        <span class="day">DAY 03/05</span>
        <span>12 DE AGO</span>
        <span data-status>A SEGUIR</span>
      </div>
      <div class="drop-content">
        <span class="drop-code">GERAÇÃO E EDIÇÃO NATIVA DE IMAGENS</span>
        <h3>O motor de campanhas está no ar.</h3>
        <p class="proof">Um briefing na entrada. Uma campanha completa na saída: criativos para redes sociais, recursos animados e landing pages. Prontos para cada canal.</p>
        <div class="killstrip">CAN IT KILL <span class="brand-target"><img src="/launch-week/canva-icon.png" alt="Canva" loading="lazy" decoding="async" width="24" height="24"> CANVA?</span></div>
        <a class="watch" href="#">VER O DROP ↗</a>
      </div>
    </article>`,
    `<article class="drop reveal" data-day="4" data-launch-day="4" id="day-4" data-secret>
      <div class="drop-meta">
        <span class="day-no">04</span>
        <span class="day">DAY 04/05</span>
        <span>13 DE AGO</span>
        <span data-status>A SEGUIR</span>
      </div>
      <div class="drop-content">
        <span class="drop-code">GERAÇÃO E EDIÇÃO NATIVA DE VÍDEO</span>
        <h3>O estúdio de filmes de produto está no ar.</h3>
        <p class="proof">Um filme de produto pronto para campanha: cinematográfico, refinado e feito para performar.</p>
        <div class="killstrip">CAN IT KILL <span class="brand-target"><img src="/launch-week/higgsfield-icon.png" alt="Higgsfield" loading="lazy" decoding="async" width="24" height="24"> HIGGSFIELD?</span></div>
        <a class="watch" href="#">VER O DROP ↗</a>
      </div>
    </article>`,
    `<article class="drop reveal" data-day="5" data-launch-day="5" id="day-5" data-secret>
      <div class="drop-meta">
        <span class="day-no">05</span>
        <span class="day">DAY 05/05</span>
        <span>14 DE AGO</span>
        <span data-status>A SEGUIR</span>
      </div>
      <div class="drop-content">
        <span class="drop-code">VITRINE DA COMUNIDADE OPEN DESIGN</span>
        <h3>A vitrine da comunidade está no ar.</h3>
        <p class="proof">Tudo o que a comunidade construiu nesta semana, em um só lugar. As inscrições encerram hoje à noite.</p>
        <div class="killstrip">SO — DID WE KILL ANYTHING?</div>
      </div>
    </article>`,
  ],
  it: [
    `<article class="drop reveal" data-day="1" data-launch-day="1" id="day-1" data-secret>
      <div class="drop-meta">
        <span class="day-no">01</span>
        <span class="day">DAY 01/05</span>
        <span>10 AGO</span>
        <span data-status>PUBBLICATO</span>
      </div>
      <div class="drop-content">
        <span class="drop-code">SPAZIO DI SQUADRA OPEN DESIGN</span>
        <h3>Codex collaborativo è online.</h3>
        <p class="proof">Il tuo team e i suoi agenti Codex ora progettano insieme su un'unica canvas dal vivo.</p>
        <div class="killstrip">CAN THEY KILL <span class="brand-target"><img src="/launch-week/figma-icon.svg" alt="Figma" loading="lazy" decoding="async" width="24" height="24"> FIGMA?</span></div>
        <a class="watch" href="#">GUARDA IL DROP ↗</a>
      </div>
    </article>`,
    `<article class="drop reveal" data-day="2" data-launch-day="2" id="day-2" data-secret>
      <div class="drop-meta">
        <span class="day-no">02</span>
        <span class="day">DAY 02/05</span>
        <span>11 AGO</span>
        <img class="live-stamp" src="/launch-week/stamp-live.svg" alt="Live now" loading="lazy" decoding="async">
      </div>
      <div class="drop-content">
        <span class="drop-code">GENERAZIONE E MODIFICA NATIVA DI SLIDE</span>
        <h3>Lo studio di slide creative è online.</h3>
        <p class="proof">Splendide di default. Facili da modificare. Pronte in pochi minuti.</p>
        <div class="killstrip">CAN IT KILL <span class="brand-target"><img src="/launch-week/gamma-icon.png" alt="Gamma" loading="lazy" decoding="async" width="24" height="24"> GAMMA?</span></div>
        <a class="watch" href="#">GUARDA IL DROP ↗</a>
      </div>
    </article>`,
    `<article class="drop reveal" data-day="3" data-launch-day="3" id="day-3" data-secret>
      <div class="drop-meta">
        <span class="day-no">03</span>
        <span class="day">DAY 03/05</span>
        <span>12 AGO</span>
        <span data-status>PROSSIMAMENTE</span>
      </div>
      <div class="drop-content">
        <span class="drop-code">GENERAZIONE E MODIFICA NATIVA DI IMMAGINI</span>
        <h3>Il motore delle campagne è online.</h3>
        <p class="proof">Un brief in ingresso. Una campagna completa in uscita: creatività social, asset animati e landing page. Pronte per ogni canale.</p>
        <div class="killstrip">CAN IT KILL <span class="brand-target"><img src="/launch-week/canva-icon.png" alt="Canva" loading="lazy" decoding="async" width="24" height="24"> CANVA?</span></div>
        <a class="watch" href="#">GUARDA IL DROP ↗</a>
      </div>
    </article>`,
    `<article class="drop reveal" data-day="4" data-launch-day="4" id="day-4" data-secret>
      <div class="drop-meta">
        <span class="day-no">04</span>
        <span class="day">DAY 04/05</span>
        <span>13 AGO</span>
        <span data-status>PROSSIMAMENTE</span>
      </div>
      <div class="drop-content">
        <span class="drop-code">GENERAZIONE E MONTAGGIO VIDEO NATIVI</span>
        <h3>Lo studio di film di prodotto è online.</h3>
        <p class="proof">Un film di prodotto pronto per la campagna: cinematografico, curato e costruito per rendere.</p>
        <div class="killstrip">CAN IT KILL <span class="brand-target"><img src="/launch-week/higgsfield-icon.png" alt="Higgsfield" loading="lazy" decoding="async" width="24" height="24"> HIGGSFIELD?</span></div>
        <a class="watch" href="#">GUARDA IL DROP ↗</a>
      </div>
    </article>`,
    `<article class="drop reveal" data-day="5" data-launch-day="5" id="day-5" data-secret>
      <div class="drop-meta">
        <span class="day-no">05</span>
        <span class="day">DAY 05/05</span>
        <span>14 AGO</span>
        <span data-status>PROSSIMAMENTE</span>
      </div>
      <div class="drop-content">
        <span class="drop-code">VETRINA DELLA COMMUNITY OPEN DESIGN</span>
        <h3>La vetrina della community è online.</h3>
        <p class="proof">Tutto ciò che la community ha costruito questa settimana, in un unico posto. Le candidature chiudono stasera.</p>
        <div class="killstrip">SO — DID WE KILL ANYTHING?</div>
      </div>
    </article>`,
  ],
  tr: [
    `<article class="drop reveal" data-day="1" data-launch-day="1" id="day-1" data-secret>
      <div class="drop-meta">
        <span class="day-no">01</span>
        <span class="day">DAY 01/05</span>
        <span>10 AĞU</span>
        <span data-status>YAYINLANDI</span>
      </div>
      <div class="drop-content">
        <span class="drop-code">OPEN DESIGN EKİP ÇALIŞMA ALANI</span>
        <h3>İş birlikçi Codex yayında.</h3>
        <p class="proof">Ekibiniz ve Codex ajanları artık tek bir canlı tuval üzerinde birlikte tasarlıyor.</p>
        <div class="killstrip">CAN THEY KILL <span class="brand-target"><img src="/launch-week/figma-icon.svg" alt="Figma" loading="lazy" decoding="async" width="24" height="24"> FIGMA?</span></div>
        <a class="watch" href="#">DROP'U İZLE ↗</a>
      </div>
    </article>`,
    `<article class="drop reveal" data-day="2" data-launch-day="2" id="day-2" data-secret>
      <div class="drop-meta">
        <span class="day-no">02</span>
        <span class="day">DAY 02/05</span>
        <span>11 AĞU</span>
        <img class="live-stamp" src="/launch-week/stamp-live.svg" alt="Live now" loading="lazy" decoding="async">
      </div>
      <div class="drop-content">
        <span class="drop-code">YERLEŞİK SLAYT ÜRETİMİ VE DÜZENLEME</span>
        <h3>Yaratıcı slayt stüdyosu yayında.</h3>
        <p class="proof">Varsayılan olarak etkileyici. Düzenlemesi zahmetsiz. Dakikalar içinde hazır.</p>
        <div class="killstrip">CAN IT KILL <span class="brand-target"><img src="/launch-week/gamma-icon.png" alt="Gamma" loading="lazy" decoding="async" width="24" height="24"> GAMMA?</span></div>
        <a class="watch" href="#">DROP'U İZLE ↗</a>
      </div>
    </article>`,
    `<article class="drop reveal" data-day="3" data-launch-day="3" id="day-3" data-secret>
      <div class="drop-meta">
        <span class="day-no">03</span>
        <span class="day">DAY 03/05</span>
        <span>12 AĞU</span>
        <span data-status>SIRADAKİ</span>
      </div>
      <div class="drop-content">
        <span class="drop-code">YERLEŞİK GÖRSEL ÜRETİMİ VE DÜZENLEME</span>
        <h3>Kampanya motoru yayında.</h3>
        <p class="proof">Bir brief girin, eksiksiz bir kampanya çıksın: sosyal görseller, animasyonlu içerikler ve açılış sayfaları. Her kanal için hazır.</p>
        <div class="killstrip">CAN IT KILL <span class="brand-target"><img src="/launch-week/canva-icon.png" alt="Canva" loading="lazy" decoding="async" width="24" height="24"> CANVA?</span></div>
        <a class="watch" href="#">DROP'U İZLE ↗</a>
      </div>
    </article>`,
    `<article class="drop reveal" data-day="4" data-launch-day="4" id="day-4" data-secret>
      <div class="drop-meta">
        <span class="day-no">04</span>
        <span class="day">DAY 04/05</span>
        <span>13 AĞU</span>
        <span data-status>SIRADAKİ</span>
      </div>
      <div class="drop-content">
        <span class="drop-code">YERLEŞİK VİDEO ÜRETİMİ VE DÜZENLEME</span>
        <h3>Ürün filmi stüdyosu yayında.</h3>
        <p class="proof">Kampanyaya hazır bir ürün filmi: sinematik, özenli ve sonuç almak için tasarlanmış.</p>
        <div class="killstrip">CAN IT KILL <span class="brand-target"><img src="/launch-week/higgsfield-icon.png" alt="Higgsfield" loading="lazy" decoding="async" width="24" height="24"> HIGGSFIELD?</span></div>
        <a class="watch" href="#">DROP'U İZLE ↗</a>
      </div>
    </article>`,
    `<article class="drop reveal" data-day="5" data-launch-day="5" id="day-5" data-secret>
      <div class="drop-meta">
        <span class="day-no">05</span>
        <span class="day">DAY 05/05</span>
        <span>14 AĞU</span>
        <span data-status>SIRADAKİ</span>
      </div>
      <div class="drop-content">
        <span class="drop-code">OPEN DESIGN TOPLULUK VİTRİNİ</span>
        <h3>Topluluk vitrini yayında.</h3>
        <p class="proof">Topluluğun bu hafta ürettiği her şey tek bir yerde. Başvurular bu gece kapanıyor.</p>
        <div class="killstrip">SO — DID WE KILL ANYTHING?</div>
      </div>
    </article>`,
  ],
};
