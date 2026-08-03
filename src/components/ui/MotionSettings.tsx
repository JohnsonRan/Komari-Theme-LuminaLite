import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";

export interface MotionSettingsValue {
  iconAnimations: boolean;
  dataAnimations: boolean;
}

const MotionSettingsContext = createContext<MotionSettingsValue>({
  iconAnimations: true,
  dataAnimations: true,
});

function restoreAttribute(root: HTMLElement, name: string, value: string | null) {
  if (value === null) root.removeAttribute(name);
  else root.setAttribute(name, value);
}

/** 把两类动效开关同步到根节点，并在 effect cleanup 时恢复接管前的值。 */
export function applyMotionDataset(root: HTMLElement, value: MotionSettingsValue): () => void {
  const previousIconAnimations = root.getAttribute("data-icon-animations");
  const previousDataAnimations = root.getAttribute("data-data-animations");
  root.setAttribute("data-icon-animations", value.iconAnimations ? "true" : "false");
  root.setAttribute("data-data-animations", value.dataAnimations ? "true" : "false");
  return () => {
    restoreAttribute(root, "data-icon-animations", previousIconAnimations);
    restoreAttribute(root, "data-data-animations", previousDataAnimations);
  };
}

export function MotionSettingsProvider({
  iconAnimations,
  dataAnimations,
  children,
}: {
  iconAnimations: boolean;
  dataAnimations: boolean;
  children: ReactNode;
}) {
  const value = useMemo(
    () => ({ iconAnimations, dataAnimations }),
    [dataAnimations, iconAnimations],
  );

  useEffect(
    () => applyMotionDataset(document.documentElement, value),
    [value],
  );

  return (
    <MotionSettingsContext.Provider value={value}>
      {children}
    </MotionSettingsContext.Provider>
  );
}

export function useMotionSettings() {
  return useContext(MotionSettingsContext);
}
