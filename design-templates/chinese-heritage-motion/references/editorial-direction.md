# 配色与排印参考（前一轮观察记录）

当前实现已由 [动效结构分析](motion-direction.md) 和 `DESIGN.md` 更新为整屏影像叙事。以下保留先前参考观察，不再作为现行构图约束。

前一轮将模板调整为“展览图录 / 纸本装裱”方向，具体色值与字号是本模板的设计选择，
不声称从参考站提取了精确色值或字体文件，也不复制其图像与标识。

## 已观察的页面

- [故宫数字多宝阁](https://www.dpm.org.cn/shuziduobaoge.html)：深朱红、米白和细线展框；转译为深朱红节点章节、纸白图版和小型卷次章。
- [数字敦煌](https://www.e-dunhuang.com/)：暗场大图、纵向题签、红色入口；转译为石绿内部空间与单章节纵向标题。
- [故宫名画记](https://minghuaji.dpm.org.cn/)：页面结构包含作品、流派、作家与时代卷轴；本次主图资源未完整加载，未据此推断具体字体。
- [中华珍宝馆](https://g2.ltfc.net/)：可读取书画分类与浏览内容；取其图像优先的内容组织意图，不声称完成视觉采样。

## 用户提供的其余参考

[纹藏](https://www.wenzang.cn/)、[宋画专题](https://news.cgtn.com/event/2022/The-Song-Painted/index.html)、
[书格](https://www.shuge.org/)、[故宫数字文物库](https://digicol.dpm.org.cn/)。
本次访问出现超时、服务不可用或未完成加载，保留为后续对照，未虚构其样式细节。

## 实现落点

`styles.css` 统一色板、字号、行距、展框和断点；`scripts/compose.ts` 生成中文章名导航、
卷次题签与独立中英标题节点。`DESIGN.md` 记录可复用规则，重新生成 `example.html`。
占位图只是构图验证，不代表最终馆藏图像或已生成的建筑照片。
