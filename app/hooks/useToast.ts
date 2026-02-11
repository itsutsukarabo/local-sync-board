import { useState, useCallback, useRef } from "react";

export type ToastItem = {
  id: string;
  type: "success" | "error";
  message: string;
};

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (type: "success" | "error", message: string) => {
      const id = Date.now().toString();
      setToasts((prev) => [...prev, { id, type, message }]);
      const timer = setTimeout(() => {
        timersRef.current.delete(id);
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 5000);
      timersRef.current.set(id, timer);
    },
    []
  );

  return { toasts, show, dismiss };
}
