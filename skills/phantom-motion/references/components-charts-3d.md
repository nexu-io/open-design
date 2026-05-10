# Phantom Charts 3D (Three.js + GSAP)

本指南介绍如何在 Phantom Deck 和幻象视频中创建帧同步的 3D 影视级图表。
**规则：绝对禁止使用黑盒 3D 库！所有 3D 图表必须直接调用底层 Three.js 创建 Geometry 和 Material，动效由 GSAP 主时间轴（Master Timeline）或幻灯片时间轴接管控制参数。**

## 1. 3D 发光柱状图 (Phantom 3D Neon Bar)

适用于展现宏观数据对比，视觉上表现为霓虹灯大厦从黑暗中升起。

### HTML 骨架
插入一个专门渲染 3D 场景的 WebGL 容器：
```html
<div class="chart-container-3d" id="chart-3d-bars" style="width: 100vw; height: 100vh; position: absolute; top:0; left:0; z-index:-1;"></div>
```

### JS / GSAP 渲染代码
由于需要在 WebGL 中渲染，我们必须初始化一个专属的 Three.js 场景，并把每个柱子的缩放和材质属性交给 GSAP 托管。

```javascript
window.slideAnimations = window.slideAnimations || {};

window.slideAnimations[1] = {
    create: function() {
        const tl = gsap.timeline();
        const container = document.getElementById('chart-3d-bars');
        if(!container) return tl;
        container.innerHTML = ''; // 清理上一帧
        
        // 1. 初始化 Three.js 场景
        const scene = new THREE.Scene();
        scene.fog = new THREE.FogExp2(0x000000, 0.05); // 赛博朋克深邃雾气
        
        const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 1000);
        camera.position.set(0, 10, 30);
        camera.lookAt(0, 0, 0);
        
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        // 如果使用发光滤镜需要开启后处理 (EffectComposer)，此处简化为基础渲染
        container.appendChild(renderer.domElement);
        
        // 环境光
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
        scene.add(ambientLight);
        // 霓虹点光源
        const pointLight = new THREE.PointLight(0x00f0ff, 2, 50);
        pointLight.position.set(0, 15, 10);
        scene.add(pointLight);
        
        // 2. 准备数据和材质
        const data = [15, 30, 10, 45, 20]; // 各个柱子的高度
        const spacing = 3;
        const totalWidth = (data.length - 1) * spacing;
        const startX = -totalWidth / 2;
        
        const material = new THREE.MeshStandardMaterial({
            color: 0x00f0ff,
            emissive: 0x00f0ff,
            emissiveIntensity: 0.5,
            roughness: 0.2,
            metalness: 0.8
        });
        
        const bars = [];
        
        // 3. 生成几何体
        data.forEach((val, i) => {
            // 初始高度设为 0.1 避免完全消失时的法线异常
            const geometry = new THREE.BoxGeometry(1.5, 0.1, 1.5);
            const bar = new THREE.Mesh(geometry, material);
            
            bar.position.set(startX + i * spacing, 0, 0);
            scene.add(bar);
            bars.push({ mesh: bar, targetHeight: val });
        });
        
        // 网格地面
        const gridHelper = new THREE.GridHelper(50, 50, 0x00f0ff, 0x222222);
        gridHelper.position.y = -0.05;
        gridHelper.material.transparent = true;
        gridHelper.material.opacity = 0.2;
        scene.add(gridHelper);
        
        // 4. GSAP 动效与渲染循环同步
        // 通过 GSAP 动画化自定义对象，并在 onUpdate 中更新 3D 对象
        
        // 创建一个包裹器，供 GSAP 控制高度
        const animProps = data.map(() => ({ scaleY: 0.01 }));
        
        bars.forEach((barObj, i) => {
            tl.to(animProps[i], {
                scaleY: barObj.targetHeight,
                duration: 2,
                ease: "elastic.out(1, 0.5)",
                onUpdate: () => {
                    // GSAP 更新时，重新缩放几何体 (Three.js 中缩放从中心扩散，需要调整 Y 轴位置)
                    barObj.mesh.scale.y = animProps[i].scaleY * 10; // 这里的 10 是将目标值映射为实际渲染比例
                    barObj.mesh.position.y = (0.1 * animProps[i].scaleY * 10) / 2;
                }
            }, i * 0.15); // 交错动画 Stagger
        });
        
        // 添加一个全局运镜旋转
        tl.to(camera.position, {
            x: 20,
            z: 20,
            duration: 8,
            ease: "power1.inOut"
        }, 0);
        
        tl.to(camera, {
            onUpdate: () => { camera.lookAt(0,0,0); }
        }, 0);
        
        // 5. 将 WebGL 渲染绑定到 GSAP ticker 上，确保与主时间轴同频
        const renderLoop = () => {
            renderer.render(scene, camera);
        };
        gsap.ticker.add(renderLoop);
        
        // 如果 Timeline 销毁或幻灯片切换，记得解绑 ticker
        tl.eventCallback("onComplete", () => {
            // 如果是一镜到底视频，不要销毁；但如果是幻灯片切换，可能需要清理
        });
        
        return tl;
    }
};
```
