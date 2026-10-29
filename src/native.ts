export const launcherMode =
  typeof window !== "undefined" && new URLSearchParams(window.location.search).get("launcher") === "1";
export function nativeRequest(type: string, args: Record<string, unknown> = {}): Promise<unknown> | null {
  const bridge = (window as unknown as {chrome?: {webview?: {
    postMessage: (message: string) => void;
    addEventListener: (name: string, listener: (event: {data: {type?: string; id?: string; error?: string; result?: unknown}}) => void) => void;
    removeEventListener: (name: string, listener: (event: {data: {type?: string; id?: string; error?: string; result?: unknown}}) => void) => void;
  }}}).chrome?.webview;
  if (!bridge) return null;
  return new Promise((resolve,reject) => {
    const id=crypto.randomUUID();
    const listener=(event: {data: {type?: string; id?: string; error?: string; result?: unknown}}) => {
      if(event.data?.type !== type + "-result" || event.data.id !== id)return;
      clearTimeout(timer);bridge.removeEventListener("message",listener);
      if(event.data.error)reject(Error(event.data.error));else resolve(event.data.result);
    };
    const timer=setTimeout(()=>{bridge.removeEventListener("message",listener);reject(Error("Request timed out. Please try again."));},type === "folder-add" ? 600000 : type === "pin-launcher" ? 120000 : 30000);
    bridge.addEventListener("message",listener);
    try{bridge.postMessage(JSON.stringify({type,id,args}));}catch(error){clearTimeout(timer);bridge.removeEventListener('message',listener);reject(error);}
  });
}
export function nativeLaunch(args: Record<string, unknown>): Promise<unknown> | null {
  if(!launcherMode)return null;
  return nativeRequest("launch",{...args,forceMaximized:localStorage.getItem("pd-force-maximized") === "true"});
}
export function nativeMessage(
  message: "dismiss" | "manage" | "ready" | "ready:light" | "ready:dark",
) {
  const bridge = (
    window as unknown as {
      chrome?: { webview?: { postMessage: (message: string) => void } };
    }
  ).chrome?.webview;
  if (bridge) {
    bridge.postMessage(message);
    return true;
  }
  return false;
}
export function openManager() {
  if (!nativeMessage("manage"))
    window.open(window.location.origin, "_blank", "noopener,noreferrer");
}
