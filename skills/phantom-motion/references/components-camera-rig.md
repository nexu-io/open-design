# 电影级 GSAP 空间运镜系统 (Narrative-Driven Camera Rig)

**🚨 导演级核心法则：**
99% 的 3D 动画毁于镜头乱飞。本系统要求大模型在生成任何 Three.js 动画时，必须遵守**“克制，才是最高级的高级”**原则。没有明确的叙事动机，坚决不动镜头。运镜必须与旁白（字幕时间轴）完美贴合。

**严禁**直接通过 `camera.position.set()` 和 `camera.lookAt()` 进行生硬的补间动画（极易产生万向锁和抽搐）。必须使用以下基于替身（Proxy）的 **Camera Rig 轨道车架构**。

---

## 模块一：核心底盘（摄像机替身绑骨）

在场景初始化时，必须建立机位替身和焦点替身，并在渲染循环或 GSAP onUpdate 中严格同步。

```javascript
// 影视级摄像机绑骨（Rig）初始化
function initCameraRig(scene, fov = 45, initialZ = 100) {
    // 真实的摄像机
    const camera = new THREE.PerspectiveCamera(fov, window.innerWidth / window.innerHeight, 0.1, 10000);
    
    // 机位替身（代替轨道车 Dolly）
    const cameraProxy = new THREE.Object3D();
    cameraProxy.position.set(0, 0, initialZ); // 初始机位
    scene.add(cameraProxy);

    // 焦点替身（代替演员/目标物的位置 LookAt）
    const lookAtProxy = new THREE.Object3D();
    lookAtProxy.position.set(0, 0, 0); // 初始看着原点
    scene.add(lookAtProxy);

    // 更新函数：在 GSAP timeline onUpdate 或 requestAnimationFrame 中调用
    const updateCameraRig = () => {
        camera.position.copy(cameraProxy.position);
        camera.lookAt(lookAtProxy.position);
    };

    return { camera, cameraProxy, lookAtProxy, updateCameraRig };
}
```

---

## 模块二：四大经典电影级运镜手法

大模型在规划运镜时，**只能从以下四种手法中选择**，彻底杜绝幻觉乱飞。

### 1. 静态悬浮 (The Cinematic Static / Drift)
- **叙事动机**：旁白正在密集输出硬核知识点，观众需要绝对专注。
- **视觉感受**：极其微弱的太空失重漂浮感，近乎静止。

```javascript
function applyStaticDrift(tl, cameraProxy, startTime, duration, pushAmount = 5) {
    // 缓慢的线性推进，创造史诗感。ease 必须是 "none" (宇宙惯性无加减速)
    tl.to(cameraProxy.position, { 
        z: \`-=\${pushAmount}\`, // 极小幅度的 Dolly In
        duration: duration, 
        ease: "none" 
    }, startTime);
}
```

### 2. 深渊拉近 (The Tension Push-In)
- **叙事动机**：剧本到了高潮，揭示震撼真相，压迫感逐渐增强。
- **视觉感受**：镜头缓慢但坚定地推向目标物脸上。

```javascript
function applyTensionPushIn(tl, cameraProxy, targetPos, startTime, duration, offsetZ = 20) {
    // ease 必须是 "power2.inOut" (起步丝滑，中间加速，结尾稳稳停住)
    tl.to(cameraProxy.position, { 
        x: targetPos.x, 
        y: targetPos.y, 
        z: targetPos.z + offsetZ, // 逼近到物体前方
        duration: duration, 
        ease: "power2.inOut" 
    }, startTime);
}
```

### 3. 史诗环绕 (The Orbital Parallax)
- **叙事动机**：展示庞然大物的全貌，感叹宏大与浩瀚。
- **视觉感受**：机位在一个圆弧轨道上平滑移动。

```javascript
function applyOrbitalParallax(tl, cameraProxy, radius, startAngle, rotateAngle, startTime, duration) {
    // 使用 onUpdate 手动计算极坐标绕 Y 轴旋转
    tl.to({}, {
        duration: duration,
        ease: "sine.inOut",
        onUpdate: function() {
            const progress = this.progress();
            const angle = startAngle + progress * rotateAngle; 
            cameraProxy.position.x = Math.sin(angle) * radius;
            cameraProxy.position.z = Math.cos(angle) * radius;
        }
    }, startTime);
}
```

### 4. 视线转移 / 焦点拉扯 (The Rack Focus / LookAt Shift)
- **叙事动机**：旁白提及两个事物的对比，引导观众转移视线。
- **视觉感受**：机位不动，摄像机“转头”或焦点平移。

```javascript
function applyLookAtShift(tl, lookAtProxy, newTargetPos, startTime, duration = 3) {
    // 控制焦点替身平移到新目标
    tl.to(lookAtProxy.position, { 
        x: newTargetPos.x, 
        y: newTargetPos.y, 
        z: newTargetPos.z, 
        duration: duration, 
        ease: "power3.inOut" // 转头动作要利索且柔和
    }, startTime);
}
```

---

## 模块三：分镜头脚本解析与 Timeline 串联 (Master Timeline)

**最核心的 AI 导演逻辑**：
大模型必须先分析传入的字幕 JSON 数据，为其划分出“镜头段落 (Shot List)”，并将上述四大运镜手法，通过 `startTime` 精确地插入到全局的 `GSAP Timeline` 中。

```javascript
// AI 导演生成 Master Timeline 的架构模板
// shotList 需由大模型根据字幕的时间戳和情感起伏推导生成
function generateMasterTimeline(shotList, targetMap, cameraRig) {
    const { cameraProxy, lookAtProxy, updateCameraRig } = cameraRig;
    
    // 建立主时间轴，绑定相机更新函数
    const masterTl = gsap.timeline({ 
        paused: true, 
        onUpdate: updateCameraRig 
    });
    
    // 遍历 AI 规划的镜头列表
    shots.forEach((shot) => {
        const targetPos = targetMap[shot.targetId] ? targetMap[shot.targetId].position : new THREE.Vector3(0,0,0);
        
        switch(shot.cameraMoveType) {
            case 'static_drift':
                // 悬浮：机位轻微向前，焦点锁定目标
                masterTl.to(lookAtProxy.position, { x: targetPos.x, y: targetPos.y, z: targetPos.z, duration: 1, ease: "power1.inOut" }, shot.startTime);
                applyStaticDrift(masterTl, cameraProxy, shot.startTime, shot.duration);
                break;
                
            case 'push_in':
                // 强调：向目标平滑推近
                masterTl.to(lookAtProxy.position, { x: targetPos.x, y: targetPos.y, z: targetPos.z, duration: 1 }, shot.startTime);
                applyTensionPushIn(masterTl, cameraProxy, targetPos, shot.startTime, shot.duration, shot.offsetZ || 30);
                break;
                
            case 'orbit':
                // 环绕展示
                masterTl.to(lookAtProxy.position, { x: targetPos.x, y: targetPos.y, z: targetPos.z, duration: 2, ease: "power2.inOut" }, shot.startTime);
                applyOrbitalParallax(masterTl, cameraProxy, shot.radius || 100, shot.startAngle || 0, shot.rotateAngle || Math.PI/4, shot.startTime, shot.duration);
                break;
                
            case 'focus_shift':
                // 视线转移
                applyLookAtShift(masterTl, lookAtProxy, targetPos, shot.startTime, shot.duration);
                break;
        }
    });

    // 将总轴交给引擎
    window.__timelines = window.__timelines || [];
    window.__timelines.push(masterTl);
    
    if (window.Hyperframes) {
        window.Hyperframes.ready();
    } else {
        masterTl.play();
    }
    
    return masterTl;
}
```