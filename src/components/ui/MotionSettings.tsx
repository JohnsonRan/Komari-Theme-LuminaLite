import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";

const MotionSettingsContext = createContext({
  iconAnimations: true,
  dataAnimations: true,
});

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
  useEffect(() => {
    document.documentElement.dataset.iconAnimations = iconAnimations ? "true" : "false";
    return () => {
      delete document.documentElement.dataset.iconAnimations;
    };
  }, [iconAnimations]);
  return (
    <MotionSettingsContext.Provider value={value}>
      {children}
    </MotionSettingsContext.Provider>
  );
}

export function useMotionSettings() {
  return useContext(MotionSettingsContext);
}
