import {
  ElectronLaunchHandoffQueue,
  findElectronProtocolUrl,
  parseElectronInstallerReplacementData,
  type ElectronLaunchIngress,
} from "./single-instance.js";

type LaunchEvents = {
  "open-url": [Electron.Event, string];
  "second-instance": [Electron.Event, string[], string, unknown];
  activate: [];
  "will-quit": [];
};

type ElectronLaunchIngressApp = Readonly<{
  on<K extends keyof LaunchEvents>(event: K, listener: (...args: LaunchEvents[K]) => void): unknown;
  removeListener<K extends keyof LaunchEvents>(event: K, listener: (...args: LaunchEvents[K]) => void): unknown;
}>;

/** Register before identity acquisition or Capsule loading. Only typed ingress
 * crosses into the Capsule; Electron events and arbitrary argv stay physical. */
export function installElectronLaunchIngress(input: Readonly<{
  app: ElectronLaunchIngressApp;
  protocol: string;
  argv: readonly string[];
}>) {
  const queue = new ElectronLaunchHandoffQueue(input.protocol);
  let receiver: ((ingress: ElectronLaunchIngress) => boolean) | null = null;
  let disposed = false;
  const receive = (ingress: ElectronLaunchIngress) => {
    if (disposed) return;
    if (receiver?.(ingress) !== true) queue.enqueue(ingress);
  };
  const initial = findElectronProtocolUrl(input.protocol, input.argv);
  if (initial != null) queue.enqueue({ type: "deep-link", source: "initial-argv", url: initial });
  const openUrl = (event: Electron.Event, url: string) => {
    event.preventDefault();
    if (findElectronProtocolUrl(input.protocol, [url]) != null) {
      receive({ type: "deep-link", source: "mac-open-url", url });
    }
  };
  const secondInstance = (_event: Electron.Event, argv: string[], _cwd: string, additionalData: unknown) => {
    if (parseElectronInstallerReplacementData(additionalData) != null) return;
    const url = findElectronProtocolUrl(input.protocol, argv);
    receive(url == null ? { type: "focus", source: "second-instance" }
      : { type: "deep-link", source: "second-instance", url });
  };
  const activate = () => receive({ type: "focus", source: "app-activate" });
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    receiver = null;
    queue.cancel();
    input.app.removeListener("open-url", openUrl);
    input.app.removeListener("second-instance", secondInstance);
    input.app.removeListener("activate", activate);
    input.app.removeListener("will-quit", dispose);
  };
  input.app.on("open-url", openUrl);
  input.app.on("second-instance", secondInstance);
  input.app.on("activate", activate);
  input.app.on("will-quit", dispose);
  return Object.freeze({
    queue,
    /** Returning false keeps the event queued while startup owns presentation. */
    bindReceiver(next: (ingress: ElectronLaunchIngress) => boolean) {
      if (disposed) throw new Error("Electron launch ingress is closed");
      if (receiver != null) throw new Error("Electron launch ingress already has a receiver");
      receiver = next;
    },
    dispose,
  });
}
