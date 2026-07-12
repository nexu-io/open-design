"use client";

/**
 * @author: @dorianbaffier
 * @description: Liquid Glass Card - Optimized with Shadcn UI
 * @version: 2.0.0
 * @date: 2025-10-11
 * @license: MIT
 * @website: https://kokonutui.com
 * @github: https://github.com/kokonut-labs/kokonutui
 */

import { cva, type VariantProps } from "class-variance-authority";
import { ArrowLeft, ArrowRight, Pause, Play } from "lucide-react";
import Image from "next/image";
import React from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// Constants for better maintainability
const GLASS_SHADOW_LIGHT =
  "shadow-[0_0_6px_rgba(0,0,0,0.03),0_2px_6px_rgba(0,0,0,0.08),inset_3px_3px_0.5px_-3px_rgba(0,0,0,0.9),inset_-3px_-3px_0.5px_-3px_rgba(0,0,0,0.85),inset_1px_1px_1px_-0.5px_rgba(0,0,0,0.6),inset_-1px_-1px_1px_-0.5px_rgba(0,0,0,0.6),inset_0_0_6px_6px_rgba(0,0,0,0.12),inset_0_0_2px_2px_rgba(0,0,0,0.06),0_0_12px_rgba(255,255,255,0.15)]";

const GLASS_SHADOW_DARK =
  "dark:shadow-[0_0_8px_rgba(0,0,0,0.03),0_2px_6px_rgba(0,0,0,0.08),inset_3px_3px_0.5px_-3.5px_rgba(255,255,255,0.09),inset_-3px_-3px_0.5px_-3.5px_rgba(255,255,255,0.85),inset_1px_1px_1px_-0.5px_rgba(255,255,255,0.6),inset_-1px_-1px_1px_-0.5px_rgba(255,255,255,0.6),inset_0_0_6px_6px_rgba(255,255,255,0.12),inset_0_0_2px_2px_rgba(255,255,255,0.06),0_0_12px_rgba(0,0,0,0.15)]";

const GLASS_SHADOW = `${GLASS_SHADOW_LIGHT} ${GLASS_SHADOW_DARK}`;

const DEFAULT_GLASS_FILTER_SCALE = 30;
const BUTTON_GLASS_FILTER_SCALE = 70;

// Shared glass filter component
interface GlassFilterProps {
  id: string;
  scale?: number;
}

const GlassFilter = React.memo(
  ({ id, scale = DEFAULT_GLASS_FILTER_SCALE }: GlassFilterProps) => (
    <svg className="hidden">
      <title>Glass Effect Filter</title>
      <defs>
        <filter
          colorInterpolationFilters="sRGB"
          height="200%"
          id={id}
          width="200%"
          x="-50%"
          y="-50%"
        >
          <feTurbulence
            baseFrequency="0.05 0.05"
            numOctaves="1"
            result="turbulence"
            seed="1"
            type="fractalNoise"
          />
          <feGaussianBlur
            in="turbulence"
            result="blurredNoise"
            stdDeviation="2"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="blurredNoise"
            result="displaced"
            scale={scale}
            xChannelSelector="R"
            yChannelSelector="B"
          />
          <feGaussianBlur in="displaced" result="finalBlur" stdDeviation="4" />
          <feComposite in="finalBlur" in2="finalBlur" operator="over" />
        </filter>
      </defs>
    </svg>
  )
);
GlassFilter.displayName = "GlassFilter";

// Liquid Button - extends shadcn Button with glass effect
const liquidButtonVariants = cva("relative transition-transform duration-300", {
  variants: {
    liquidVariant: {
      default: "hover:scale-105",
      none: "",
    },
  },
  defaultVariants: {
    liquidVariant: "default",
  },
});

export type LiquidButtonProps = ButtonProps & {
  liquidVariant?: "default" | "none";
};

function LiquidButton({
  className,
  liquidVariant = "default",
  children,
  ...props
}: LiquidButtonProps) {
  const filterId = React.useId();

  return (
    <>
      <Button
        className={cn(liquidButtonVariants({ liquidVariant }), className)}
        {...props}
      >
        <div
          className={cn(
            "pointer-events-none absolute inset-0 rounded-full transition-all",
            GLASS_SHADOW
          )}
        />
        <div
          className="pointer-events-none absolute inset-0 isolate -z-10 overflow-hidden rounded-md"
          style={{ backdropFilter: `url("#${filterId}")` }}
        />
        <span className="relative z-10">{children}</span>
      </Button>
      <GlassFilter id={filterId} scale={BUTTON_GLASS_FILTER_SCALE} />
    </>
  );
}

// Liquid Glass Card - extends shadcn Card with glass effect
const liquidGlassCardVariants = cva(
  "group relative overflow-hidden bg-background/20 backdrop-blur-[2px] transition-all duration-300",
  {
    variants: {
      glassSize: {
        sm: "p-4",
        default: "p-6",
        lg: "p-8",
      },
    },
    defaultVariants: {
      glassSize: "default",
    },
  }
);

export type LiquidGlassCardProps = React.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof liquidGlassCardVariants> & {
    glassEffect?: boolean;
  };

function LiquidGlassCard({
  className,
  glassSize,
  glassEffect = true,
  children,
  ...props
}: LiquidGlassCardProps) {
  const filterId = React.useId();

  return (
    <Card
      className={cn(liquidGlassCardVariants({ glassSize }), className)}
      {...props}
    >
      <div
        className={cn(
          "pointer-events-none absolute inset-0 rounded-lg transition-all",
          GLASS_SHADOW
        )}
      />

      {glassEffect && (
        <>
          <div
            className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-lg"
            style={{ backdropFilter: `url("#${filterId}")` }}
          />
          <GlassFilter id={filterId} scale={DEFAULT_GLASS_FILTER_SCALE} />
        </>
      )}

      <div className="relative z-10">{children}</div>

      <div className="pointer-events-none absolute inset-0 z-20 rounded-lg bg-gradient-to-r from-transparent via-black/5 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100 dark:via-white/5" />
    </Card>
  );
}

// Demo: Music Player Card
const TOTAL_DURATION = 45;
const VOLUME_BAR_COUNT = 8;
const SEEK_JUMP_SECONDS = 5;
const TIMER_INTERVAL_MS = 1000;
const STATIC_BAR_HEIGHT = "6px";
const MIN_TIME = 0;
const BAR_DELAY_INCREMENT = 0.1;
const PROGRESS_PERCENTAGE_MULTIPLIER = 100;

const formatTime = (timeInSeconds: number): string => {
  const minutes = Math.floor(timeInSeconds / 60);
  const seconds = Math.floor(timeInSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

interface VolumeBarsProps {
  isPlaying: boolean;
}

const VolumeBars = React.memo(({ isPlaying }: VolumeBarsProps) => {
  const bars = Array.from({ length: VOLUME_BAR_COUNT }, (_, i) => ({
    id: `bar-${i}`,
    delay: i * BAR_DELAY_INCREMENT,
  }));

  return (
    <div className="pointer-events-none flex h-8 w-10 items-end gap-0.5">
      {bars.map((bar) => (
        <div
          className={cn(
            "w-[3px] rounded-sm",
            isPlaying && "animate-bounce-music"
          )}
          key={bar.id}
          style={{
            height: isPlaying ? undefined : STATIC_BAR_HEIGHT,
            animationDelay: `${bar.delay}s`,
            background: "linear-gradient(to top, #FF2E55, #FF6B88)",
          }}
        />
      ))}
    </div>
  );
});
VolumeBars.displayName = "VolumeBars";

interface ProgressBarProps {
  currentTime: number;
  totalDuration: number;
  onSeek: (newTime: number) => void;
}

const ProgressBar = React.memo(
  ({ currentTime, totalDuration, onSeek }: ProgressBarProps) => {
    const progress =
      (currentTime / totalDuration) * PROGRESS_PERCENTAGE_MULTIPLIER;

    const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
      const bar = e.currentTarget;
      const rect = bar.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percent = x / rect.width;
      const newTime = Math.min(
        Math.max(MIN_TIME, percent * totalDuration),
        totalDuration
      );
      onSeek(newTime);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const newTime = Math.min(
          currentTime + SEEK_JUMP_SECONDS,
          totalDuration
        );
        onSeek(newTime);
      }
    };

    return (
      <>
        <div className="flex justify-between font-medium text-xs text-zinc-500 dark:text-zinc-400">
          <span className="tabular-nums">{formatTime(currentTime)}</span>
          <span className="tabular-nums">{formatTime(totalDuration)}</span>
        </div>
        <div
          aria-label="Seek progress bar"
          aria-valuemax={totalDuration}
          aria-valuemin={MIN_TIME}
          aria-valuenow={currentTime}
          className="relative z-10 h-1 w-full cursor-pointer overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          role="slider"
          tabIndex={0}
        >
          <div
            className="h-full bg-gradient-to-r from-[#FF2E55] to-[#FF6B88] transition-all duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>
      </>
    );
  }
);
ProgressBar.displayName = "ProgressBar";

export function NotificationCenter() {
  const [isPlaying, setIsPlaying] = React.useState(true);
  const [currentTime, setCurrentTime] = React.useState(MIN_TIME);

  React.useEffect(() => {
    if (!isPlaying || currentTime >= TOTAL_DURATION) {
      return;
    }

    const intervalId = setInterval(() => {
      setCurrentTime((prev) => {
        if (prev >= TOTAL_DURATION) {
          setIsPlaying(false);
          return TOTAL_DURATION;
        }
        return prev + 1;
      });
    }, TIMER_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [isPlaying, currentTime]);

  const handlePlayPause = () => {
    setIsPlaying((prev) => !prev);
  };

  const handleSeek = (newTime: number) => {
    setCurrentTime(newTime);
    if (newTime < TOTAL_DURATION && !isPlaying) {
      setIsPlaying(true);
    }
  };

  return (
    <div className="w-full max-w-sm">
      <LiquidGlassCard className="gap-3.5 rounded-3xl border border-zinc-200/60 bg-gradient-to-br from-zinc-50 to-zinc-100 p-4 shadow-xl dark:border-zinc-700/60 dark:from-zinc-900 dark:to-black">
        <div className="flex items-center gap-3">
          <div className="relative mr-2 mb-4 h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-pink-400 via-pink-300 to-rose-200 shadow-lg ring-1 ring-black/5 dark:shadow-xl">
            <Image
              alt="Album Art for Glow by Echo"
              className="h-full w-full object-cover"
              height={64}
              src="https://ferf1mheo22r9ira.public.blob.vercel-storage.com/portrait2-x5MjJSaQ9ed0HZrewEhH7TkZwjZ66K.jpeg"
              width={64}
            />
          </div>

          <div className="flex-1 overflow-hidden">
            <h3 className="overflow-hidden text-ellipsis whitespace-nowrap font-semibold text-lg text-zinc-900 dark:text-white">
              Glow
            </h3>
            <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
              Echo
            </p>
          </div>

          <VolumeBars isPlaying={isPlaying} />
        </div>

        <div className="flex flex-col gap-2">
          <ProgressBar
            currentTime={currentTime}
            onSeek={handleSeek}
            totalDuration={TOTAL_DURATION}
          />

          <div className="mt-1 flex items-center justify-between">
            <div className="flex items-center justify-center gap-2">
              <LiquidButton
                aria-label="Previous track"
                className="h-10 w-10 rounded-full bg-transparent text-zinc-700 transition-colors hover:bg-zinc-200/80 dark:text-zinc-300 dark:hover:bg-zinc-800/80"
                size="icon"
                variant="ghost"
              >
                <ArrowLeft className="size-4" />
              </LiquidButton>
              <LiquidButton
                aria-label={isPlaying ? "Pause" : "Play"}
                className="h-11 w-11 rounded-full bg-transparent text-zinc-700 transition-colors hover:bg-zinc-200/80 dark:text-zinc-300 dark:hover:bg-zinc-800/80"
                onClick={handlePlayPause}
                size="icon"
                variant="ghost"
              >
                {isPlaying ? (
                  <Pause className="size-5" />
                ) : (
                  <Play className="size-5" />
                )}
              </LiquidButton>
              <LiquidButton
                aria-label="Next track"
                className="h-10 w-10 rounded-full bg-transparent text-zinc-700 transition-colors hover:bg-zinc-200/80 dark:text-zinc-300 dark:hover:bg-zinc-800/80"
                size="icon"
                variant="ghost"
              >
                <ArrowRight className="size-4" />
              </LiquidButton>
            </div>
            <LiquidButton
              aria-label="More options"
              className="h-10 w-10 rounded-full bg-transparent text-zinc-700 transition-colors hover:bg-zinc-200/80 dark:text-zinc-300 dark:hover:bg-zinc-800/80"
              size="icon"
              variant="ghost"
            >
              <svg
                className="size-4"
                fill="currentColor"
                viewBox="0 0 16 16"
                xmlns="http://www.w3.org/2000/svg"
              >
                <title>Options</title>
                <path d="M6.634 1.135A7 7 0 0 1 15 8a.5.5 0 0 1-1 0 6 6 0 1 0-6.5 5.98v-1.005A5 5 0 1 1 13 8a.5.5 0 0 1-1 0 4 4 0 1 0-4.5 3.969v-1.011A2.999 2.999 0 1 1 11 8a.5.5 0 0 1-1 0 2 2 0 1 0-2.5 1.936v-1.07a1 1 0 1 1 1 0V15.5a.5.5 0 0 1-1 0v-.518a7 7 0 0 1-.866-13.847" />
              </svg>
            </LiquidButton>
          </div>
        </div>
      </LiquidGlassCard>
    </div>
  );
}

export { LiquidButton, LiquidGlassCard };
export default NotificationCenter;
