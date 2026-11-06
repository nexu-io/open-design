import { useI18n } from "../../i18n/I18n";
import { useEffect, useRef, useState } from "react";
import type { ColorGradingCapturedFrame } from "./useColorGradingPreviews";
import {
  type ColorGradingScopeAnalysis,
  type ColorGradingScopeMode,
} from "./colorGradingFrameAnalysis";
import { useColorGradingScopes } from "./useColorGradingScopes";
import { RotateCw } from "../../icons/SystemIcons";

const MODES: Array<{ id: ColorGradingScopeMode; label: string }> = [
  { id: "histogram", label: "Histogram" },
  { id: "waveform", label: "Waveform" },
  { id: "parade", label: "RGB Parade" },
  { id: "vectorscope", label: "Vectorscope" },
];

function densityAlpha(value: number, maximum: number): number {
  if (value === 0 || maximum === 0) return 0;
  return Math.min(1, Math.log2(value + 1) / Math.log2(maximum + 1));
}

function maximumDensity(values: Uint32Array): number {
  let maximum = 0;
  for (const value of values) maximum = Math.max(maximum, value);
  return maximum;
}

function drawGrid(context: CanvasRenderingContext2D, width: number, height: number) {
  context.fillStyle = "#090b0e";
  context.fillRect(0, 0, width, height);
  context.strokeStyle = "rgba(255,255,255,0.08)";
  context.lineWidth = 1;
  for (const fraction of [0.25, 0.5, 0.75]) {
    context.beginPath();
    context.moveTo(0, Math.round(height * fraction) + 0.5);
    context.lineTo(width, Math.round(height * fraction) + 0.5);
    context.stroke();
  }
}

function drawHistogram(
  context: CanvasRenderingContext2D,
  analysis: ColorGradingScopeAnalysis,
  width: number,
  height: number,
) {
  const maximum = maximumDensity(analysis.histogram);
  context.beginPath();
  context.moveTo(0, height);
  analysis.histogram.forEach((count, index) => {
    context.lineTo((index / 255) * width, height - densityAlpha(count, maximum) * height);
  });
  context.lineTo(width, height);
  context.closePath();
  context.fillStyle = "rgba(226, 232, 240, 0.2)";
  context.fill();
  context.strokeStyle = "rgba(226, 232, 240, 0.9)";
  context.stroke();
}

function drawDensity(
  context: CanvasRenderingContext2D,
  density: Uint32Array,
  columnOffset: number,
  columnCount: number,
  color: readonly [number, number, number],
  xOffset: number,
  outputWidth: number,
  height: number,
) {
  let maximum = 0;
  const start = columnOffset * 256;
  const end = (columnOffset + columnCount) * 256;
  for (let index = start; index < end; index += 1) maximum = Math.max(maximum, density[index] ?? 0);
  context.fillStyle = `rgb(${color.join(" ")})`;
  for (let x = 0; x < columnCount; x += 1) {
    for (let y = 0; y < 256; y += 1) {
      const alpha = density[(columnOffset + x) * 256 + y] ?? 0;
      if (!alpha) continue;
      context.globalAlpha = densityAlpha(alpha, maximum);
      context.fillRect(
        xOffset + (x / columnCount) * outputWidth,
        (y / 255) * height,
        Math.max(1, outputWidth / columnCount),
        Math.max(1, height / 256),
      );
    }
  }
  context.globalAlpha = 1;
}

function drawVectorscope(
  context: CanvasRenderingContext2D,
  analysis: ColorGradingScopeAnalysis,
  width: number,
  height: number,
) {
  const maximum = maximumDensity(analysis.vectorscope);
  const centerX = width / 2;
  const centerY = height / 2;
  context.strokeStyle = "rgba(255,255,255,0.12)";
  context.beginPath();
  context.arc(centerX, centerY, Math.min(width, height) * 0.42, 0, Math.PI * 2);
  context.stroke();
  context.beginPath();
  context.moveTo(centerX, 0);
  context.lineTo(centerX, height);
  context.moveTo(0, centerY);
  context.lineTo(width, centerY);
  context.stroke();
  const skinAngle = (-123 * Math.PI) / 180;
  context.strokeStyle = "rgba(251,191,36,0.3)";
  context.beginPath();
  context.moveTo(centerX, centerY);
  context.lineTo(
    centerX + Math.cos(skinAngle) * Math.min(width, height) * 0.45,
    centerY + Math.sin(skinAngle) * Math.min(width, height) * 0.45,
  );
  context.stroke();
  context.fillStyle = "rgb(110 231 183)";
  for (let y = 0; y < 256; y += 1) {
    for (let x = 0; x < 256; x += 1) {
      const count = analysis.vectorscope[y * 256 + x] ?? 0;
      if (!count) continue;
      context.globalAlpha = densityAlpha(count, maximum);
      context.fillRect(
        (x / 255) * width,
        (y / 255) * height,
        Math.max(1, width / 256),
        Math.max(1, height / 256),
      );
    }
  }
  context.globalAlpha = 1;
}

function drawScope(
  canvas: HTMLCanvasElement,
  mode: ColorGradingScopeMode,
  analysis: ColorGradingScopeAnalysis,
) {
  const context = canvas.getContext("2d");
  if (!context) return;
  const { width, height } = canvas;
  drawGrid(context, width, height);
  if (mode === "histogram") {
    drawHistogram(context, analysis, width, height);
  } else if (mode === "waveform") {
    drawDensity(context, analysis.waveform, 0, analysis.width, [226, 232, 240], 0, width, height);
  } else if (mode === "parade") {
    const laneWidth = width / 3;
    (
      [
        [0, [248, 113, 113]],
        [1, [74, 222, 128]],
        [2, [96, 165, 250]],
      ] as const
    ).forEach(([channel, color]) => {
      drawDensity(
        context,
        analysis.parade,
        channel * analysis.width,
        analysis.width,
        color,
        channel * laneWidth,
        laneWidth,
        height,
      );
    });
  } else {
    drawVectorscope(context, analysis, width, height);
  }
}

export function PropertyPanelColorScopes({
  captureFrame,
  refreshKey,
}: {
  captureFrame: () => Promise<ColorGradingCapturedFrame | null>;
  refreshKey: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ColorGradingScopeMode>("waveform");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { analysis, status, refresh } = useColorGradingScopes({
    open,
    captureFrame,
    refreshKey,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (analysis) {
      drawScope(canvas, mode, analysis);
      return;
    }
    const context = canvas.getContext("2d");
    if (context) drawGrid(context, canvas.width, canvas.height);
  }, [analysis, mode]);

  return (
    <div data-flat-grade-scopes="true" className="border-b border-panel-hairline pb-1.5">
      <div className="flex min-h-7 items-center justify-between">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex min-h-7 flex-1 items-center justify-between text-left"
        >
          <span className="text-[11px] text-panel-text-2">{t("Scopes")}</span>
          <span className="text-[9px] text-panel-text-5">{open ? status : t("Off")}</span>
        </button>
        <span className="flex items-center gap-2">
          {open && (
            <button
              type="button"
              aria-label={t("Refresh scopes")}
              title={t("Refresh scopes")}
              onClick={refresh}
              className="p-1 text-panel-text-4 hover:text-panel-text-1"
            >
              <RotateCw size={10} />
            </button>
          )}
        </span>
      </div>
      {open && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 overflow-x-auto">
            {MODES.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                aria-pressed={mode === candidate.id}
                onClick={() => setMode(candidate.id)}
                className={`whitespace-nowrap border-b-2 py-1 text-[9px] ${
                  mode === candidate.id
                    ? "border-panel-accent text-panel-text-1"
                    : "border-transparent text-panel-text-4 hover:text-panel-text-2"
                }`}
              >
                {candidate.label}
              </button>
            ))}
          </div>
          <canvas
            ref={canvasRef}
            width={320}
            height={144}
            role="img"
            aria-label={t("{value0} scope, {status}", { value0: MODES.find((candidate) => candidate.id === mode)?.label ?? mode, status: status })}
            className="block h-auto w-full border border-panel-hairline bg-black"
          />
        </div>
      )}
    </div>
  );
}
