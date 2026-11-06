type Preview = {
  visible: boolean;
  ready: boolean;
  priority: boolean;
  play: () => void;
  pause: () => void;
};

/** One scheduler for the gallery: two visible previews, or the hovered/focused one. */
export class TemplatePlayback {
  private entries = new Map<string, Preview>();
  private enabled = false;
  private limit = 2;
  private offset = 0;
  private preferred?: string;
  register(id: string, handlers: Pick<Preview, "play" | "pause">) {
    this.entries.set(id, {
      ...handlers,
      visible: false,
      ready: false,
      priority: false,
    });
    return () => {
      this.entries.get(id)?.pause();
      this.entries.delete(id);
      this.reconcile();
    };
  }
  update(
    id: string,
    patch: Partial<Pick<Preview, "visible" | "ready" | "priority">>,
  ) {
    const entry = this.entries.get(id);
    if (!entry) return;
    if (patch.priority === true) this.preferred = id;
    else if (patch.priority === false && this.preferred === id)
      this.preferred = undefined;
    Object.assign(entry, patch);
    this.reconcile();
  }
  configure(enabled: boolean, limit = 2) {
    this.enabled = enabled;
    this.limit = Math.max(1, limit);
    this.reconcile();
  }
  advance() {
    this.offset += this.limit;
    this.reconcile();
  }
  private reconcile() {
    const visible = [...this.entries].filter(([, entry]) => entry.visible);
    const focused = visible.filter(([, entry]) => entry.priority);
    const preferred =
      focused.find(([id]) => id === this.preferred) || focused.at(-1);
    const eligible = visible.filter(([, entry]) => entry.ready);
    const selected = new Set(
      !this.enabled
        ? []
        : preferred
          ? preferred[1].ready
            ? [preferred[0]]
            : []
          : Array.from(
              { length: Math.min(this.limit, eligible.length) },
              (_, i) => eligible[(this.offset + i) % eligible.length][0],
            ),
    );
    for (const [id, entry] of this.entries)
      if (!selected.has(id)) entry.pause();
    for (const [id, entry] of this.entries) if (selected.has(id)) entry.play();
  }
}
