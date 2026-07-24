# Komari-Theme-LuminaLite

[Komari](https://github.com/komari-monitor/komari) 监控面板的增强主题，在 [Komari-Theme-LuminaPlus](https://github.com/shanyang242/Komari-Theme-LuminaPlus) 的基础上进一步深度定制。

> 本仓库由 Komari-Theme-LuminaPlus 分支独立演化而来，已与上游脱离。感谢原作者 [shanyang242](https://github.com/shanyang242) 的 LuminaPlus，以及更上游 [stqfdyr](https://github.com/stqfdyr) 的 [komari-theme-Lumina](https://github.com/stqfdyr/komari-theme-Lumina) 打下的基础。

## 主要特性

### 首页
- 总览卡片（在线/离线、CPU、内存、流量等）与四种节点视图（大 / 小 / 迷你 / 列表），加载时显示与真实卡片结构对应的骨架屏。
- 分组标签、地区栏、自定义排序；支持隐藏节点。
- 背景图与卡片透明度调节，玻璃 / 实底两种质感。

### 主题设置
- 独立的主题管理页（`/?view=theme-manage`），吸顶操作栏 + 分区导航，滚动时保存 / 重置按钮始终可见，点击分区可快速跳转。
- 外观（亮 / 暗 / 跟随系统）、默认视图、背景、首页巡检、隐藏节点、小卡片显示项、延迟检测等均可配置。
- **主页延迟检测**：每个节点最多可绑定 3 个 Ping 任务（如电信 / 联通 / 移动），首页卡片同时显示这三个延迟，点击任务标签即可切换下方的延迟 / 丢包图表；每个标签底部常驻一条丢包热力色条（绿 = 无丢包、黄 / 红 = 有丢包），真的在丢包时才追加具体百分比。
- 卡片配色（各项指标颜色与暗色背景深度）全宽内嵌编辑，修改即时生效并自动保存。

### 节点详情页
- **分栏布局**：左侧固定服务器列表、右侧详情与图表，点击即可切换节点（可在主题设置中开关，窄屏自动收为单列）。
- 实时信息（状态、CPU、内存、磁盘、网络、流量、在线时长等）与系统信息展示。
- 负载图表（CPU / 内存 / 磁盘 / 网络 / 连接数 / 进程）与 Ping 延迟 / 丢包图表。
- 图表支持**点击固定 tooltip**、**滚轮缩放时间轴**，点击刷新按钮重置；内存 / 磁盘图表可切换为按字节（MB / GB）显示，实时网速支持自适应 / MB·s / Mbps 三种单位。

### 其他
- 资产统计、流量页面、离线状态提示、国旗与地区展示。
- 移动端适配：吸顶栏收为纯图标、导航横向滑动、卡片与图表针对窄屏优化。

## 致谢

- [shanyang242/Komari-Theme-LuminaPlus](https://github.com/shanyang242/Komari-Theme-LuminaPlus) — 本项目的直接来源。
- [stqfdyr/komari-theme-Lumina](https://github.com/stqfdyr/komari-theme-Lumina) — LuminaPlus 的上游。
- 也感谢 Komari 官方主题、Mochi、PurCarte 等主题项目为 Komari 生态提供的设计和实现思路。

## 参考

- [Komari](https://github.com/komari-monitor/komari)
- [Komari 主题开发文档](https://komari-document.pages.dev/)

## 本地 UI 审查

无需连接 Komari 后端也可以检查完整数据界面：

```bash
npm run dev -- --host 0.0.0.0
```

打开开发地址并追加 `?mock=1`。该模式只在 Vite 开发环境启用，会提供正常、高负载、临期、离线、多地区与多币种节点；生产构建不会包含这份测试数据。去掉查询参数即可恢复真实接口。
