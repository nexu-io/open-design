# 人文艺术主题库 (Editorial Themes)

本库定义了 5 套汲取自《Monocle》及归藏风格的人文艺术预设主题。

## 🖋 1. 墨水经典 (Ink Classic)
**调性**: 商务巅峰、冷静、纯粹。
```css
:root {
  --ink: #000000;
  --paper: #ffffff;
  --accent: #fc3d21; /* NASA Red */
  --font-serif: 'Playfair Display', 'Noto Serif SC', serif;
  --font-sans: 'Inter', 'Noto Sans SC', sans-serif;
}
```

## 🌊 2. 靛蓝瓷 (Azure Porcelain)
**调性**: 科技研究、深空、学术严谨。
```css
:root {
  --ink: #ffffff;
  --paper: #001d3d;
  --accent: #00f0ff; /* Neon Cyan */
}
```

## 🌿 3. 森林墨 (Forest Ink)
**调性**: 自然呼吸、环保、柔和叙事。
```css
:root {
  --ink: #1a2f23;
  --paper: #f2f7f4;
  --accent: #2a9d8f;
}
```

## 🍂 4. 牛皮纸 (Vintage Kraft)
**调性**: 怀旧、人文深度、手工质感。
```css
:root {
  --ink: #3c2a21;
  --paper: #e5d3b3;
  --accent: #8b4513;
}
```

## 🌙 5. 沙丘 (Desert Dune)
**调性**: 艺术先锋、极简主义、光影律动。
```css
:root {
  --ink: #e0d8c0;
  --paper: #1a1a1a;
  --accent: #d4af37; /* Gold */
}
```
---
**强制规则**:
- 一份路演只允许使用一套主题，严禁中途混搭。
- 背景 GPGPU 粒子的主色调必须跟随 `--accent` 变量。
