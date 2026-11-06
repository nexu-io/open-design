import {
  Check as PhCheck,
  Clock as PhClock,
  Eye as PhEye,
  FilmStrip,
  Stack,
  ArrowsOutCardinal,
  MusicNote,
  Palette as PhPalette,
  Minus as PhMinus,
  Plus as PhPlus,
  Square as PhSquare,
  SquareSplitVertical as PhSquareSplitVertical,
  TextT,
  X as PhX,
  Lightning,
  CaretRight,
  ClipboardText,
  ArrowCounterClockwise,
  Camera as PhCamera,
  ArrowClockwise,
  Gear,
  Scissors as PhScissors,
  Link as PhLink,
  Eyedropper as PhEyedropper,
  Trash as PhTrash,
  Image as PhImage,
  BezierCurve,
  FolderSimple,
} from "@phosphor-icons/react";
import type { Icon as PhosphorIcon, IconProps as PhosphorIconProps } from "@phosphor-icons/react";

type IconProps = PhosphorIconProps & { title?: string };

const makeIcon = (Icon: PhosphorIcon) => {
  const Wrapped = ({ title, ...props }: IconProps) => (
    <Icon alt={title} aria-label={title} aria-hidden={title ? undefined : true} {...props} />
  );
  return Wrapped;
};

// Lucide name → Phosphor equivalent
export const Check = makeIcon(PhCheck);
export const Clock = makeIcon(PhClock);
export const Eye = makeIcon(PhEye);
export const Film = makeIcon(FilmStrip);
export const Layers = makeIcon(Stack);
export const Move = makeIcon(ArrowsOutCardinal);
export const Music = makeIcon(MusicNote);
export const Palette = makeIcon(PhPalette);
export const Minus = makeIcon(PhMinus);
export const Plus = makeIcon(PhPlus);
export const Square = makeIcon(PhSquare);
export const Compare = makeIcon(PhSquareSplitVertical);
export const Type = makeIcon(TextT);
export const X = makeIcon(PhX);
export const Zap = makeIcon(Lightning);
// Extra icons used in this project (not in lucide's default mapping above)
export const ChevronDown = ({ title, style, ...props }: IconProps) => {
  const transform = style?.transform ? `${style.transform} rotate(90deg)` : "rotate(90deg)";
  return (
    <CaretRight
      alt={title}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={{ ...style, transform }}
      {...props}
    />
  );
};
export const ChevronRight = makeIcon(CaretRight);
export const ClipboardList = makeIcon(ClipboardText);
export const RotateCcw = makeIcon(ArrowCounterClockwise);
export const Camera = makeIcon(PhCamera);
export const RotateCw = makeIcon(ArrowClockwise);
export const Settings = makeIcon(Gear);
export const Scissors = makeIcon(PhScissors);
export const Link = makeIcon(PhLink);
export const Eyedropper = makeIcon(PhEyedropper);
export const Trash = makeIcon(PhTrash);
export const ImageIcon = makeIcon(PhImage);
export const Vector = makeIcon(BezierCurve);
export const Folder = makeIcon(FolderSimple);
