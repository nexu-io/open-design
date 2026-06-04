import type { SVGProps } from 'react';

export type IconName =
  | 'arrow-left'
  | 'arrow-up'
  | 'attach'
  | 'bell'
  | 'blocks'
  | 'check'
  | 'chevron-down'
  | 'chevron-left'
  | 'chevron-right'
  | 'close'
  | 'copy'
  | 'comment'
  | 'discord'
  | 'download'
  | 'draw'
  | 'edit'
  | 'external-link'
  | 'eye'
  | 'eye-off'
  | 'file'
  | 'file-code'
  | 'folder'
  | 'folder-filled'
  | 'fork'
  | 'github'
  | 'github-filled'
  | 'grip-vertical'
  | 'grid'
  | 'globe'
  | 'hammer'
  | 'help-circle'
  | 'history'
  | 'home'
  | 'home-filled'
  | 'image'
  | 'import'
  | 'info'
  | 'kanban'
  | 'layers-filled'
  | 'languages'
  | 'lightbulb'
  | 'link'
  | 'integrations-filled'
  | 'mic'
  | 'minus'
  | 'more-horizontal'
  | 'orbit'
  | 'paint-bucket'
  | 'palette'
  | 'palette-filled'
  | 'pencil'
  | 'plus'
  | 'plus-filled'
  | 'puzzle'
  | 'star'
  | 'play'
  | 'present'
  | 'refresh'
  | 'reload'
  | 'search'
  | 'send'
  | 'settings'
  | 'share'
  | 'sliders'
  | 'spinner'
  | 'sparkles'
  | 'stop'
  | 'sun'
  | 'moon'
  | 'sun-moon'
  | 'terminal'
  | 'thumbs-down'
  | 'thumbs-up'
  | 'tweaks'
  | 'upload'
  | 'trash'
  | 'zoom-in'
  | 'zoom-out';

interface Props extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number | string;
}

/**
 * Lightweight inline-SVG icon set tuned to the design system. Stroke-based
 * (Feather/Lucide style) so they pair cleanly with `currentColor` and adopt
 * the local text color. Use sparingly inside buttons that already have
 * accessible labels — set `aria-hidden` by default.
 */
export function Icon({ name, size = 14, strokeWidth = 1.6, ...rest }: Props) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    focusable: 'false' as const,
    ...rest,
  };
  switch (name) {
    case 'arrow-left':
      return (
        <svg {...common}>
          <path d="M19 12H5" />
          <path d="m12 19-7-7 7-7" />
        </svg>
      );
    case 'arrow-up':
      return (
        <svg {...common}>
          <path d="M12 19V5" />
          <path d="m5 12 7-7 7 7" />
        </svg>
      );
    case 'attach':
      return (
        <svg {...common}>
          <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
        </svg>
      );
    case 'bell':
      return (
        <svg {...common}>
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
      );
    case 'blocks':
      return (
        <svg {...common}>
          <path d="M10 22V7a1 1 0 0 0-1-1H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5a1 1 0 0 0-1-1H2" />
          <rect x="14" y="2" width="8" height="8" rx="1" />
        </svg>
      );
    case 'check':
      return (
        <svg {...common}>
          <path d="M20 6 9 17l-5-5" />
        </svg>
      );
    case 'chevron-down':
      return (
        <svg {...common}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      );
    case 'chevron-left':
      return (
        <svg {...common}>
          <path d="m15 18-6-6 6-6" />
        </svg>
      );
    case 'chevron-right':
      return (
        <svg {...common}>
          <path d="m9 18 6-6-6-6" />
        </svg>
      );
    case 'close':
      // Tighter X than the Lucide default (which uses coords 6→18 inside a
      // 24-unit viewBox, so the visible glyph is only 50% of the icon box).
      // Close buttons read as a small dot inside their container at typical
      // 14-18px icon sizes. Extending the strokes to 4→20 lifts the visible
      // extent to ~67% so the X feels balanced inside compact modal close
      // buttons (PluginMediaDetail / NewProjectModal / PreviewModal) without
      // overpowering chip-sized close icons (ChatComposer / SettingsDialog).
      return (
        <svg {...common}>
          <path d="M20 4 4 20" />
          <path d="m4 4 16 16" />
        </svg>
      );
    case 'copy':
      return (
        <svg {...common}>
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      );
    case 'comment':
      return (
        <svg {...common}>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      );
    case 'discord':
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <path d="M8.52062 13.8458C7.48059 13.8458 6.63159 12.9014 6.63159 11.7446 6.63159 10.5879 7.45936 9.64331 8.52062 9.64331 9.57123 9.64331 10.4308 10.5879 10.4096 11.7446 10.4096 12.9014 9.57123 13.8458 8.52062 13.8458ZM15.4941 13.8458C14.454 13.8458 13.604 12.9014 13.604 11.7446 13.604 10.5879 14.4328 9.64331 15.4941 9.64331 16.5447 9.64331 17.4043 10.5879 17.3831 11.7446 17.3831 12.9014 16.5553 13.8458 15.4941 13.8458ZM10.1253 4.32296 9.81655 3.76001 9.18323 3.86556C7.71915 4.10958 6.32658 4.54677 5.02544 5.14604L4.79651 5.25148 4.65507 5.46009C2.0418 9.31441 1.3258 13.1087 1.68032 16.8362L1.71897 17.2425 2.04912 17.4824C3.78851 18.7465 5.47417 19.5189 7.12727 20.0257L7.91657 20.2676 9.03013 17.5506C10.9397 18.0226 13.0592 18.0228 14.969 17.5511L16.0757 20.2683 16.8668 20.0256C18.5173 19.5193 20.2137 18.7472 21.9466 17.4811L22.2726 17.243 22.3131 16.8414C22.7491 12.5213 21.616 8.75773 19.3547 5.45652L19.2128 5.24944 18.9846 5.14504C17.6767 4.54685 16.2852 4.10981 14.8309 3.86573L14.2132 3.76207 13.8987 4.30369C13.8112 4.45445 13.7215 4.62464 13.6364 4.79687 12.5441 4.6847 11.456 4.68446 10.3726 4.79652 10.2882 4.62736 10.2025 4.4638 10.1253 4.32296ZM6.71436 16.6102C6.91235 16.7243 7.11973 16.8358 7.32557 16.9381L6.8764 18.034C5.75585 17.6259 4.61837 17.0637 3.4476 16.2557 3.22313 13.1178 3.86092 9.951 6.01196 6.68626 6.90962 6.29123 7.8535 5.98279 8.83606 5.77295 8.89631 5.89831 8.95235 6.02066 8.99839 6.12917L9.27128 6.77238 9.96259 6.67098C11.3152 6.4726 12.6772 6.47234 14.0523 6.67124L14.7424 6.77106 15.0147 6.12917C15.0621 6.01743 15.1167 5.89547 15.1743 5.77322 16.1525 5.98326 17.098 6.29212 18.0029 6.68812 19.8781 9.50857 20.8241 12.6544 20.5486 16.2552 19.3837 17.0625 18.2422 17.6249 17.1193 18.0335L16.6735 16.939C16.8799 16.8365 17.0879 16.7246 17.2865 16.6102 17.7763 16.328 18.3039 15.976 18.6402 15.6397L17.3606 14.3602C17.1969 14.5239 16.837 14.7808 16.3831 15.0423 15.9388 15.2983 15.498 15.5052 15.2164 15.5983 13.2126 16.2608 10.7883 16.2608 8.78443 15.5983 8.50285 15.5052 8.06205 15.2983 7.61772 15.0423 7.16383 14.7808 6.80392 14.5239 6.64017 14.3602L5.36065 15.6397C5.6969 15.976 6.2245 16.328 6.71436 16.6102Z" />
        </svg>
      );
    case 'download':
      return (
        <svg {...common}>
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <path d="m7 10 5 5 5-5" />
          <path d="M12 15V3" />
        </svg>
      );
    case 'draw':
      return (
        <svg {...common}>
          <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z" />
          <path d="m14.06 6.19 3.75 3.75" />
        </svg>
      );
    case 'edit':
      return (
        <svg {...common}>
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      );
    case 'eye':
      return (
        <svg {...common}>
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case 'eye-off':
      return (
        <svg {...common}>
          <path d="m3 3 18 18" />
          <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
          <path d="M9.9 4.2A9.9 9.9 0 0 1 12 4c6.5 0 10 8 10 8a17.8 17.8 0 0 1-2.1 3.1" />
          <path d="M6.1 6.1C3.5 7.9 2 12 2 12s3.5 8 10 8a9.9 9.9 0 0 0 4.2-.9" />
        </svg>
      );
    case 'external-link':
      return (
        <svg {...common}>
          <path d="M15 3h6v6" />
          <path d="M10 14 21 3" />
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        </svg>
      );
    case 'file':
      return (
        <svg {...common}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" />
        </svg>
      );
    case 'file-code':
      return (
        <svg {...common}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" />
          <path d="m10 13-2 2 2 2" />
          <path d="m14 17 2-2-2-2" />
        </svg>
      );
    case 'folder':
      return (
        <svg {...common}>
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      );
    case 'fork':
      return (
        <svg {...common}>
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="6" r="3" />
          <circle cx="18" cy="18" r="3" />
          <path d="M8.6 15.4 15.4 8.6" />
          <path d="M9 18h6" />
        </svg>
      );
    case 'folder-filled':
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <path d="M2 4C2 3.44772 2.44772 3 3 3H10.4142L12.4142 5H21C21.5523 5 22 5.44772 22 6V20C22 20.5523 21.5523 21 21 21L3 21C2.45 21 2 20.55 2 20V4ZM10.5858 6L9.58579 5H4V7H9.58579L10.5858 6ZM4 9V19L20 19V7H12.4142L10.4142 9H4Z" />
        </svg>
      );
    case 'github':
      return (
        <svg {...common}>
          <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.4 5.4 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
          <path d="M9 18c-4.51 2-5-2-7-2" />
        </svg>
      );
    case 'github-filled':
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <path d="M5.88401 18.6533C5.58404 18.4526 5.32587 18.1975 5.0239 17.8369C4.91473 17.7065 4.47283 17.1524 4.55811 17.2583C4.09533 16.6833 3.80296 16.417 3.50156 16.3089C2.9817 16.1225 2.7114 15.5499 2.89784 15.0301C3.08428 14.5102 3.65685 14.2399 4.17672 14.4263C4.92936 14.6963 5.43847 15.1611 6.12425 16.0143C6.03025 15.8974 6.46364 16.441 6.55731 16.5529C6.74784 16.7804 6.88732 16.9182 6.99629 16.9911C7.20118 17.1283 7.58451 17.1874 8.14709 17.1311C8.17065 16.7489 8.24136 16.3783 8.34919 16.0358C5.38097 15.3104 3.70116 13.3952 3.70116 9.63971C3.70116 8.40085 4.0704 7.28393 4.75917 6.3478C4.5415 5.45392 4.57433 4.37284 5.06092 3.15636C5.1725 2.87739 5.40361 2.66338 5.69031 2.57352C5.77242 2.54973 5.81791 2.53915 5.89878 2.52673C6.70167 2.40343 7.83573 2.69705 9.31449 3.62336C10.181 3.41879 11.0885 3.315 12.0012 3.315C12.9129 3.315 13.8196 3.4186 14.6854 3.62277C16.1619 2.69 17.2986 2.39649 18.1072 2.52651C18.1919 2.54013 18.2645 2.55783 18.3249 2.57766C18.6059 2.66991 18.8316 2.88179 18.9414 3.15636C19.4279 4.37256 19.4608 5.45344 19.2433 6.3472C19.9342 7.28337 20.3012 8.39208 20.3012 9.63971C20.3012 13.3968 18.627 15.3048 15.6588 16.032C15.7837 16.447 15.8496 16.9105 15.8496 17.4121C15.8496 18.0765 15.8471 18.711 15.8424 19.4225C15.8412 19.6127 15.8397 19.8159 15.8375 20.1281C16.2129 20.2109 16.5229 20.5077 16.6031 20.9089C16.7114 21.4504 16.3602 21.9773 15.8186 22.0856C14.6794 22.3134 13.8353 21.5538 13.8353 20.5611C13.8353 20.4708 13.836 20.3417 13.8375 20.1145C13.8398 19.8015 13.8412 19.599 13.8425 19.4094C13.8471 18.7019 13.8496 18.0716 13.8496 17.4121C13.8496 16.7148 13.6664 16.2602 13.4237 16.051C12.7627 15.4812 13.0977 14.3973 13.965 14.2999C16.9314 13.9666 18.3012 12.8177 18.3012 9.63971C18.3012 8.68508 17.9893 7.89571 17.3881 7.23559C17.1301 6.95233 17.0567 6.54659 17.199 6.19087C17.3647 5.77663 17.4354 5.23384 17.2941 4.57702L17.2847 4.57968C16.7928 4.71886 16.1744 5.0198 15.4261 5.5285C15.182 5.69438 14.8772 5.74401 14.5932 5.66413C13.7729 5.43343 12.8913 5.315 12.0012 5.315C11.111 5.315 10.2294 5.43343 9.40916 5.66413C9.12662 5.74359 8.82344 5.69492 8.57997 5.53101C7.8274 5.02439 7.2056 4.72379 6.71079 4.58376C6.56735 5.23696 6.63814 5.77782 6.80336 6.19087C6.94565 6.54659 6.87219 6.95233 6.61423 7.23559C6.01715 7.8912 5.70116 8.69376 5.70116 9.63971C5.70116 12.8116 7.07225 13.9683 10.023 14.2999C10.8883 14.3971 11.2246 15.4769 10.5675 16.0482C10.3751 16.2156 10.1384 16.7802 10.1384 17.4121V20.5611C10.1384 21.5474 9.30356 22.2869 8.17878 22.09C7.63476 21.9948 7.27093 21.4766 7.36613 20.9326C7.43827 20.5204 7.75331 20.2116 8.13841 20.1276V19.1381C7.22829 19.1994 6.47656 19.0498 5.88401 18.6533Z" />
        </svg>
      );
    case 'grip-vertical':
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <circle cx="9" cy="5" r="1.45" />
          <circle cx="15" cy="5" r="1.45" />
          <circle cx="9" cy="12" r="1.45" />
          <circle cx="15" cy="12" r="1.45" />
          <circle cx="9" cy="19" r="1.45" />
          <circle cx="15" cy="19" r="1.45" />
        </svg>
      );
    case 'grid':
      return (
        <svg {...common}>
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      );
    case 'globe':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10Z" />
        </svg>
      );
    case 'puzzle':
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <path d="M7 5C7 2.79086 8.79086 1 11 1C13.2091 1 15 2.79086 15 5H18C18.5523 5 19 5.44772 19 6V9C21.2091 9 23 10.7909 23 13C23 15.2091 21.2091 17 19 17V20C19 20.5523 18.5523 21 18 21H4C3.44772 21 3 20.5523 3 20V6C3 5.44772 3.44772 5 4 5H7ZM11 3C9.89543 3 9 3.89543 9 5C9 5.23554 9.0403 5.45952 9.11355 5.66675C9.22172 5.97282 9.17461 6.31235 8.98718 6.57739C8.79974 6.84243 8.49532 7 8.17071 7H5V19H17V15.8293C17 15.5047 17.1576 15.2003 17.4226 15.0128C17.6877 14.8254 18.0272 14.7783 18.3332 14.8865C18.5405 14.9597 18.7645 15 19 15C20.1046 15 21 14.1046 21 13C21 11.8954 20.1046 11 19 11C18.7645 11 18.5405 11.0403 18.3332 11.1135C18.0272 11.2217 17.6877 11.1746 17.4226 10.9872C17.1576 10.7997 17 10.4953 17 10.1707V7H13.8293C13.5047 7 13.2003 6.84243 13.0128 6.57739C12.8254 6.31235 12.7783 5.97282 12.8865 5.66675C12.9597 5.45952 13 5.23555 13 5C13 3.89543 12.1046 3 11 3Z" />
        </svg>
      );
    case 'hammer':
      // Lucide-style hammer — a slanted head plus diagonal handle, used
      // to signal "tool / functionality" affordances. Pairs with the
      // entry topbar's Use everywhere chip where a chain link would
      // misleadingly read as a hyperlink instead of a callable tool.
      return (
        <svg {...common}>
          <path d="m15 12-8.373 8.373a1 1 0 1 1-3-3L12 9" />
          <path d="m18 15 4-4" />
          <path d="m21.5 11.5-1.914-1.914A2 2 0 0 1 19 8.172V7l-2.26-2.26a6 6 0 0 0-4.202-1.756L9 2.96l.92.82A6.18 6.18 0 0 1 12 8.4V10l2 2h1.172a2 2 0 0 1 1.414.586L18.5 14.5" />
        </svg>
      );
    case 'help-circle':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <path d="M12 17h.01" />
        </svg>
      );
    case 'history':
      return (
        <svg {...common}>
          <path d="M3 12a9 9 0 1 0 3-6.7" />
          <path d="M3 4v5h5" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    case 'home':
      return (
        <svg {...common}>
          <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2h-4v-7h-6v7H5a2 2 0 0 1-2-2z" />
        </svg>
      );
    case 'home-filled':
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <path d="M19 21H5C4.44772 21 4 20.5523 4 20V11L1 11L11.3273 1.6115C11.7087 1.26475 12.2913 1.26475 12.6727 1.6115L23 11L20 11V20C20 20.5523 19.5523 21 19 21ZM6 19H18V9.15745L12 3.7029L6 9.15745V19ZM8 15H16V17H8V15Z" />
        </svg>
      );
    case 'image':
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="9" cy="9" r="2" />
          <path d="m21 15-4.5-4.5L7 20" />
        </svg>
      );
    case 'import':
      return (
        <svg {...common}>
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <path d="m17 8-5-5-5 5" />
          <path d="M12 3v12" />
        </svg>
      );
    case 'info':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      );
    case 'kanban':
      return (
        <svg {...common}>
          <rect x="3" y="4" width="5" height="16" rx="1" />
          <rect x="10" y="4" width="5" height="10" rx="1" />
          <rect x="17" y="4" width="4" height="13" rx="1" />
        </svg>
      );
    case 'layers-filled':
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <path d="M20.0833 15.1999L21.2854 15.9212C21.5221 16.0633 21.5989 16.3704 21.4569 16.6072C21.4146 16.6776 21.3557 16.7365 21.2854 16.7787L12.5144 22.0412C12.1977 22.2313 11.8021 22.2313 11.4854 22.0412L2.71451 16.7787C2.47772 16.6366 2.40093 16.3295 2.54301 16.0927C2.58523 16.0223 2.64413 15.9634 2.71451 15.9212L3.9166 15.1999L11.9999 20.0499L20.0833 15.1999ZM20.0833 10.4999L21.2854 11.2212C21.5221 11.3633 21.5989 11.6704 21.4569 11.9072C21.4146 11.9776 21.3557 12.0365 21.2854 12.0787L11.9999 17.6499L2.71451 12.0787C2.47772 11.9366 2.40093 11.6295 2.54301 11.3927C2.58523 11.3223 2.64413 11.2634 2.71451 11.2212L3.9166 10.4999L11.9999 15.3499L20.0833 10.4999ZM12.5144 1.30864L21.2854 6.5712C21.5221 6.71327 21.5989 7.0204 21.4569 7.25719C21.4146 7.32757 21.3557 7.38647 21.2854 7.42869L11.9999 12.9999L2.71451 7.42869C2.47772 7.28662 2.40093 6.97949 2.54301 6.7427C2.58523 6.67232 2.64413 6.61343 2.71451 6.5712L11.4854 1.30864C11.8021 1.11864 12.1977 1.11864 12.5144 1.30864ZM11.9999 3.33233L5.88723 6.99995L11.9999 10.6676L18.1126 6.99995L11.9999 3.33233Z" />
        </svg>
      );
    case 'languages':
      return (
        <svg {...common}>
          <path d="m5 8 6 6" />
          <path d="m4 14 6-6 2-3" />
          <path d="M2 5h12" />
          <path d="M7 2h1" />
          <path d="m22 22-5-10-5 10" />
          <path d="M14 18h6" />
        </svg>
      );
    case 'lightbulb':
      return (
        <svg {...common}>
          <path d="M9 18h6" />
          <path d="M10 22h4" />
          <path d="M12 2a7 7 0 0 0-4.1 12.7c.8.6 1.1 1.5 1.1 2.3h6c0-.8.3-1.7 1.1-2.3A7 7 0 0 0 12 2Z" />
          <path d="M10 10a2 2 0 0 1 4 0" />
        </svg>
      );
    case 'link':
      return (
        <svg {...common}>
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 1 0-7.07-7.07L11.75 5.18" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 1 0 7.07 7.07l1.71-1.71" />
        </svg>
      );
    case 'integrations-filled':
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <path d="M6.00723 7.29726C6.00242 7.19876 5.99998 7.09965 5.99998 7C5.99998 3.68629 8.68627 1 12 1C13.3496 1 14.5977 1.44677 15.6006 2.20007L14.3994 3.7992C13.731 3.29712 12.9016 3 12 3C11.7239 3 11.4542 3.02798 11.1938 3.08127C9.37112 3.45426 8 5.06701 8 7C8 9.03308 9.51679 10.7119 11.4805 10.9666C12.5039 9.55847 14.055 8.70883 15.696 8.53306C16.3796 8.45983 17.0792 8.50382 17.7635 8.67248C18.3006 8.80481 18.828 9.01404 19.33 9.3039C22.1998 10.9608 23.183 14.6303 21.5262 17.5C19.8693 20.3698 16.1998 21.3531 13.33 19.6962C12.828 19.4064 12.3832 19.0543 12 18.6554C11.6169 19.0543 11.172 19.4064 10.6699 19.6963C7.80019 21.3531 4.13065 20.3699 2.47379 17.5001C0.81694 14.6304 1.80019 10.9608 4.66995 9.30397C5.17193 9.01416 5.69919 8.80494 6.23623 8.67261C6.11278 8.24646 6.03531 7.80079 6.00955 7.3413L6.00723 7.29726ZM7.14979 10.5328C6.64359 10.5989 6.14138 10.7638 5.66995 11.036C3.75678 12.1406 3.10128 14.587 4.20585 16.5001C5.31042 18.4133 7.75678 19.0688 9.66995 17.9642C10.3021 17.5993 10.7949 17.09 11.1337 16.5024C11.7429 15.4457 11.8532 14.1391 11.3649 12.9669C10.9807 12.9264 10.6072 12.8497 10.2481 12.7402C10.2028 12.7264 10.1577 12.712 10.1128 12.6972C8.91238 12.2997 7.87997 11.5335 7.14979 10.5328ZM13.1543 16.9343C13.4647 17.3396 13.8586 17.692 14.33 17.9642C16.2432 19.0687 18.6895 18.4132 19.7941 16.5C20.2936 15.635 20.4332 14.6609 20.2593 13.7511C20.0488 12.6488 19.3781 11.6409 18.33 11.0357C17.6978 10.6708 17.0104 10.4986 16.3322 10.499C15.1125 10.4998 13.9259 11.0576 13.1548 12.0666C13.2661 12.3165 13.3588 12.5707 13.4336 12.8277C13.4774 12.9785 13.5151 13.1302 13.5467 13.2825C13.5602 13.3478 13.5726 13.4131 13.5839 13.4786C13.7871 14.6567 13.6297 15.8611 13.1543 16.9343ZM18.5774 7C18.866 7.33402 19.106 7.71371 19.2866 8.12811L19.5331 8.69379C19.7136 9.10792 20.2864 9.10792 20.4668 8.69379L20.7134 8.12811C21.1529 7.11947 21.9445 6.31641 22.9323 5.87708L23.67 5.53922C24.0808 5.35653 24.0808 4.75881 23.67 4.57612L22.9748 4.25714C21.9616 3.80651 21.1558 2.97373 20.7238 1.93083L20.4706 1.31953C20.2942 0.893489 19.7058 0.893489 19.5293 1.31953L19.2761 1.93083C19.1965 2.12319 19.1041 2.3084 19 2.48538C18.5399 3.26793 17.8515 3.88963 17.0252 4.25714L16.308 4.57612C15.8973 4.75881 15.8973 5.35653 16.308 5.53922L17.0677 5.87708C17.6496 6.13591 18.1635 6.521 18.5774 7Z" />
        </svg>
      );
    case 'mic':
      return (
        <svg {...common}>
          <rect x="9" y="2" width="6" height="11" rx="3" />
          <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
          <path d="M12 18v3" />
        </svg>
      );
    case 'minus':
      return (
        <svg {...common}>
          <path d="M5 12h14" />
        </svg>
      );
    case 'more-horizontal':
      return (
        <svg {...common}>
          <circle cx="5" cy="12" r="1.4" />
          <circle cx="12" cy="12" r="1.4" />
          <circle cx="19" cy="12" r="1.4" />
        </svg>
      );
    case 'orbit':
      // Tilted elliptical orbit + central body + a small satellite riding the
      // path. Reads unmistakably as "orbit/automation" rather than the
      // generic refresh loop, and the rotated ellipse keeps the silhouette
      // distinct from `refresh` and `reload` at small sizes.
      return (
        <svg {...common}>
          <ellipse
            cx="12"
            cy="12"
            rx="9"
            ry="3.5"
            transform="rotate(-25 12 12)"
          />
          <circle cx="12" cy="12" r="2.25" fill="currentColor" stroke="none" />
          <circle cx="16" cy="6.8" r="1.5" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'paint-bucket':
      return (
        <svg {...common}>
          <path d="M11 7 6 2m12.992 10H2.041m19.104 6.38A3.34 3.34 0 0 1 20 16.5a3.3 3.3 0 0 1-1.145 1.88c-.575.46-.855 1.02-.855 1.595A2 2 0 0 0 20 22a2 2 0 0 0 2-2.025c0-.58-.285-1.13-.855-1.595M8.5 4.5l2.148-2.148a1.205 1.205 0 0 1 1.704 0l7.296 7.296a1.205 1.205 0 0 1 0 1.704l-7.592 7.592a3.615 3.615 0 0 1-5.112 0l-3.888-3.888a3.615 3.615 0 0 1 0-5.112L5.67 7.33" />
        </svg>
      );
    case 'palette':
      return (
        <svg {...common}>
          <path d="M12 2a10 10 0 1 0 0 20 2 2 0 0 0 0-4 1.5 1.5 0 0 1-1.06-2.56l.78-.78A2 2 0 0 1 13.13 14H17a5 5 0 0 0 5-5c0-3.87-4.48-7-10-7Z" />
          <circle cx="7.5" cy="10.5" r="1" fill="currentColor" stroke="none" />
          <circle cx="9.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
          <circle cx="14" cy="6" r="1" fill="currentColor" stroke="none" />
          <circle cx="17.5" cy="9" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'palette-filled':
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <path d="M12 2C17.5222 2 22 5.97778 22 10.8889C22 13.9556 19.5111 16.4444 16.4444 16.4444H14.4778C13.5556 16.4444 12.8111 17.1889 12.8111 18.1111C12.8111 18.5333 12.9778 18.9222 13.2333 19.2111C13.5 19.5111 13.6667 19.9 13.6667 20.3333C13.6667 21.2556 12.9 22 12 22C6.47778 22 2 17.5222 2 12C2 6.47778 6.47778 2 12 2ZM10.8111 18.1111C10.8111 16.0843 12.451 14.4444 14.4778 14.4444H16.4444C18.4065 14.4444 20 12.851 20 10.8889C20 7.1392 16.4677 4 12 4C7.58235 4 4 7.58235 4 12C4 16.19 7.2226 19.6285 11.324 19.9718C10.9948 19.4168 10.8111 18.7761 10.8111 18.1111ZM7.5 12C6.67157 12 6 11.3284 6 10.5C6 9.67157 6.67157 9 7.5 9C8.32843 9 9 9.67157 9 10.5C9 11.3284 8.32843 12 7.5 12ZM16.5 12C15.6716 12 15 11.3284 15 10.5C15 9.67157 15.6716 9 16.5 9C17.3284 9 18 9.67157 18 10.5C18 11.3284 17.3284 12 16.5 12ZM12 9C11.1716 9 10.5 8.32843 10.5 7.5C10.5 6.67157 11.1716 6 12 6C12.8284 6 13.5 6.67157 13.5 7.5C13.5 8.32843 12.8284 9 12 9Z" />
        </svg>
      );
    case 'pencil':
      return (
        <svg {...common}>
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z" />
        </svg>
      );
    case 'plus':
      return (
        <svg {...common}>
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
      );
    case 'plus-filled':
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <path d="M11 11V5H13V11H19V13H13V19H11V13H5V11H11Z" />
        </svg>
      );
    case 'play':
      return (
        <svg {...common}>
          <path d="M6 4v16l14-8z" />
        </svg>
      );
    case 'present':
      return (
        <svg {...common}>
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <path d="M8 21h8" />
          <path d="M12 17v4" />
        </svg>
      );
    case 'refresh':
      return (
        <svg {...common}>
          <path d="M3 12a9 9 0 0 1 15.9-5.7L21 8" />
          <path d="M21 3v5h-5" />
          <path d="M21 12a9 9 0 0 1-15.9 5.7L3 16" />
          <path d="M3 21v-5h5" />
        </svg>
      );
    case 'reload':
      return (
        <svg {...common}>
          <path d="M21 12a9 9 0 1 1-3-6.7" />
          <path d="M21 4v5h-5" />
        </svg>
      );
    case 'search':
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      );
    case 'send':
      return (
        <svg {...common}>
          <path d="M22 2 11 13" />
          <path d="m22 2-7 20-4-9-9-4z" />
        </svg>
      );
    case 'settings':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 0 1-2.82 2.83l-.06-.07a1.7 1.7 0 0 0-1.88-.33 1.7 1.7 0 0 0-1.04 1.56V21a2 2 0 0 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.82l.07-.06a1.7 1.7 0 0 0 .33-1.88 1.7 1.7 0 0 0-1.56-1.04H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.56-1.04 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.07A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1.04-1.56V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1.04 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.07.06a1.7 1.7 0 0 0-.33 1.87V9a1.7 1.7 0 0 0 1.56 1.04H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.56 1.04Z" />
        </svg>
      );
    case 'share':
      return (
        <svg {...common}>
          <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
          <path d="m16 6-4-4-4 4" />
          <path d="M12 2v13" />
        </svg>
      );
    case 'sliders':
      return (
        <svg {...common}>
          <path d="M4 21v-7" />
          <path d="M4 10V3" />
          <path d="M12 21v-9" />
          <path d="M12 8V3" />
          <path d="M20 21v-5" />
          <path d="M20 12V3" />
          <path d="M1 14h6" />
          <path d="M9 8h6" />
          <path d="M17 16h6" />
        </svg>
      );
    case 'spinner':
      return (
        <svg {...common} className={`icon-spin ${rest.className ?? ''}`.trim()}>
          <path d="M21 12a9 9 0 1 1-6.22-8.56" />
        </svg>
      );
    case 'sparkles':
      return (
        <svg {...common}>
          <path d="m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z" />
          <path d="M19 14v3" />
          <path d="M19 21v-1" />
          <path d="M22 17h-3" />
          <path d="M16 17h-1" />
        </svg>
      );
    case 'star':
      return (
        <svg {...common}>
          <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
        </svg>
      );
    case 'stop':
      return (
        <svg {...common}>
          <rect x="6" y="6" width="12" height="12" rx="1.5" />
        </svg>
      );
    case 'sun':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      );
    case 'moon':
      return (
        <svg {...common}>
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
        </svg>
      );
    case 'sun-moon':
      return (
        <svg {...common}>
          <path d="M12 8a2.83 2.83 0 0 0 4 4 4 4 0 1 1-4-4" />
          <path d="M12 2v2" />
          <path d="M12 20v2" />
          <path d="m4.9 4.9 1.4 1.4" />
          <path d="m17.7 17.7 1.4 1.4" />
          <path d="M2 12h2" />
          <path d="M20 12h2" />
          <path d="m6.3 17.7-1.4 1.4" />
          <path d="m19.1 4.9-1.4 1.4" />
        </svg>
      );
    case 'terminal':
      // Lucide-style terminal — a command-prompt chevron plus an underscore
      // input line, used for the workspace "New Terminal" launcher action and
      // the terminal:<id> tab icon.
      return (
        <svg {...common}>
          <path d="m7 11 3-3-3-3" />
          <path d="M13 13h6" />
        </svg>
      );
    case 'thumbs-up':
      return (
        <svg {...common}>
          <path d="M7 10v11" />
          <path d="M15 6.8 14 10h4.5a2 2 0 0 1 2 2.3l-1.1 6.6A2.5 2.5 0 0 1 17 21H6a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h2.8L12 4a2 2 0 0 1 3 2.8Z" />
        </svg>
      );
    case 'thumbs-down':
      return (
        <svg {...common}>
          <path d="M7 14V3" />
          <path d="m15 17.2-1-3.2h4.5a2 2 0 0 0 2-2.3L19.4 5A2.5 2.5 0 0 0 17 3H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2.8L12 20a2 2 0 0 0 3-2.8Z" />
        </svg>
      );
    case 'tweaks':
      return (
        <svg {...common}>
          <path d="M4 6h13" />
          <circle cx="19" cy="6" r="2" />
          <path d="M4 18h7" />
          <circle cx="13" cy="18" r="2" />
          <path d="M17 12H4" />
          <circle cx="19" cy="12" r="2" />
        </svg>
      );
    case 'upload':
      return (
        <svg {...common}>
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <path d="m17 8-5-5-5 5" />
          <path d="M12 3v12" />
        </svg>
      );
    case 'zoom-in':
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="7" />
          <path d="M11 8v6" />
          <path d="M8 11h6" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      );
    case 'zoom-out':
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="7" />
          <path d="M8 11h6" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      );
    case 'trash':
      return (
        <svg {...common}>
          <path d="M3 6h18" />
          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
        </svg>
      );
    default:
      return null;
  }
}
