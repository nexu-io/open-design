import { beforeEach, describe, expect, it, vi } from "vitest";

type MockTray = {
  handlers: Map<string, () => void>;
  image: unknown;
  popUpContextMenu: ReturnType<typeof vi.fn>;
  setContextMenu: ReturnType<typeof vi.fn>;
};

type MockImage = {
  addRepresentation: ReturnType<typeof vi.fn>;
  dataURL: string;
  setTemplateImage: ReturnType<typeof vi.fn>;
};

const electron = vi.hoisted(() => ({
  images: [] as MockImage[],
  trays: [] as MockTray[],
}));

vi.mock("electron", () => {
  class Tray {
    handlers = new Map<string, () => void>();
    popUpContextMenu = vi.fn();
    setContextMenu = vi.fn();
    constructor(public image: unknown) {
      electron.trays.push(this);
    }
    on(event: string, listener: () => void) {
      this.handlers.set(event, listener);
      return this;
    }
  }
  return {
    Menu: { buildFromTemplate: (template: unknown) => ({ template }) },
    Tray,
    nativeImage: {
      createFromDataURL: (dataURL: string) => {
        const image = { addRepresentation: vi.fn(), dataURL, setTemplateImage: vi.fn() };
        electron.images.push(image);
        return image;
      },
    },
  };
});

import { createMenubarTray } from "../../src/main/menubar.js";

beforeEach(() => {
  electron.images.length = 0;
  electron.trays.length = 0;
});

describe("createMenubarTray", () => {
  it("opens the window on left click without popping the menu", () => {
    const onOpen = vi.fn();
    const onQuit = vi.fn();
    createMenubarTray({ onOpen, onQuit });
    const tray = electron.trays[0]!;

    tray.handlers.get("click")?.();

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onQuit).not.toHaveBeenCalled();
    expect(tray.popUpContextMenu).not.toHaveBeenCalled();
    expect(tray.setContextMenu).not.toHaveBeenCalled();
  });

  it("offers Open and Quit on right click", () => {
    createMenubarTray({ onOpen: vi.fn(), onQuit: vi.fn() });
    const tray = electron.trays[0]!;

    tray.handlers.get("right-click")?.();
    const menu = tray.popUpContextMenu.mock.calls[0]?.[0] as {
      template: Array<{ click: () => void; label: string }>;
    };

    expect(menu.template.map((item) => item.label)).toEqual(["Open", "Quit"]);
    expect(tray.setContextMenu).not.toHaveBeenCalled();
  });

  it("calls only onOpen when the Open menu item is clicked", () => {
    const onOpen = vi.fn();
    const onQuit = vi.fn();
    createMenubarTray({ onOpen, onQuit });
    const tray = electron.trays[0]!;

    tray.handlers.get("right-click")?.();
    const menu = tray.popUpContextMenu.mock.calls[0]?.[0] as {
      template: Array<{ click: () => void; label: string }>;
    };
    menu.template[0]!.click();

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onQuit).not.toHaveBeenCalled();
  });

  it("calls only onQuit when the Quit menu item is clicked", () => {
    const onOpen = vi.fn();
    const onQuit = vi.fn();
    createMenubarTray({ onOpen, onQuit });
    const tray = electron.trays[0]!;

    tray.handlers.get("right-click")?.();
    const menu = tray.popUpContextMenu.mock.calls[0]?.[0] as {
      template: Array<{ click: () => void; label: string }>;
    };
    menu.template[1]!.click();

    expect(onQuit).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("shows the logo glyph as a template image with a 2x representation", () => {
    createMenubarTray({ onOpen: vi.fn(), onQuit: vi.fn() });
    const image = electron.images[0]!;

    expect(electron.trays[0]!.image).toBe(image);
    expect(image.dataURL).toMatch(/^data:image\/png;base64,/);
    expect(image.addRepresentation).toHaveBeenCalledWith({
      scaleFactor: 2,
      dataURL: expect.stringMatching(/^data:image\/png;base64,/),
    });
    expect(image.setTemplateImage).toHaveBeenCalledWith(true);
  });
});
