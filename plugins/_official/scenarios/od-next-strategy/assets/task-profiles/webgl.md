# WebGL 交付 Skill v3.0.0

交付真实 GPU / shader / 3D 交互的 HTML，route=webgl-html、kind=interactive。按需求选一个适当的 WebGL 技术，不用静态图片冒充实时效果。

使用 canvas.getContext('webgl2')，能力不足时给出可读提示或可用的 webgl 回退。编译 shader 时记录编译错误，DPR 最大为 2，窗口变化时同步 canvas 分辨率和 viewport。用 requestAnimationFrame 管理动画，页面隐藏时减少计算，释放不用的 GPU 资源。文字覆盖层保持可读与键盘可达。

相机与物体必须分离：模型位于原点时，视图应移至合适距离，不能让相机落在几何体内部。根据画布宽高比调整构图，让主体完整可见并保留边距。暂停时停止无效绘制，恢复时再启动动画；页面隐藏时暂停 requestAnimationFrame，避免后台持续占用 GPU。

优先自包含单 HTML；实际需要 Worker/WASM 时声明和打包依赖。宿主能识别 WebGL/Worker/SharedArrayBuffer 并提供 powered preview，不绕过宿主沙箱。依据用户需求实现质量与性能边界，写完交付，不声称已完成额外 GPU 兼容测试。
