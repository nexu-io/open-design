# 历史档案图与维基搜图加载引擎 (Archive Images Engine)

**🚨 核心避坑法则：**
大模型在制作人物传记（如钱学森、奥本海默）或历史科普动画时，**严禁使用无法加载的外部图床 URL，也严禁使用无版权的网图**。
必须指定生成调用本地通过维基百科 API 或公有领域下载的高清照片（`./assets/images/...`），并在渲染代码中应用以下“历史图呈现预设”与**至关重要的 LoadingManager 握手协议**。

---

## 模块一：纪录片质感流 (HTML + GSAP Ken Burns 特效)

**美学特征**：极其缓慢的推拉平移，营造历史厚重感。
**技术实现**：HTML `<img>` 标签结合 GSAP 控制 `scale` 和 `x/y`。强制附加黑白高对比滤镜。

```javascript
// 影视纪录片级老照片 Ken Burns 推拉呈现
function generateDocumentaryPhoto(masterTl, localImagePath, startTime, duration = 5) {
    const photoContainer = document.createElement('div');
    photoContainer.style.cssText = "position:absolute; top:20%; left:10%; width:40vh; height:60vh; overflow:hidden; box-shadow: 0 20px 50px rgba(0,0,0,0.5); z-index: 20;";
    
    const img = document.createElement('img');
    img.src = localImagePath;
    // 强制黑白并增加对比度，提升历史感
    img.style.cssText = "width:100%; height:100%; object-fit:cover; filter: grayscale(100%) contrast(1.2); transform-origin: center center;"; 
    
    photoContainer.appendChild(img);
    document.body.appendChild(photoContainer);

    // 相框淡入
    masterTl.fromTo(photoContainer, 
        { opacity: 0, y: 50 }, 
        { opacity: 1, y: 0, duration: 1.5, ease: "power2.out" }, 
        startTime
    );
    
    // 图片内部极缓慢的呼吸放大感 (Ken Burns)
    masterTl.fromTo(img,
        { scale: 1.0, x: 0 },
        { scale: 1.15, x: -10, duration: duration, ease: "none" },
        startTime
    );
}
```

---

## 模块二：高维科幻流 (Three.js 3D 全息玻璃卡片)

**美学特征**：老照片以 3D 玻璃全息图的形式悬浮在深邃的太空中，极具赛博史诗感。
**技术实现**：Three.js `MeshStandardMaterial` + 自发光 + 透明金属反射。

```javascript
// 3D 空间全息人物档案卡生成器
function generateHologramPhotoCard(textureLoader, localImagePath) {
    // 必须确保 textureLoader 绑定了全局的 LoadingManager
    const texture = textureLoader.load(localImagePath);
    
    const geometry = new THREE.PlaneGeometry(8, 11);
    
    // 科技感材质：基础贴图 + 微微自发光 + 透明玻璃感
    const material = new THREE.MeshStandardMaterial({
        map: texture,
        emissive: new THREE.Color(0x2244ff), // 微微发出科幻蓝光
        emissiveIntensity: 0.2,
        emissiveMap: texture, // 亮部发光，暗部不发光
        transparent: true,
        opacity: 0.9,
        roughness: 0.1,
        metalness: 0.8, // 增加类似玻璃屏幕的反射感
        side: THREE.DoubleSide
    });

    const photoCard = new THREE.Mesh(geometry, material);
    return photoCard;
}

// GSAP 调度：从深空飞出并持续悬浮
function animateHologramPhoto(masterTl, photoCard, startTime) {
    // 飞出入场
    masterTl.fromTo(photoCard.position, 
        { z: -100 }, 
        { z: -20, duration: 2, ease: "power3.out" }, 
        startTime
    );
    masterTl.fromTo(photoCard.rotation, 
        { y: Math.PI / 2 }, 
        { y: 0.1, duration: 2, ease: "power3.out" }, 
        startTime
    );
    
    // 持续的微小呼吸悬浮 (挂载到时间轴起点)
    masterTl.to(photoCard.position, {
        y: "+=1", duration: 4, yoyo: true, repeat: -1, ease: "sine.inOut"
    }, 0);
}
```

---

## 模块三：终极命门 (LoadingManager 握手协议)

**🚨 毁灭级警告：**
由于加载本地硬盘图片也需要数毫秒，如果在无头浏览器中不加锁，Hyperframes 截取的第一帧绝对是黑屏。大模型生成的代码中，**必须且只能在以下协议握手成功后，才能调用 `Hyperframes.ready()`**。

```javascript
// ==========================================
// 必须放置在整个生成代码尾部的生命周期锁！
// ==========================================

let domImagesLoaded = 0;
const allDomImages = document.querySelectorAll('img');
const totalDomImages = allDomImages.length;
let textureLoadComplete = false;

// Three.js 的贴图管理器
const loadManager = new THREE.LoadingManager();
const textureLoader = new THREE.TextureLoader(loadManager);

// 检查是否所有资源均已准备就绪
function checkReadyToRender() {
    if (domImagesLoaded === totalDomImages && textureLoadComplete) {
        // 绑定时间轴
        window.__timelines = window.__timelines || [];
        window.__timelines.push(masterTl);
        
        // 🚀 终极放行指令：通知无头浏览器开始截帧！
        if (window.Hyperframes) {
            window.Hyperframes.ready();
        } else {
            masterTl.play(); // 供本地浏览器预览
        }
    }
}

// 1. 监听所有 HTML img 的 onload
if (totalDomImages === 0) {
    domImagesLoaded = 0; // 即使没有图片也正常通行
} else {
    allDomImages.forEach(img => {
        if(img.complete) {
            domImagesLoaded++;
        } else {
            img.onload = () => { 
                domImagesLoaded++; 
                checkReadyToRender(); 
            }
        }
    });
}

// 2. 监听 Three.js 的 LoadingManager
loadManager.onLoad = function () {
    textureLoadComplete = true;
    checkReadyToRender();
};

// 触发初始检查 (应对没有任何图片资源的情况)
if (totalDomImages === 0 && Object.keys(loadManager.itemsLoaded).length === 0) {
    textureLoadComplete = true;
    checkReadyToRender();
}
```