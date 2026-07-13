import type { HTMLAttributes } from 'react';

export type IconName =
  | 'alert-triangle'
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
  | 'file-text'
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
  | 'layout'
  | 'lightbulb'
  | 'link'
  | 'log-out'
  | 'integrations-filled'
  | 'maximize'
  | 'mic'
  | 'minimize'
  | 'minus'
  | 'more-horizontal'
  | 'orbit'
  | 'paint-bucket'
  | 'panel-left'
  | 'palette'
  | 'palette-filled'
  | 'pencil'
  | 'plus'
  | 'plus-filled'
  | 'puzzle'
  | 'star'
  | 'swatchbook'
  | 'play'
  | 'present'
  | 'refresh'
  | 'reload'
  | 'search'
  | 'send'
  | 'settings'
  | 'battery-charge'
  | 'share'
  | 'sliders'
  | 'smartphone'
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
  | 'volume'
  | 'zoom-in'
  | 'zoom-out';

interface Props extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  name: IconName;
  size?: number | string;
  strokeWidth?: number;
}

const REMIX_ICON: Record<IconName, string> = {
  'alert-triangle': 'error-warning-line',
  'arrow-left': 'arrow-left-line',
  'arrow-up': 'arrow-up-line',
  attach: 'attachment-2',
  bell: 'notification-3-line',
  blocks: 'layout-grid-line',
  check: 'check-line',
  'chevron-down': 'arrow-down-s-line',
  'chevron-left': 'arrow-left-s-line',
  'chevron-right': 'arrow-right-s-line',
  close: 'close-line',
  copy: 'file-copy-line',
  comment: 'chat-1-line',
  discord: 'discord-line',
  download: 'download-2-line',
  draw: 'brush-line',
  edit: 'edit-line',
  'external-link': 'external-link-line',
  eye: 'eye-line',
  'eye-off': 'eye-off-line',
  file: 'file-line',
  'file-code': 'file-code-line',
  'file-text': 'file-text-line',
  folder: 'folder-line',
  'folder-filled': 'folder-fill',
  fork: 'git-branch-line',
  github: 'github-line',
  'github-filled': 'github-fill',
  'grip-vertical': 'drag-move-line',
  grid: 'grid-line',
  globe: 'global-line',
  hammer: 'hammer-line',
  'help-circle': 'question-line',
  history: 'history-line',
  home: 'home-5-line',
  'home-filled': 'home-5-fill',
  image: 'image-line',
  import: 'upload-2-line',
  info: 'information-line',
  kanban: 'kanban-view',
  'layers-filled': 'stack-fill',
  languages: 'translate-2',
  layout: 'layout-line',
  lightbulb: 'lightbulb-line',
  link: 'link',
  'log-out': 'logout-box-r-line',
  'integrations-filled': 'puzzle-fill',
  maximize: 'fullscreen-line',
  mic: 'mic-line',
  minimize: 'fullscreen-exit-line',
  minus: 'subtract-line',
  'more-horizontal': 'more-line',
  orbit: 'planet-line',
  'paint-bucket': 'paint-line',
  'panel-left': 'side-bar-line',
  palette: 'palette-line',
  'palette-filled': 'palette-fill',
  pencil: 'pencil-line',
  plus: 'add-line',
  'plus-filled': 'add-fill',
  puzzle: 'puzzle-line',
  star: 'star-line',
  swatchbook: 'artboard-line',
  play: 'play-line',
  present: 'slideshow-line',
  refresh: 'refresh-line',
  reload: 'reset-left-line',
  search: 'search-line',
  send: 'send-plane-2-line',
  settings: 'settings-3-line',
  'battery-charge': 'battery-charge-line',
  share: 'share-forward-line',
  sliders: 'equalizer-line',
  smartphone: 'smartphone-line',
  spinner: 'loader-4-line',
  sparkles: 'sparkling-line',
  stop: 'stop-line',
  sun: 'sun-line',
  moon: 'moon-line',
  'sun-moon': 'sun-foggy-line',
  terminal: 'terminal-box-line',
  'thumbs-down': 'thumb-down-line',
  'thumbs-up': 'thumb-up-line',
  tweaks: 'sound-module-line',
  upload: 'upload-2-line',
  trash: 'delete-bin-line',
  volume: 'volume-up-line',
  'zoom-in': 'zoom-in-line',
  'zoom-out': 'zoom-out-line',
};

export function Icon({ name, size = 14, className, style, strokeWidth: _strokeWidth, ...rest }: Props) {
  const iconName = REMIX_ICON[name];
  return (
    <i
      className={`ri-${iconName} od-icon${name === 'spinner' ? ' icon-spin' : ''}${className ? ` ${className}` : ''}`}
      aria-hidden="true"
      style={{
        fontSize: size,
        lineHeight: 1,
        width: size,
        height: size,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...style,
      }}
      {...rest}
    />
  );
}
