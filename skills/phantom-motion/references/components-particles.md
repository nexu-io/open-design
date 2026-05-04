# 影视级 GPGPU 粒子生成组件库 (Three.js + GPUComputationRenderer)

在生成与“黑洞”、“星系”、“沙化”、“消散”、“能量汇聚”、“文字重组”或任何需要超过 10 万个粒子的物理动画主题时，**严禁**大模型使用基础的 CPU `for` 循环加上 `THREE.Points`（这会导致严重的性能瓶颈）。必须调用以下预制模具，使用 GPGPU 乒乓技术在显卡中并行计算数百万粒子的坐标与速度。

**🚨 核心避坑指南 (Hyperframes 同步约束)：**
在 GPGPU 中，绝对不能在 `requestAnimationFrame` 中随意更新物理时间。必须将 `u_time` 和 `u_progress` 绑定到 GSAP 的确定性 `onUpdate` 中，并确保 `gpuCompute.compute()` 在 GSAP 时间轴的步进内被调用，否则导出的视频粒子速度会错乱或不动。

---

## 模块一：GPGPU 底盘引擎（万能物理模拟器）

**适用场景**：所有高级 GPGPU 粒子特效的基础骨架初始化。

```javascript
// GPGPU 初始化核心逻辑模板
// 依赖: THREE.GPUComputationRenderer (需要确保通过 script 标签或 ES6 import 引入)
function initGPGPU(renderer, particleCount = 250000, velocityShaderCode, positionShaderCode) {
    // 计算纹理宽高 (如 100万粒子 = 1000x1000)
    const WIDTH = Math.ceil(Math.sqrt(particleCount));
    const gpuCompute = new GPUComputationRenderer(WIDTH, WIDTH, renderer);
    
    // 创建两张初始状态纹理：一张存位置，一张存速度
    const dtPosition = gpuCompute.createTexture();
    const dtVelocity = gpuCompute.createTexture();
    
    // 填充初始数据 (比如在宇宙中随机分布的球体)
    const posArray = dtPosition.image.data;
    const velArray = dtVelocity.image.data;
    for ( let i = 0; i < posArray.length; i += 4 ) {
        posArray[i] = (Math.random() - 0.5) * 100;   // X
        posArray[i+1] = (Math.random() - 0.5) * 100; // Y
        posArray[i+2] = (Math.random() - 0.5) * 100; // Z
        posArray[i+3] = 1.0;                         // W (生命周期或标识符)
        
        velArray[i] = 0; velArray[i+1] = 0; velArray[i+2] = 0; velArray[i+3] = 1.0;
    }
    
    // 注入物理计算着色器
    const velocityVariable = gpuCompute.addVariable('textureVelocity', velocityShaderCode, dtVelocity);
    const positionVariable = gpuCompute.addVariable('texturePosition', positionShaderCode, dtPosition);
    
    // 建立依赖关系：位置更新需要速度，速度更新可能需要当前位置
    gpuCompute.setVariableDependencies(velocityVariable,[positionVariable, velocityVariable]);
    gpuCompute.setVariableDependencies(positionVariable, [positionVariable, velocityVariable]);
    
    // 暴露 uniform 变量供外部 GSAP 控制 (极度重要：绑定确定性时间)
    positionVariable.material.uniforms['u_time'] = { value: 0.0 };
    velocityVariable.material.uniforms['u_time'] = { value: 0.0 };
    velocityVariable.material.uniforms['u_delta'] = { value: 0.016 }; // 帧间隔
    
    // 如果有目标形态贴图（用于汇聚效果），可以在这里预留 uniform
    velocityVariable.material.uniforms['u_progress'] = { value: 0.0 };
    velocityVariable.material.uniforms['textureTarget'] = { value: null };

    const error = gpuCompute.init();
    if ( error !== null ) {
        console.error( error );
    }
    
    return { gpuCompute, positionVariable, velocityVariable, WIDTH };
}

// 通用的 Position Shader (只需根据 velocity 加上 delta 即可)
const commonPositionShaderCode = \`
    uniform float u_delta;
    void main() {
        vec2 uv = gl_FragCoord.xy / resolution.xy;
        vec3 pos = texture2D(texturePosition, uv).xyz;
        vec3 vel = texture2D(textureVelocity, uv).xyz;
        
        gl_FragColor = vec4(pos + vel * u_delta, 1.0);
    }
\`;
```

---

## 模块二：具体特效物理着色器 (Physics Shaders)

不同的物理效果，对应不同的 `velocityShaderCode` (速度计算逻辑)。

### 效果 A：黑洞吸积盘 & 星系涡流 (引力 + 卷曲噪声物理)

```javascript
// 注意：实际使用时，AI 需补充标准的 curlNoise GLSL 函数实现
const blackholeVelocityShader = \`
    uniform float u_time;
    uniform float u_delta;

    // 此处应当由 AI 补全 curlNoise 等噪声函数的定义...
    vec3 curlNoise(vec3 p) {
        // 简化的占位实现，建议使用完整的 snoise 组合
        return vec3(sin(p.y*10.0+u_time), cos(p.z*10.0+u_time), sin(p.x*10.0+u_time));
    }

    void main() {
        vec2 uv = gl_FragCoord.xy / resolution.xy;
        vec3 pos = texture2D(texturePosition, uv).xyz;
        vec3 vel = texture2D(textureVelocity, uv).xyz;
        
        // 1. 黑洞引力场 (指向原点)
        vec3 directionToCenter = normalize(-pos);
        float dist = length(pos);
        float gravity = 100.0 / (dist * dist + 1.0); // 牛顿万有引力变体
        
        // 2. 洛伦兹吸积旋转力 (叉乘算出切线方向，形成旋转盘)
        vec3 rotationAxis = vec3(0.0, 1.0, 0.0);
        vec3 tangent = cross(directionToCenter, rotationAxis);
        
        // 3. 混沌噪声 (模拟星云尘埃摩擦)
        vec3 noise = curlNoise(pos * 0.1 + u_time) * 0.5;
        
        // 混合力并更新速度 (增加阻力系数 0.98 避免粒子飞散)
        vel += (directionToCenter * gravity + tangent * (50.0 / dist) + noise) * u_delta;
        vel *= 0.98;
        
        gl_FragColor = vec4(vel, 1.0);
    }
\`;
```

### 效果 B：太极图汇聚 / 物体文字组装 (SDF 吸引子与目标点插值)

让漫天飞舞的粒子，最终“听话”地汇聚成太极图或者一段 3D 文字。

```javascript
const morphingVelocityShader = \`
    uniform float u_time;
    uniform float u_progress; // GSAP 控制，0 为混乱，1 为完全拼合
    uniform float u_delta;
    uniform sampler2D textureTarget; // 存有太极或文字顶点位置的贴图
    
    // 简化的卷曲噪声占位
    vec3 curlNoise(vec3 p) {
        return vec3(sin(p.y*5.0), cos(p.z*5.0), sin(p.x*5.0));
    }

    void main() {
        vec2 uv = gl_FragCoord.xy / resolution.xy;
        vec3 pos = texture2D(texturePosition, uv).xyz;
        vec3 vel = texture2D(textureVelocity, uv).xyz;
        
        // 如果提供了目标纹理，则读取目标位置；否则原地打转
        vec3 targetPos = pos;
        // 注意：实际使用中，你需要确保 textureTarget 被正确赋值并传递
        // targetPos = texture2D(textureTarget, uv).xyz; 
        
        // 当 progress 开始增加时，计算粒子距离目标点的向量
        vec3 force = targetPos - pos;
        
        // 弹性物理公式 (Hooke's Law 弹簧效应)
        float springForce = 2.0;
        float damping = 0.85; // 阻尼，让它汇聚时不要一直震荡
        
        vel += force * springForce * u_progress * u_delta;
        
        // 加入一点微弱扰动，让汇聚过程看起来像流沙而不是死板的位移
        vel += curlNoise(pos * 0.05 + u_time) * (1.0 - u_progress) * 2.0;
        
        vel *= damping;
        gl_FragColor = vec4(vel, 1.0);
    }
\`;
```

---

## 模块三：渲染着色器 (让粒子被看到)

使用 `THREE.Points` 将 GPU 计算出的坐标渲染出来。

```javascript
function createRenderParticles(particleCount, WIDTH, positionVariable, colorHex = '#ffaa00') {
    const particleGeo = new THREE.BufferGeometry();
    // 只传入 UV 坐标 (0,0) 到 (1,1)，让顶点着色器去 GPGPU 纹理里查位置
    const uvs = new Float32Array(particleCount * 2);
    let p = 0;
    for ( let j = 0; j < WIDTH; j++ ) {
        for ( let i = 0; i < WIDTH; i++ ) {
            uvs[ p++ ] = i / ( WIDTH - 1 );
            uvs[ p++ ] = j / ( WIDTH - 1 );
        }
    }
    
    // 占位 position
    particleGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(particleCount * 3), 3));
    particleGeo.setAttribute('reference', new THREE.BufferAttribute(uvs, 2));

    const particleMat = new THREE.ShaderMaterial({
        uniforms: {
            texturePosition: { value: null }, // 每帧由 GPGPU 更新
            u_color: { value: new THREE.Color(colorHex) }
        },
        vertexShader: \`
            uniform sampler2D texturePosition;
            attribute vec2 reference;
            varying float vLife;
            void main() {
                vec3 pos = texture2D(texturePosition, reference).xyz;
                vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                gl_Position = projectionMatrix * mvPosition;
                
                // 远处的粒子变小，实现影视级景深感
                gl_PointSize = (100.0 / -mvPosition.z);
            }
        \`,
        fragmentShader: \`
            uniform vec3 u_color;
            void main() {
                // 把方形粒子画成发光的柔和圆形
                vec2 xy = gl_PointCoord.xy - vec2(0.5);
                float ll = length(xy);
                if(ll > 0.5) discard;
                
                // 核心发光公式
                float alpha = pow(1.0 - (ll * 2.0), 2.0);
                gl_FragColor = vec4(u_color, alpha * 0.6);
            }
        \`,
        transparent: true,
        blending: THREE.AdditiveBlending, // 极度重要：实现高光叠加
        depthWrite: false
    });

    const particles = new THREE.Points(particleGeo, particleMat);
    return { particles, particleMat };
}
```

---

## 模块四：Hyperframes 同步控制逻辑 (极度致命的坑)

将 GPGPU 循环强制绑定在 GSAP 的时间轴内，以满足视频导出时的确定性渲染。

```javascript
// 假设视频/运镜长 10 秒
// 必须在你的主要业务逻辑最后执行，挂载到 GSAP
function startGPGPUAnimation(gpuCompute, positionVariable, velocityVariable, particleMat, renderer, scene, camera, DURATION = 10) {
    const tl = gsap.timeline({
        paused: true,
        onUpdate: function() {
            // 1. 让 GSAP 的时间作为物理引擎的唯一时间源
            const currentTime = this.time();
            
            // 2. 更新 GPGPU 内部的环境变量
            positionVariable.material.uniforms.u_time.value = currentTime;
            velocityVariable.material.uniforms.u_time.value = currentTime;
            
            // 如果是消散重组动画，可以通过 GSAP 更新 u_progress
            if (velocityVariable.material.uniforms.u_progress) {
                 velocityVariable.material.uniforms.u_progress.value = this.progress();
            }
            
            // 3. 执行一次 GPGPU 并行计算
            gpuCompute.compute();
            
            // 4. 将计算出的新位置纹理，传给渲染器的材质
            particleMat.uniforms.texturePosition.value = gpuCompute.getCurrentRenderTarget(positionVariable).texture;
            
            // 5. 渲染当前帧
            renderer.render(scene, camera);
        }
    });

    // 让时间轴走完整个过程
    tl.to({}, { duration: DURATION });
    
    // 向 Hyperframes 暴露时间轴并通知准备完毕
    window.__timelines = window.__timelines || [];
    window.__timelines.push(tl);
    
    if (window.Hyperframes) {
        window.Hyperframes.ready();
    } else {
        // 如果只是在普通浏览器中预览，自动播放
        tl.play();
    }
}
```