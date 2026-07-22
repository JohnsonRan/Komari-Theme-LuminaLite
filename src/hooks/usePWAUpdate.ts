import { useRegisterSW } from "virtual:pwa-register/react";

export function usePWAUpdate() {
  const { needRefresh, updateServiceWorker } = useRegisterSW({
    onRegistered(registration) {
      if (!registration) return;
      // Check for updates every 60 minutes
      setInterval(() => registration.update(), 60 * 60 * 1000);
    },
  });

  const doUpdate = async () => {
    await updateServiceWorker(true);
    window.location.reload();
  };

  return { needRefresh: needRefresh[0], doUpdate };
}
