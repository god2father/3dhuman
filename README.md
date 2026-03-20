# 3D 人体穴位演示

基于 `React + Vite + Three.js + React Three Fiber` 的 3D 人体穴位教学演示项目，面向桌面端浏览，重点展示：

- 3D 人体上的穴位定位
- 针灸与艾灸两种演示模式
- 穴位名称、经络筛选、视角切换
- GitHub Pages 静态发布

在线访问：
[https://god2father.github.io/3dhuman/](https://god2father.github.io/3dhuman/)

## 当前能力

- 使用 `human2` 作为主展示人体模型
- 已接入针灸针与艾灸棒 3D 模型
- 针灸模式支持选中穴位后的进针演示
- 艾灸模式支持火头、烟雾、绕圈运动演示
- 穴位选中后支持中文题签展示
- 支持 GitHub Pages 发布

## 技术栈

- React 19
- Vite
- TypeScript
- Three.js
- @react-three/fiber
- @react-three/drei

## 本地开发

```bash
npm install
npm run dev
```

默认开发地址：

```text
http://127.0.0.1:5173
```

## 构建

```bash
npm run build
```

构建产物输出到：

```text
dist/
```

GitHub Pages 发布目录使用：

```text
docs/
```

## 项目结构

```text
src/
  assets/
    fonts/
    ink/
    models/
  components/
    HumanScene.tsx
  data/
    acupoints.ts
    human2Anchors.ts
  App.tsx
  style.css
docs/
  assets/
```

## 当前说明

- 穴位定位以 `human2` 模型为基准
- 一部分穴位已切到锚点定位链路
- 艾灸火头与烟雾效果仍在持续微调
- 当前版本以教学演示为主，不是医疗诊断工具

## 更新记录

详见：
[CHANGELOG.md](./CHANGELOG.md)
