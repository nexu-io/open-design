export interface DemoHost {
  register(id: string, plugin: DemoPlugin): void;
  unregister(id: string): void;
  log(message: string): void;
}

export interface DemoPlugin {
  register(host: DemoHost): void;
  unregister(host: DemoHost): void;
  run(input: string): string;
}

const plugin: DemoPlugin = {
  register(host) {
    host.log('plugin-architecture-builder-demo registered');
  },
  unregister(host) {
    host.log('plugin-architecture-builder-demo unregistered');
  },
  run(input) {
    return `demo:${input.trim()}`;
  },
};

export default plugin;
