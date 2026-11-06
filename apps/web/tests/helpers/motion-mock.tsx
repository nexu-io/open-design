import { forwardRef, type ComponentProps, type ElementType } from 'react';

function AnimatePresence({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}

// Surfaces the reduced-motion preference to tests. Real motion/react uses this
// to gate transform animations on the OS `prefers-reduced-motion` setting; the
// mock just exposes the configured value so wiring can be asserted.
function MotionConfig({
  reducedMotion,
  children,
}: {
  reducedMotion?: 'always' | 'never' | 'user';
  children?: React.ReactNode;
}) {
  return <div data-testid="motion-config" data-reduced-motion={reducedMotion}>{children}</div>;
}

// One stable component identity per intrinsic tag. Without this cache the
// proxy minted a fresh `forwardRef` on every `motion.div` access, so every
// render of a component that renders `<motion.div>` handed React a NEW element
// type — React then unmounted and remounted the whole subtree and replaced its
// DOM nodes. Any test that awaited `findBy*` inside a motion subtree and then
// fired an event on the returned node raced that remount and clicked a
// detached element (observed: App.connectors first-run share banner).
const componentCache = new Map<string, ReturnType<typeof forwardRef>>();

const motionHandler: ProxyHandler<object> = {
  get(_target, prop: string) {
    const cached = componentCache.get(prop);
    if (cached) return cached;
    const Component = forwardRef<unknown, ComponentProps<ElementType>>((props, ref) => {
      const {
        variants: _variants,
        initial: _initial,
        animate: _animate,
        exit: _exit,
        whileHover: _whileHover,
        whileTap: _whileTap,
        transition: _transition,
        layout: _layout,
        layoutId: _layoutId,
        ...rest
      } = props as Record<string, unknown>;
      const Tag = prop as ElementType;
      return <Tag ref={ref} {...rest} />;
    });
    Component.displayName = `motion.${prop}`;
    componentCache.set(prop, Component);
    return Component;
  },
};

const motion = new Proxy({}, motionHandler);

// jsdom has no matchMedia; components under test always see "no reduced
// motion" so their full animation props stay assertable.
function useReducedMotion(): boolean {
  return false;
}

export { AnimatePresence, MotionConfig, motion, useReducedMotion };
