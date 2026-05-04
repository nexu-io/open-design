# 完美 3D 星球生成组件库 (Three.js)

在生成与“地球”、“宇宙”、“行星”、“航空航天”或“全球数据网络”等主题的动画时，**严禁**大模型使用基础的、无贴图的简单球体（如低配 MeshBasicMaterial 球）。必须从以下预制模具中选择合适的模块，构建电影级或航天局级别的全息宇宙。

**🚨 核心避坑指南 (LoadingManager 强制约束)：**
在包含任何 `TextureLoader` 的代码中，必须使用 `THREE.LoadingManager`，并在 `onLoad` 回调中进行动画初始化，以确保渲染引擎截取帧之前纹理已完全就绪。

---

## 模块一：极致写实星球（PBR 与多重贴图流）

**核心技术**：`MeshStandardMaterial` + `TextureLoader` + 多通道贴图（Diffuse, Normal, Roughness, Displacement）
**适用场景**：真实太阳系行星展示、宇宙纪录片。

```javascript
// 生成写实星球 (需确保纹理路径有效)
function createRealisticPlanet(name, radius, texturePath, loadManager) {
    const textureLoader = new THREE.TextureLoader(loadManager);
    const planetGroup = new THREE.Group();

    // 基础高精度球体 (128x128 网格，支持真实地形凹凸)
    const geometry = new THREE.SphereGeometry(radius, 128, 128);
    
    // 加载 PBR 材质贴图 (假设资源存在，需大模型自行指定正确的外部可用纹理 URL 或内置占位)
    // 提示大模型：在实际生成中，如果没有真实贴图路径，可使用基于 Canvas 的程序化纹理生成器，
    // 或调用此处展示的材质逻辑框架。
    const material = new THREE.MeshStandardMaterial({
        map: textureLoader.load(\`\${texturePath}/\${name}_color.jpg\`),
        normalMap: textureLoader.load(\`\${texturePath}/\${name}_normal.png\`),
        roughnessMap: textureLoader.load(\`\${texturePath}/\${name}_roughness.jpg\`),
        metalnessMap: textureLoader.load(\`\${texturePath}/\${name}_specular.png\`),
        displacementMap: textureLoader.load(\`\${texturePath}/\${name}_displacement.png\`),
        displacementScale: 0.1
    });
    
    const planet = new THREE.Mesh(geometry, material);
    planetGroup.add(planet);

    // 若为地球，追加独立自转的透明云层
    if (name === 'earth') {
        const cloudGeo = new THREE.SphereGeometry(radius * 1.01, 64, 64);
        const cloudMat = new THREE.MeshLambertMaterial({
            map: textureLoader.load(\`\${texturePath}/earth_clouds.png\`),
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending
        });
        const clouds = new THREE.Mesh(cloudGeo, cloudMat);
        clouds.name = 'clouds'; // 方便 GSAP 获取并旋转
        planetGroup.add(clouds);
    }

    return planetGroup;
}
```

---

## 模块二：太阳与大气层边缘光（Fresnel 菲涅尔着色器流）

**适用场景**：赋予写实地球或恒星迷人的发光大气边缘。

```javascript
// 创建菲涅尔大气层包裹网
function createAtmosphere(radius, glowColor = "vec3(0.3, 0.6, 1.0)") {
    const vertexShader = \`
      varying vec3 vNormal;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    \`;
    
    const fragmentShader = \`
      varying vec3 vNormal;
      void main() {
        // 核心公式：点乘视向量和法向量计算边缘强度
        float intensity = pow(0.6 - dot(vNormal, vec3(0, 0, 1.0)), 4.0);
        gl_FragColor = vec4(\${glowColor}, 1.0) * intensity;
      }
    \`;

    // 创建比星球大 20% 的包围网
    const atmosphereGeo = new THREE.SphereGeometry(radius * 1.2, 64, 64);
    const atmosphereMat = new THREE.ShaderMaterial({
        vertexShader: vertexShader,
        fragmentShader: fragmentShader,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide, // 渲染背面，形成包裹感
        transparent: true
    });
    
    return new THREE.Mesh(atmosphereGeo, atmosphereMat);
}
// 使用: planetGroup.add(createAtmosphere(10, "vec3(0.2, 0.5, 1.0)"));
```

---

## 模块三：土星与土星环（RingGeometry + Alpha 映射）

**适用场景**：生成带有透明缝隙的真实星环结构。

```javascript
function createSaturnRings(innerRadius, outerRadius, texturePath, loadManager) {
    const textureLoader = new THREE.TextureLoader(loadManager);
    const ringGeo = new THREE.RingGeometry(innerRadius, outerRadius, 128);
    
    // 修复 UV 映射，使一维纹理绕环形贴合
    let pos = ringGeo.attributes.position;
    let v3 = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
        v3.fromBufferAttribute(pos, i);
        ringGeo.attributes.uv.setXY(i, v3.length() < (innerRadius + outerRadius)/2 ? 0 : 1, 1);
    }

    const ringMat = new THREE.MeshStandardMaterial({
        map: textureLoader.load(\`\${texturePath}/saturn_ring_color.png\`),
        alphaMap: textureLoader.load(\`\${texturePath}/saturn_ring_alpha.png\`), // 控制透明缝隙
        transparent: true,
        side: THREE.DoubleSide
    });
    
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2; // 躺平
    return ring;
}
```

---

## 模块四：全息高亮地球与飞行轨迹（科幻/导览风格）

**适用场景**：展示全球数据流、跨国业务、赛博朋克数据网络。

### 1. 3D 网格全息地球

```javascript
function createHoloEarth(radius, color = 0x00ffcc) {
    const holoGeo = new THREE.SphereGeometry(radius, 64, 64);
    const holoMat = new THREE.MeshBasicMaterial({
        color: color,
        wireframe: true,
        transparent: true,
        opacity: 0.15,
        blending: THREE.AdditiveBlending
    });
    return new THREE.Mesh(holoGeo, holoMat);
}
```

### 2. 高级飞行轨迹（基于经纬度抛物线）

```javascript
// 绘制从地点A飞向地点B的抛物线轨迹
function createFlightTrajectory(startLat, startLng, endLat, endLng, earthRadius, lineColor = 0xff00aa) {
    // 经纬度转 3D 球面坐标工具
    function getPosFromLatLng(lat, lng, r) {
        const phi = (90 - lat) * (Math.PI / 180);
        const theta = (lng + 180) * (Math.PI / 180);
        return new THREE.Vector3(
            -(r * Math.sin(phi) * Math.cos(theta)),
            r * Math.cos(phi),
            r * Math.sin(phi) * Math.sin(theta)
        );
    }

    const startPos = getPosFromLatLng(startLat, startLng, earthRadius);
    const endPos = getPosFromLatLng(endLat, endLng, earthRadius);
    
    // 计算控制点：让轨迹飞出大气层再落回
    const midPoint = startPos.clone().lerp(endPos, 0.5);
    const distance = startPos.distanceTo(endPos);
    midPoint.normalize().multiplyScalar(earthRadius + distance * 0.3);

    // 三次样条曲线
    const curve = new THREE.CatmullRomCurve3([startPos, midPoint, endPos]);
    
    // 管道几何体
    const tubeGeo = new THREE.TubeGeometry(curve, 64, 0.05, 8, false);
    const tubeMat = new THREE.MeshBasicMaterial({
        color: lineColor,
        blending: THREE.AdditiveBlending,
        transparent: true
    });
    
    const trajectoryLine = new THREE.Mesh(tubeGeo, tubeMat);
    
    // 运镜核心：可通过 GSAP 改变 geometry.setDrawRange(0, count) 实现轨迹动态生长动画
    trajectoryLine.userData.animateDraw = (progress) => {
        // progress 从 0 到 1
        const count = tubeGeo.index ? tubeGeo.index.count : tubeGeo.attributes.position.count;
        tubeGeo.setDrawRange(0, Math.floor(progress * count));
    };
    
    return trajectoryLine;
}
```

---

## 生命周期模板 (强制使用)

任何调用了上述包含外部贴图的模块，必须按照以下生命周期组织代码，通知外部引擎可以开始渲染。

```javascript
const loadManager = new THREE.LoadingManager();

// 构建你的场景、调用模块...
// const planet = createRealisticPlanet('earth', 10, 'https://example.com/textures', loadManager);
// scene.add(planet);

loadManager.onLoad = function () {
    console.log("所有资源加载完毕！");
    
    // 1. 初始化 GSAP 时间轴，定义飞行线生长动画或星球自转
    // const tl = gsap.timeline({ paused: true });
    // ... 
    
    // 2. 将控制权交给全局 (如 Hyperframes)
    // window.__timelines = [tl];
    // if (window.Hyperframes) window.Hyperframes.ready();
    
    // 对于独立 HTML，这里直接播放
    // tl.play();
};
```