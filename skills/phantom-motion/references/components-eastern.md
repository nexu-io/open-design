# 东方美学渲染技术栈 (Classical Eastern Aesthetics)

**🚨 核心美学与架构法则：**
市面上绝大多数特效库偏向西方赛博朋克审美，缺乏东方美学强调的“气韵、留白、顿挫和流淌”。在生成诸如中国古典哲学（易经、八卦、太极）、书法（飞白、晕染）、国画卷轴等主题动画时，大模型必须且只能调用以下三大经过极致数学优化的东方代码阵列。

---

## 模块一：古典哲学演算流 (易经/先天八卦阵列)

**美学特征**：严谨的对称、二进制数学推演、一生二、二生三。
**技术实现**：纯数学参数化 SVG 生成 + GSAP 属性补间（绝对禁止使用静态图片贴图）。

```javascript
// 影视级先天八卦 SVG 矩阵生成器
// 生成伏羲八卦的 64 爻阵列，并打上供 GSAP 调度的层级 class
function generateBaguaMatrix(color = "#D4AF37", glow = true) {
    // 伏羲先天八卦的二进制矩阵 (0为阴，1为阳)
    const baguaData = [
        [1, 1, 1], // 乾 ☰ (全阳)
        [1, 1, 0], // 兑 ☱
        [1, 0, 1], // 离 ☲
        [1, 0, 0], // 震 ☳
        [0, 0, 0], // 坤 ☷ (全阴)
        [0, 0, 1], // 艮 ☶
        [0, 1, 0], // 坎 ☵
        [0, 1, 1]  // 巽 ☴
    ];

    const R_INNER = 120; // 第一层(两仪)的半径
    const R_GAP = 35;    // 每一层爻的间距
    const YAO_WIDTH = 60;// 爻的长度
    const YAO_GAP = 12;  // 阴爻中间的断裂宽度

    let svgHTML = \`
      <svg id="bagua-array" viewBox="-300 -300 600 600" style="position:absolute; width:100vw; height:100vh; z-index: 10;">
        <defs>
          <filter id="qi-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur1"/>
            <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur2"/>
            <feMerge>
              <feMergeNode in="blur2"/>
              <feMergeNode in="blur1"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        
        <!-- 旋转的太极阵眼 -->
        <g id="taichi-center" \${glow ? 'filter="url(#qi-glow)"' : ''}>
           <circle r="60" fill="none" stroke="\${color}" stroke-width="2"/>
           <circle cx="0" cy="-30" r="8" fill="\${color}"/>
           <circle cx="0" cy="30" r="8" fill="none" stroke="\${color}" stroke-width="4"/>
        </g>
    \`;

    // 数学矩阵遍历：生成八个方位的卦象
    baguaData.forEach((gua, index) => {
        const angle = index * (360 / 8); 
        svgHTML += \`<g transform="rotate(\${angle})">\`;

        gua.forEach((yaoValue, yaoIndex) => {
            const radius = R_INNER + yaoIndex * R_GAP;
            const ringClass = 'yao-ring-' + (yaoIndex + 1); // 极度重要：层级分类

            if (yaoValue === 1) { // 阳爻
                svgHTML += \`<line class="yao \${ringClass}" x1="\${-YAO_WIDTH/2}" y1="\${-radius}" x2="\${YAO_WIDTH/2}" y2="\${-radius}" stroke="\${color}" stroke-width="8" stroke-linecap="round" \${glow ? 'filter="url(#qi-glow)"' : ''} />\`;
            } else { // 阴爻
                svgHTML += \`
                  <line class="yao \${ringClass}" x1="\${-YAO_WIDTH/2}" y1="\${-radius}" x2="\${-YAO_GAP/2}" y2="\${-radius}" stroke="\${color}" stroke-width="8" stroke-linecap="round" \${glow ? 'filter="url(#qi-glow)"' : ''} />
                  <line class="yao \${ringClass}" x1="\${YAO_GAP/2}" y1="\${-radius}" x2="\${YAO_WIDTH/2}" y2="\${-radius}" stroke="\${color}" stroke-width="8" stroke-linecap="round" \${glow ? 'filter="url(#qi-glow)"' : ''} />
                \`;
            }
        });
        svgHTML += \`</g>\`;
    });

    svgHTML += \`</svg>\`;
    document.body.insertAdjacentHTML('beforeend', svgHTML);
}

// GSAP 导演调度轨：宇宙罗盘的生衍推演
// 表现太极生两仪、两仪生四象的物理级分裂感
function animateBaguaEvolution(masterTl, startTime) {
    // 持续极缓慢旋转
    masterTl.to("#bagua-array", { rotation: 360, duration: 60, ease: "none", repeat: -1 }, 0);

    // 太极浮现
    masterTl.fromTo("#taichi-center", 
        { scale: 0, opacity: 0, rotation: -180 },
        { scale: 1, opacity: 1, rotation: 0, duration: 2, ease: "expo.out" },
        startTime
    );

    // 第一层 (太极生两仪) - 直接操控 SVG 线条的数学坐标实现撕裂拉伸感
    masterTl.from(".yao-ring-1", {
        attr: { y1: 0, y2: 0 }, 
        opacity: 0,
        duration: 1.5,
        stagger: 0.1, 
        ease: "back.out(1.2)" 
    }, startTime + 1.0);

    // 第二层 (两仪生四象)
    masterTl.from(".yao-ring-2", {
        attr: { y1: -120, y2: -120 }, 
        opacity: 0,
        duration: 1.5,
        ease: "back.out(1.2)"
    }, startTime + 2.5);

    // 第三层 (四象生八卦)
    masterTl.from(".yao-ring-3", {
        attr: { y1: -155, y2: -155 }, 
        opacity: 0,
        duration: 1.5,
        ease: "back.out(1.5)"
    }, startTime + 4.0);
}
```

---

## 模块二：气韵水墨流 (GLSL 飞白与晕染特效 Shader)

**美学特征**：枯笔在生宣上划过的“飞白”（拉丝缺墨），以及墨水随时间渗透的“墨晕”。
**技术实现**：GLSL Fragment Shader + 柏林噪声 (Perlin Noise)。

```javascript
// 东方水墨特效着色器材质生成器
// 必须挂载在包含文字贴图 (CanvasTexture) 的 PlaneGeometry 上
function generateInkShaderMaterial(textTextureMap) {
    return new THREE.ShaderMaterial({
        uniforms: {
            u_textMask: { value: textTextureMap },  // 汉字或图案的原始 Alpha 贴图
            u_time: { value: 0.0 },                 // 墨晕扩散时间
            u_progress: { value: 0.0 }              // 运笔书写进度 (0.0 ~ 1.0)
        },
        transparent: true,
        vertexShader: \`
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        \`,
        fragmentShader: \`
            uniform sampler2D u_textMask;
            uniform float u_time;
            uniform float u_progress;
            varying vec2 vUv;

            // 极简 2D 柏林噪声占位 (实际使用请用完整的 snoise)
            float snoise(vec2 p) {
                return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453) * 2.0 - 1.0;
            }

            void main() {
                vec4 texColor = texture2D(u_textMask, vUv);
                float baseAlpha = texColor.a;

                // 1. 运笔动画 (结合噪声让边缘带有顿挫感)
                float edgeNoise = snoise(vUv * 10.0) * 0.1;
                // 假设文字从左上到右下书写
                float brushFront = smoothstep(u_progress + 0.05, u_progress - 0.05, (vUv.x - vUv.y * 0.2) + edgeNoise);
                float currentAlpha = baseAlpha * brushFront;

                // 2. 飞白特效 (Dry Brush)
                // 各向异性拉伸噪声模拟笔毫刷痕
                vec2 bristleUV = vec2(vUv.x * 50.0, vUv.y * 5.0); 
                float bristleNoise = snoise(bristleUV);
                float dryMask = smoothstep(0.1, 0.9, bristleNoise);
                currentAlpha = mix(currentAlpha, currentAlpha * dryMask, 0.7); // 0.7 控制干枯程度

                // 3. 墨晕特效 (Ink Bleed)
                vec2 bleedUV = vUv * 20.0 + u_time * 0.2; 
                float bleedNoise = snoise(bleedUV);
                // 写得越早的地方，晕染得越广
                float wetTime = max(0.0, u_progress - vUv.x); 
                float bleedAmount = wetTime * 0.15; 
                float finalAlpha = smoothstep(0.5 - bleedAmount * bleedNoise, 0.5 + bleedAmount, currentAlpha);

                // 4. 墨色质感 (焦、淡层次)
                vec3 focusColor = vec3(0.02, 0.02, 0.03); // 焦墨
                vec3 edgeColor = vec3(0.4, 0.4, 0.45);    // 淡墨
                vec3 finalInkColor = mix(edgeColor, focusColor, finalAlpha * 1.5);

                gl_FragColor = vec4(finalInkColor, finalAlpha);
            }
        \`
    });
}

// GSAP 调度：驱动水墨时间流逝 (必须绑定至 GSAP 确保视频渲染确定性)
function animateCalligraphy(masterTl, inkMaterial, startTime) {
    // 挥毫泼墨：控制笔锋扫过 (1.5秒写完)
    masterTl.fromTo(inkMaterial.uniforms.u_progress, 
        { value: -0.2 }, 
        { value: 1.2, duration: 1.5, ease: "power2.inOut" }, 
        startTime
    );

    // 墨迹生长：书写完后墨水持续渗入纸张
    masterTl.fromTo(inkMaterial.uniforms.u_time,
        { value: 0.0 },
        { value: 10.0, duration: 10, ease: "none" },
        startTime
    );
}
```

---

## 模块三：立体器物流 (3D 画卷平滑展开顶点动画)

**美学特征**：圣旨、古籍画卷带有物理体积的平滑展开，光影必须符合真实 PBR 反射。
**技术实现**：Three.js `PlaneGeometry` + 拦截官方材质的 `onBeforeCompile` 注入卷曲数学公式。

```javascript
// 3D 卷轴/圣旨生成器
function generate3DScroll(textureMap, width = 20, height = 8) {
    // 必须有足够的高精细度网格才能平滑卷曲 (细分 256 段)
    const geometry = new THREE.PlaneGeometry(width, height, 256, 1);
    
    // 使用 PBR 材质保留真实光影 (宣纸质感)
    const material = new THREE.MeshStandardMaterial({
        map: textureMap,
        roughness: 0.8, 
        metalness: 0.1, 
        side: THREE.DoubleSide
    });

    const customUniforms = {
        u_progress: { value: 0.0 },       // 展开进度: 0=全卷, 1=全开
        u_scrollLength: { value: width }, // 卷轴总长
        u_radius: { value: 1.2 }          // 纸卷半径
    };

    // 拦截官方 Shader 注入卷曲算法
    material.onBeforeCompile = (shader) => {
        shader.uniforms.u_progress = customUniforms.u_progress;
        shader.uniforms.u_scrollLength = customUniforms.u_scrollLength;
        shader.uniforms.u_radius = customUniforms.u_radius;

        shader.vertexShader = \`
            uniform float u_progress;
            uniform float u_scrollLength;
            uniform float u_radius;
        \` + shader.vertexShader;

        shader.vertexShader = shader.vertexShader.replace(
            \`#include <begin_vertex>\`,
            \`
            vec3 transformed = vec3(position);
            float flatLimit = (u_scrollLength * u_progress) / 2.0;
            
            if (transformed.x > flatLimit) { // 右侧卷曲
                float over = transformed.x - flatLimit; 
                float angle = over / u_radius; 
                transformed.x = flatLimit + sin(angle) * u_radius;
                transformed.z = u_radius - cos(angle) * u_radius;
            } else if (transformed.x < -flatLimit) { // 左侧卷曲
                float over = -transformed.x - flatLimit;
                float angle = over / u_radius;
                transformed.x = -flatLimit - sin(angle) * u_radius;
                transformed.z = u_radius - cos(angle) * u_radius;
            }
            \`
        );
    };

    const scrollMesh = new THREE.Mesh(geometry, material);

    // 两根画轴 (紫檀木色)
    const axisGeo = new THREE.CylinderGeometry(1.3, 1.3, height + 1, 32);
    const axisMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.6 });
    const leftAxis = new THREE.Mesh(axisGeo, axisMat);
    const rightAxis = new THREE.Mesh(axisGeo, axisMat);
    
    const scrollGroup = new THREE.Group();
    scrollGroup.add(scrollMesh, leftAxis, rightAxis);

    return { group: scrollGroup, uniforms: customUniforms, leftAxis, rightAxis, width };
}

// GSAP 调度：展开圣旨
function animateScrollUnrolling(masterTl, scrollData, startTime, duration = 3) {
    const { uniforms, leftAxis, rightAxis, width } = scrollData;
    const targetRadius = uniforms.u_radius.value;

    masterTl.to(uniforms.u_progress, {
        value: 1.0, 
        duration: duration,
        ease: "power2.inOut", 
        onUpdate: function() {
            const progress = this.targets()[0].value;
            const flatLimit = (width * progress) / 2.0;
            
            // 画轴 X 轴位置跟着平展边缘走，Z 轴贴合卷起的圆心
            rightAxis.position.set(flatLimit, 0, targetRadius);
            leftAxis.position.set(-flatLimit, 0, targetRadius);
            
            // 物理滚动旋转计算
            const rotationAngle = flatLimit / targetRadius;
            rightAxis.rotation.y = -rotationAngle;
            leftAxis.rotation.y = rotationAngle;
        }
    }, startTime);
}
```