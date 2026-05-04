# 顶级数学与公式渲染架构 (KaTeX + Three.js + SVG)

**🚨 核心版权与防坑法则：**
当主题涉及“数学”、“物理公式”、“定理证明”或“微积分”时，**严禁大模型自己编写杂乱的 LaTeX 解析器**，严禁使用无版权声明的开源 GitHub 个人特效项目。
必须且只能使用以下三大神级模块：
1. **公式文字流**：使用 MIT 协议的 `KaTeX`（结合 GSAP 提取单独节点）。
2. **2D 几何推导流**：使用原生 `SVG` + GSAP 的 `drawSVG`（或手动操作 stroke-dasharray）。
3. **3D 高维数学流**：使用 `THREE.ParametricGeometry` 生成曲面网格。

---

## 模块一：高级 LaTeX 公式逐字符浮现动画 (KaTeX + GSAP)

**适用场景**：勾股定理、薛定谔方程、爱因斯坦质能方程等任何复杂数学公式。
**依赖要求**：生成代码的 HTML `<head>` 中必须引入 KaTeX CDN。

```html
<!-- 必须引入的外部依赖 -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css">
<script src="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.js"></script>
```

```javascript
// 影视级公式动画生成器
// masterTl 是全局的 GSAP Timeline，startTime 是对齐旁白的时间戳
function generateEquationAnimation(masterTl, latexString, containerId, startTime, duration = 1.5) {
    // 1. 获取或创建容器
    let container = document.getElementById(containerId);
    if (!container) {
        container = document.createElement('div');
        container.id = containerId;
        container.style.cssText = "position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); font-size: 80px; color: white; z-index: 100;";
        document.body.appendChild(container);
    }

    // 2. 利用 KaTeX 渲染出纯粹的 HTML 结构 (不使用 Canvas，方便后续节点控制)
    katex.render(latexString, container, {
        throwOnError: false,
        displayMode: true
    });

    // 3. 剥离并获取公式里的每一个独立符号/字母 (KaTeX 会用特定 class 包裹)
    const symbols = container.querySelectorAll('.katex-html .mord, .katex-html .mbin, .katex-html .mrel, .katex-html .mopen, .katex-html .mclose');
    
    // 4. GSAP 接管时间轴：让符号像魔法一样依次浮现
    if (symbols.length > 0) {
        masterTl.fromTo(symbols,
            { opacity: 0, y: 20, filter: "blur(10px)" }, // 初始状态：模糊、下沉
            {
                opacity: 1,
                y: 0,
                filter: "blur(0px)",
                duration: 1.0, // 单个符号出现耗时
                stagger: duration / symbols.length, // 根据总时长平均分配每个字的出现间隔
                ease: "power3.out"
            },
            startTime // 与当前镜头时间严格对齐
        );
    }
}
// 使用示例: generateEquationAnimation(masterTl, "E = mc^2", "equation1", 5.5, 2);
```

---

## 模块二：完美 3D 数学曲面（微积分/物理公式 3D 化）

**适用场景**：广义相对论时空弯曲（引力井）、量子力学概率云、黎曼几何、多元微积分。
**依赖要求**：由于 `ParametricGeometry` 已从 Three.js 核心包中移除，通常需要通过 `examples/jsm/geometries/ParametricGeometry.js` 引入，但在我们的免打包单文件方案中，可以直接让大模型使用内置的数学生成器手动填充 BufferGeometry。

```javascript
// 使用原生 BufferGeometry 生成参数化 3D 曲面
function createMathSurface(mathFunction, slices = 64, stacks = 64, colorHex = 0x00ffff) {
    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    const indices = [];

    // 计算顶点
    for (let i = 0; i <= stacks; i++) {
        const v = i / stacks;
        for (let j = 0; j <= slices; j++) {
            const u = j / slices;
            // 调用传入的数学方程 (u, v 范围 0~1)
            const target = new THREE.Vector3();
            mathFunction(u, v, target);
            vertices.push(target.x, target.y, target.z);
        }
    }

    // 计算索引
    for (let i = 0; i < stacks; i++) {
        for (let j = 0; j < slices; j++) {
            const a = i * (slices + 1) + j;
            const b = i * (slices + 1) + j + 1;
            const c = (i + 1) * (slices + 1) + j;
            const d = (i + 1) * (slices + 1) + j + 1;

            indices.push(a, c, b);
            indices.push(b, c, d);
        }
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    // 科技感全息材质
    const material = new THREE.MeshBasicMaterial({
        color: colorHex,
        wireframe: true, // 网格线能完美展现拓扑美感
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending
    });

    return new THREE.Mesh(geometry, material);
}

// ============ 使用示例：引力井 (时空弯曲) ============
// const gravityWell = (u, v, target) => {
//     const x = (u - 0.5) * 20; // x 范围 -10 到 10
//     const y = (v - 0.5) * 20; // y 范围 -10 到 10
//     const z = -15.0 / (x*x + y*y + 1.0); // 物理方程
//     target.set(x, y, z);
// };
// const surfaceMesh = createMathSurface(gravityWell);
// scene.add(surfaceMesh);
// masterTl.to(surfaceMesh.rotation, { z: Math.PI * 2, duration: 20, ease: "none" }, 0);
```

---

## 模块三：2D 纯正几何推导（基于 SVG 与 GSAP）

**适用场景**：勾股定理证明、几何作图、函数抛物线绘制。需要极致的边缘锐利度。

```javascript
// 生成 2D 几何动画
function generateGeometryProofAnimation(masterTl, startTime) {
    // 1. 利用原生 SVG 画出几何图形 (例如直角三角形和三个正方形)
    const svgHTML = \`
      <svg id="math-geometry" viewBox="0 0 500 500" style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); width:80vh; height:80vh; z-index:50;">
         <!-- 初始设为隐藏，使用 GSAP stroke-dashoffset 实现绘制 -->
         <path id="triangle" d="M 200 300 L 400 300 L 400 150 Z" stroke="#00ffcc" stroke-width="3" fill="rgba(0,255,204,0.1)" />
         <rect id="squareA" x="200" y="300" width="200" height="200" stroke="#ff0055" stroke-width="2" fill="none"/>
         <rect id="squareB" x="400" y="150" width="150" height="150" stroke="#0055ff" stroke-width="2" fill="none"/>
         <!-- 可以通过数学计算得出第三个正方形的坐标 -->
      </svg>
    \`;
    document.body.insertAdjacentHTML('beforeend', svgHTML);

    // 2. 无需收费的 DrawSVGPlugin，手动计算长度实现“教鞭勾勒”效果
    const paths = ['#triangle', '#squareA', '#squareB'];
    
    paths.forEach((selector, index) => {
        const el = document.querySelector(selector);
        const length = el.getTotalLength ? el.getTotalLength() : 1000; // rect 可能没有 getTotalLength，可以用近似值或替换为 path
        
        // 初始状态
        gsap.set(el, { strokeDasharray: length, strokeDashoffset: length });
        
        // 绘制动画
        masterTl.to(el, { 
            strokeDashoffset: 0, 
            duration: 2, 
            ease: "power2.inOut" 
        }, startTime + index * 1.5); // 依次绘制
    });
}
```