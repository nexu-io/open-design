# Phantom Charts 2D (D3.js + GSAP)

本指南介绍如何在 Phantom Deck 和幻象视频中创建帧同步的 2D 影视级图表。
**规则：绝对禁止使用 ECharts 或 Chart.js！所有图表的数学计算由 D3.js 负责，动画渲染完全由 GSAP 主时间轴（Master Timeline）或幻灯片时间轴（Slide Timeline）接管。**

## 1. D3 流体折线图 (Phantom Fluid Line Chart)

适用于时间序列、趋势等数据的呈现。特点是极其平滑的样条曲线，配合 SVG 发光滤镜。

### HTML 骨架
在相关的幻灯片 `<div class="phantom-slide">` 中插入图表容器。
```html
<div class="chart-container" id="chart-revenue" style="width: 800px; height: 400px; position: relative;"></div>
```

### SVG 滤镜定义 (放入全局 SVG 定义中)
```html
<svg width="0" height="0" style="position:absolute;z-index:-1;">
  <defs>
    <filter id="neon-glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="8" result="blur" />
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
</svg>
```

### JS / GSAP 渲染代码
在生成图表的步骤中加入以下逻辑，并将 GSAP 动画放入当前幻灯片的生成器中：

```javascript
window.slideAnimations = window.slideAnimations || {};

window.slideAnimations[0] = {
    create: function() {
        const tl = gsap.timeline();
        
        // 1. 初始化数据与 D3 设置
        const data = [10, 25, 40, 20, 60, 45, 90, 80, 110];
        const container = document.getElementById('chart-revenue');
        if(!container) return tl;
        container.innerHTML = ''; // 清空
        
        const width = 800, height = 400;
        const margin = {top: 20, right: 20, bottom: 30, left: 40};
        const innerWidth = width - margin.left - margin.right;
        const innerHeight = height - margin.top - margin.bottom;
        
        // 2. D3 比例尺
        // 注意：如果你所在的工程没有 d3 环境，请使用 <script src="https://d3js.org/d3.v7.min.js"></script>
        const x = d3.scaleLinear().domain([0, data.length - 1]).range([0, innerWidth]);
        const y = d3.scaleLinear().domain([0, d3.max(data)]).range([innerHeight, 0]);
        
        // 3. 极其平滑的样条曲线生成器
        const lineGen = d3.line()
            .x((d, i) => x(i))
            .y(d => y(d))
            .curve(d3.curveCatmullRom.alpha(0.5)); // 影视级平滑曲线
            
        const areaGen = d3.area()
            .x((d, i) => x(i))
            .y0(innerHeight)
            .y1(d => y(d))
            .curve(d3.curveCatmullRom.alpha(0.5));
            
        // 4. 构建 SVG DOM
        const svg = d3.select(container).append("svg")
            .attr("width", width)
            .attr("height", height)
            .append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);
            
        // 渐变定义
        const defs = svg.append("defs");
        const gradient = defs.append("linearGradient")
            .attr("id", "area-grad")
            .attr("x1", "0%").attr("y1", "0%")
            .attr("x2", "0%").attr("y2", "100%");
        gradient.append("stop").attr("offset", "0%").attr("stop-color", "var(--color-primary, #00f0ff)").attr("stop-opacity", 0.5);
        gradient.append("stop").attr("offset", "100%").attr("stop-color", "var(--color-primary, #00f0ff)").attr("stop-opacity", 0);
            
        // 面积图 (初始透明度为 0)
        const areaPath = svg.append("path")
            .datum(data)
            .attr("class", "chart-area")
            .attr("fill", "url(#area-grad)")
            .attr("d", areaGen)
            .attr("opacity", 0);
            
        // 折线图
        const linePath = svg.append("path")
            .datum(data)
            .attr("class", "chart-line")
            .attr("fill", "none")
            .attr("stroke", "var(--color-primary, #00f0ff)")
            .attr("stroke-width", 4)
            .attr("filter", "url(#neon-glow)")
            .attr("d", lineGen);
            
        // 5. 准备 GSAP 动画所需的 Stroke 属性
        const totalLength = linePath.node().getTotalLength();
        linePath.attr("stroke-dasharray", totalLength)
                .attr("stroke-dashoffset", totalLength);
                
        // 6. 注入 GSAP 动画到 Timeline 中
        tl.to(linePath.node(), {
            strokeDashoffset: 0,
            duration: 2.5,
            ease: "power3.inOut"
        });
        
        tl.to(areaPath.node(), {
            opacity: 1,
            duration: 1.5,
            ease: "power2.out"
        }, "-=1.0"); // 在线画到一半时升起背景光晕
        
        return tl;
    }
};
```
