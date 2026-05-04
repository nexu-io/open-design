# 完美太极图形（2D/3D）组件库

在生成与“太极”、“阴阳”、“道教”、“哲学”或相关宇宙能量主题的动画时，**严禁**大模型自行凭空计算太极的数学路径或坐标。必须从以下三大“预制模具”中选择一种最适合当前设计方案的形态，直接将代码片段注入到最终的 HTML/JS 中。

这保证了太极图形的绝对严谨和完美比例。AI 只需负责“美学决策”（选择模式、调色、设定大小、加入环境光效和运镜），核心的拓扑计算由以下片段接管。

---

## 形态一：纯正 2D 完美太极 (SVG 矢量描边流)

**适用场景**：开场动画、UI 叠加层、极简哲学感的线条自绘特效（结合方案 F、N、P、Q 等）。
**技术栈**：`SVG + GSAP (或纯 CSS 动画)`

**代码片段（注入到 JS 或直接生成 DOM）：**

```javascript
// 生成完美 2D SVG 太极图形
function generateTaiChiSVG(width, colorYin = "#000000", colorYang = "#ffffff") {
  // 基于 viewBox="0 0 100 100" 的绝对完美数学路径
  return `
    <svg class="taichi-svg" viewBox="0 0 100 100" width="${width}" height="${width}" style="position:absolute; z-index:999;">
      <!-- 阴鱼 -->
      <path d="M 50 0 A 50 50 0 0 0 50 100 A 25 25 0 0 0 50 50 A 25 25 0 0 1 50 0 Z" fill="${colorYin}" />
      <!-- 阳鱼 -->
      <path d="M 50 0 A 50 50 0 0 1 50 100 A 25 25 0 0 1 50 50 A 25 25 0 0 0 50 0 Z" fill="${colorYang}" />
      <!-- 阴眼 -->
      <circle cx="50" cy="75" r="8" fill="${colorYang}" />
      <!-- 阳眼 -->
      <circle cx="50" cy="25" r="8" fill="${colorYin}" />
    </svg>
  `;
}
```

---

## 形态二：立体 3D 实体太极 (厚度、材质、光影)

**适用场景**：太极图作为宇宙中漂浮的实体（如巨大陨石、飞船、祭坛），具有金属反光或玻璃质感，摄像机可绕其运镜（结合方案 D、E、L 等）。
**技术栈**：`Three.js (ShapeGeometry + ExtrudeGeometry)`

**代码片段（注入到 Three.js 场景构建逻辑中）：**

```javascript
// 构建阴阳双鱼的绝对数学路径并挤压成 3D 实体
function createTaiChi3D(radius = 10, thickness = 5, yinColor = 0x000000, yangColor = 0xffffff) {
    const group = new THREE.Group();

    // 定义阴鱼 Shape
    const yinShape = new THREE.Shape();
    yinShape.absarc(0, 0, radius, Math.PI/2, -Math.PI/2, false); // 右半大圆弧
    yinShape.absarc(0, -radius/2, radius/2, -Math.PI/2, Math.PI/2, true); // 下半内部弧
    yinShape.absarc(0, radius/2, radius/2, -Math.PI/2, Math.PI/2, false); // 上半外部弧

    // 定义阳鱼 Shape
    const yangShape = new THREE.Shape();
    yangShape.absarc(0, 0, radius, Math.PI/2, -Math.PI/2, true); // 左半大圆弧
    yangShape.absarc(0, radius/2, radius/2, Math.PI/2, -Math.PI/2, false); // 上半内部弧
    yangShape.absarc(0, -radius/2, radius/2, Math.PI/2, -Math.PI/2, true); // 下半外部弧

    const extrudeSettings = { depth: thickness, bevelEnabled: true, bevelSegments: 2, steps: 2, bevelSize: 0.5, bevelThickness: 0.5 };

    // 创建阴阳 3D Mesh
    const yinGeo = new THREE.ExtrudeGeometry(yinShape, extrudeSettings);
    const yangGeo = new THREE.ExtrudeGeometry(yangShape, extrudeSettings);

    const yinMat = new THREE.MeshStandardMaterial({ color: yinColor, roughness: 0.2, metalness: 0.8 });
    const yangMat = new THREE.MeshStandardMaterial({ color: yangColor, roughness: 0.2, metalness: 0.8 });

    const yinMesh = new THREE.Mesh(yinGeo, yinMat);
    const yangMesh = new THREE.Mesh(yangGeo, yangMat);
    
    // 添加鱼眼
    const eyeGeo = new THREE.CylinderGeometry(radius/6, radius/6, thickness + 1.2, 32);
    eyeGeo.rotateX(Math.PI/2);
    const yinEye = new THREE.Mesh(eyeGeo, yangMat);
    yinEye.position.set(0, -radius/2, thickness/2);
    const yangEye = new THREE.Mesh(eyeGeo, yinMat);
    yangEye.position.set(0, radius/2, thickness/2);

    group.add(yinMesh, yangMesh, yinEye, yangEye);
    return group;
}
// 使用示例: const taiChi3D = createTaiChi3D(10, 5, 0x111111, 0xeeeeee); scene.add(taiChi3D);
```

---

## 形态三：宇宙高维太极 (GLSL Shader 着色器流)

**适用场景**：太极图表现为发光的星云、能量场或高维空间门，和黑洞/星空完美融合。渲染效率极高。（结合方案 B、H、I、J 等）。
**技术栈**：`Three.js (PlaneGeometry + ShaderMaterial)`

**代码片段（纯数学 SDF 距离场片段着色器）：**

```javascript
// 生成基于 Shader 的发光高维太极
function createTaiChiShaderMesh(size = 20) {
  const taiChiVertexShader = \`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  \`;

  const taiChiFragmentShader = \`
    varying vec2 vUv;
    uniform float u_time;
    
    // 生成完美太极的数学公式函数
    float taiChiSDF(vec2 p) {
        // 旋转坐标系
        float s = sin(u_time), c = cos(u_time);
        p = vec2(c*p.x - s*p.y, s*p.x + c*p.y);
        
        // 大圆距
        float d = length(p) - 1.0;
        
        // 阴阳切分逻辑
        float a = atan(p.y, p.x);
        float v = p.y > 0.0 ? 1.0 : -1.0;
        
        // 两个中圆
        float d2 = length(p - vec2(0.0, 0.5 * v)) - 0.5;
        // 两个小圆（眼）
        float d3 = length(p - vec2(0.0, 0.5 * v)) - 0.15;

        // 复杂的阴阳布尔运算
        if (d > 0.0) return 0.0; // 外部透明
        
        float color = p.x > 0.0 ? 1.0 : 0.0;
        if (d2 < 0.0) color = v > 0.0 ? 0.0 : 1.0;
        if (d3 < 0.0) color = v > 0.0 ? 1.0 : 0.0;
        
        return color;
    }

    void main() {
        vec2 p = (vUv - 0.5) * 2.0; // 将原点移到中心 (-1 到 1)
        float tc = taiChiSDF(p);
        
        // 边缘发光与抗锯齿处理
        float alpha = smoothstep(1.0, 0.98, length(p));
        
        // 渲染黑白或发光色 (宇宙金白发光配色)
        vec3 col = mix(vec3(0.02, 0.02, 0.05), vec3(1.0, 0.9, 0.6), tc);
        
        gl_FragColor = vec4(col, alpha);
    }
  \`;

  const geometry = new THREE.PlaneGeometry(size, size);
  const material = new THREE.ShaderMaterial({
      vertexShader: taiChiVertexShader,
      fragmentShader: taiChiFragmentShader,
      uniforms: { u_time: { value: 0.0 } },
      transparent: true
  });
  
  const mesh = new THREE.Mesh(geometry, material);
  // 需要在外部的 render loop 中更新 material.uniforms.u_time.value
  mesh.userData.update = (time) => { material.uniforms.u_time.value = time; };
  return mesh;
}
// 使用示例: const taiChiAura = createTaiChiShaderMesh(20); scene.add(taiChiAura);
```
