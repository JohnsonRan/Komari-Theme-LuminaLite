/* 与 tokens.css 的 --motion-* 刻度一一对应;JS(WAAPI/FLIP)侧从这份常量取值,
   改动时必须与 tokens.css 同步(motion 相关测试会校验对齐)。 */
export const MOTION_DURATION = {
  instant: 80,
  fast: 140,
  normal: 220,
  slow: 320,
} as const;

export const MOTION_EASE = {
  standard: "cubic-bezier(0.2, 0, 0, 1)",
  enter: "cubic-bezier(0.16, 1, 0.3, 1)",
  exit: "cubic-bezier(0.4, 0, 1, 1)",
  /** 与 AnimatedValue 数值滚动(index.css 的 native-roll keyframes)同一条曲线。 */
  emphasized: "cubic-bezier(0.22, 0.72, 0.22, 1)",
} as const;

/** 与 tokens.css 的 --motion-count-flip-max 同值:超过这个数量的重排直接跳转不播动画。 */
export const MOTION_COUNT_FLIP_MAX = 24;

export const PREFERS_REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
