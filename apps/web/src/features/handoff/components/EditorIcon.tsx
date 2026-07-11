// Per-editor icon for the hand-off menu. Keep these close to the real app
// marks rather than generic pictograms; the menu is primarily a target picker,
// so users should recognize the destination at a glance.

import type { HostEditorId } from '@open-design/contracts';

interface Props {
  editorId: HostEditorId | string;
  size?: number;
}

interface EditorVisual {
  bg: string;
  fg: string;
  glyph: (size: number) => JSX.Element;
}

function simplePath(path: string) {
  return (size: number) => {
    const s = size * 0.76;
    return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d={path} />
      </svg>
    );
  };
}

function vscodeLogo(size: number) {
  const s = size * 0.76;
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M23.15 2.587 18.21.21a1.494 1.494 0 0 0-1.705.29l-9.46 8.63-4.12-3.128a.999.999 0 0 0-1.276.057L.327 7.261A1 1 0 0 0 .326 8.74L3.899 12 .326 15.26a1 1 0 0 0 .001 1.479L1.65 17.94a.999.999 0 0 0 1.276.057l4.12-3.128 9.46 8.63a1.492 1.492 0 0 0 1.704.29l4.942-2.377A1.5 1.5 0 0 0 24 20.06V3.939a1.5 1.5 0 0 0-.85-1.352Zm-5.146 14.861L10.826 12l7.178-5.448v10.896Z" />
    </svg>
  );
}

function finderLogo(size: number) {
  const s = size * 0.78;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="5.4" fill="#2f9bff" />
      <path d="M12 0h6.6A5.4 5.4 0 0 1 24 5.4v13.2a5.4 5.4 0 0 1-5.4 5.4H12Z" fill="#77c2ff" />
      <path d="M11.6 2.2c-1.4 2.4-2.1 5.5-2.1 9.8s.7 7.4 2.1 9.8" fill="none" stroke="#0b4f93" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M7.4 9.1h.1M16.4 9.1h.1" stroke="#0b4f93" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M7.4 15.2c2.9 1.6 6.3 1.6 9.2 0" fill="none" stroke="#0b4f93" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function terminalLogo(size: number) {
  const s = size * 0.76;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="1.5" y="3" width="21" height="18" rx="3" fill="#111" />
      <path d="m6.2 8 4 4-4 4" stroke="#9be37a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12.8 16h5" stroke="#9be37a" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function folderLogo(size: number) {
  const s = size * 0.76;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M2.75 5.75A2.75 2.75 0 0 1 5.5 3h4.32c.74 0 1.43.36 1.86.96l1.1 1.54h5.72a2.75 2.75 0 0 1 2.75 2.75v9.5a2.75 2.75 0 0 1-2.75 2.75h-13A2.75 2.75 0 0 1 2.75 17.75z"
        fill="currentColor"
      />
      <path d="M3.7 8.1h16.6" stroke="#ffffff" strokeWidth="1.25" strokeLinecap="round" opacity=".7" />
    </svg>
  );
}

function qoderLogo(size: number) {
  const s = size * 0.76;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="5" fill="#ffb15e" />
      <path d="M12 4 20 12l-8 8-8-8 8-8Z" fill="#667085" />
      <path d="M12 8.2 15.8 12 12 15.8 8.2 12 12 8.2Z" fill="#1f2937" opacity=".2" />
    </svg>
  );
}

function antigravityLogo(size: number) {
  const s = size * 0.78;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect width="24" height="24" rx="5" fill="#f8fafd" />
      <path d="M6.5 15.4c1.5 2.4 5.1 3.2 8 1.8 2.9-1.4 4.2-4.5 2.7-6.9" stroke="#4285f4" strokeWidth="2.1" strokeLinecap="round" />
      <path d="M17.5 8.6c-1.5-2.4-5.1-3.2-8-1.8-2.9 1.4-4.2 4.5-2.7 6.9" stroke="#ea4335" strokeWidth="2.1" strokeLinecap="round" />
      <path d="M8.2 8.3 12 12l3.8 3.7" stroke="#34a853" strokeWidth="2.1" strokeLinecap="round" />
      <circle cx="12" cy="12" r="2" fill="#fbbc04" />
    </svg>
  );
}

const cursorPath = 'M11.503.131 1.891 5.678a.84.84 0 0 0-.42.726v11.188c0 .3.162.575.42.724l9.609 5.55a1 1 0 0 0 .998 0l9.61-5.55a.84.84 0 0 0 .42-.724V6.404a.84.84 0 0 0-.42-.726L12.497.131a1.01 1.01 0 0 0-.996 0M2.657 6.338h18.55c.263 0 .43.287.297.515L12.23 22.918c-.062.107-.229.064-.229-.06V12.335a.59.59 0 0 0-.295-.51l-9.11-5.257c-.109-.063-.064-.23.061-.23';
const zedPath = 'M2.25 1.5a.75.75 0 0 0-.75.75v16.5H0V2.25A2.25 2.25 0 0 1 2.25 0h20.095c1.002 0 1.504 1.212.795 1.92L10.764 14.298h3.486V12.75h1.5v1.922a1.125 1.125 0 0 1-1.125 1.125H9.264l-2.578 2.578h11.689V9h1.5v9.375a1.5 1.5 0 0 1-1.5 1.5H5.185L2.562 22.5H21.75a.75.75 0 0 0 .75-.75V5.25H24v16.5A2.25 2.25 0 0 1 21.75 24H1.655C.653 24 .151 22.788.86 22.08L13.19 9.75H9.75v1.5h-1.5V9.375A1.125 1.125 0 0 1 9.375 8.25h5.314l2.625-2.625H5.625V15h-1.5V5.625a1.5 1.5 0 0 1 1.5-1.5h13.19L21.438 1.5z';
const windsurfPath = 'M23.55 5.067c-1.2038-.002-2.1806.973-2.1806 2.1765v4.8676c0 .972-.8035 1.7594-1.7597 1.7594-.568 0-1.1352-.286-1.4718-.7659l-4.9713-7.1003c-.4125-.5896-1.0837-.941-1.8103-.941-1.1334 0-2.1533.9635-2.1533 2.153v4.8957c0 .972-.7969 1.7594-1.7596 1.7594-.57 0-1.1363-.286-1.4728-.7658L.4076 5.1598C.2822 4.9798 0 5.0688 0 5.2882v4.2452c0 .2147.0656.4228.1884.599l5.4748 7.8183c.3234.462.8006.8052 1.3509.9298 1.3771.313 2.6446-.747 2.6446-2.0977v-4.893c0-.972.7875-1.7593 1.7596-1.7593h.003a1.798 1.798 0 0 1 1.4718.7658l4.9723 7.0994c.4135.5905 1.05.941 1.8093.941 1.1587 0 2.1515-.9645 2.1515-2.153v-4.8948c0-.972.7875-1.7594 1.7596-1.7594h.194a.22.22 0 0 0 .2204-.2202v-4.622a.22.22 0 0 0-.2203-.2203Z';
const xcodePath = 'M19.06 5.3327c.4517-.1936.7744-.2581 1.097-.1936.5163.1291.7744.5163.968.7098.1936.3872.9034.7744 1.2261.8389.2581.0645.7098-.6453 1.0325-1.2906.3227-.5808.5163-1.3552.4517-1.5488-.0645-.1936-.968-.5808-1.1616-.5808-.1291 0-.3872.1291-.8389.0645-.4517-.0645-.9034-.5808-1.1616-.968-.4517-.6453-1.097-1.0325-1.6778-1.3552-.6453-.3227-1.3552-.5163-2.065-.6453-1.0325-.2581-2.065-.4517-3.0975-.3227-.5808.0645-1.2906.1291-1.8069.3227-.0645 0-.1936.1936-.0645.1936s.5808.0645.5808.0645-.5807.1292-.5807.2583c0 .1291.0645.1291.1291.1291.0645 0 1.4842-.0645 2.065 0 .6453.1291 1.3552.4517 1.8069 1.2261.7744 1.4197.4517 2.7749.2581 3.2266-.968 2.1295-8.6472 15.2294-9.0344 16.1328-.3873.9034-.5163 1.4842.5807 2.065s1.6778.3227 2.0005-.0645c.3872-.5163 7.0339-17.1654 9.2925-18.2624zm-3.6138 8.7117h1.5488c1.0325 0 1.2261.5163 1.2261.7098.0645.5163-.1936 1.1616-1.2261 1.1616h-.968l.7744 1.2906c.4517.7744.2581 1.1616 0 1.4197-.3872.3872-1.2261.3872-1.6778-.4517l-.9034-1.5488c-.6453 1.4197-1.2906 2.9684-2.065 4.7753h4.0009c1.9359 0 3.5492-1.6133 3.5492-3.5492V6.5588c-.0645-.1291-.1936-.0645-.2581 0-.3872.4517-1.4842 2.0004-4.001 7.4856zm-9.8087 8.0019h-.3227c-2.3231 0-4.1945-1.8714-4.1945-4.1945V7.0105c0-2.3231 1.8714-4.1945 4.1945-4.1945h9.3571c-.1936-.1936-.968-.5163-1.7423-.4517-.3227 0-.968.1291-1.3552-.1291-.3872-.3227-.3227-.5163-.9034-.5163H4.9277c-2.6458 0-4.7753 2.1295-4.7753 4.7753v11.7447c0 2.6458 2.1295 4.7753 4.4527 4.7108.6452 0 .8388-.5162 1.0324-.9034zM20.4152 6.9459v10.9058c0 2.3231-1.8714 4.1945-4.1945 4.1945H11.897s-.3872 1.0325.8389 1.0325h3.8719c2.6458 0 4.7753-2.1295 4.7753-4.7753V8.8173c.0646-.9034-.7098-1.4842-.9679-1.8714zm-18.5851.0646v10.8413c0 1.9359 1.6133 3.5492 3.5492 3.5492h.5808c0-.0645.7744-1.4197 2.4522-4.2591.1936-.3872.4517-.7744.7098-1.2261H4.4114c-.5808 0-.9034-.3872-.968-.7098-.1291-.5163.1936-1.1616.9034-1.1616h2.3877l3.033-5.2916s-.7098-1.2906-.9034-1.6133c-.2582-.4517-.1291-.9034.129-1.1615.3872-.3872 1.0325-.5808 1.6778.4517l.2581.3872.2581-.3872c.5808-.8389.968-.7744 1.2906-.7098.5163.1291.8389.7098.3872 1.6133L8.864 14.0444h1.3552c.4517-.7744.9034-1.5488 1.3552-2.3877-.0645-.3227-.1291-.7098-.0645-1.0325.0645-.5163.3227-.968.6453-1.3552l.3872.6453c1.2261-2.1295 2.1295-3.9364 2.3877-4.6463.1291-.3872.3227-1.1616.1291-1.8069H5.3794c-2.0005.0001-3.5493 1.6134-3.5493 3.5494zM4.605 17.7872c0-.0645.7744-1.4197.7744-1.4197 1.2261-.3227 1.8069.4517 1.8714.5163 0 0-.8389 1.4842-1.097 1.7423s-.5808.3227-.9034.2581c-.5164-.129-.839-.6453-.6454-1.097z';
const webstormPath = 'M0 0v24h24V0H0zm17.889 2.889c1.444 0 2.667.444 3.667 1.278l-1.111 1.667c-.889-.611-1.722-1-2.556-1s-1.278.389-1.278.889v.056c0 .667.444.889 2.111 1.333 2 .556 3.111 1.278 3.111 3v.056c0 2-1.5 3.111-3.611 3.111-1.5-.056-3-.611-4.167-1.667l1.278-1.556c.889.722 1.833 1.222 2.944 1.222.889 0 1.389-.333 1.389-.944v-.056c0-.556-.333-.833-2-1.278-2-.5-3.222-1.056-3.222-3.056v-.056c0-1.833 1.444-3 3.444-3zm-16.111.222h2.278l1.5 5.778 1.722-5.778h1.667l1.667 5.778 1.5-5.778h2.333l-2.833 9.944H9.723L8.112 7.277l-1.667 5.778H4.612L1.779 3.111zm.5 16.389h9V21h-9v-1.5z';
const ideaPath = 'M0 0v24h24V0zm3.723 3.111h5v1.834h-1.39v6.277h1.39v1.834h-5v-1.834h1.444V4.945H3.723zm11.055 0H17v6.5c0 .612-.055 1.111-.222 1.556-.167.444-.39.777-.723 1.11-.277.279-.666.557-1.11.668a3.933 3.933 0 0 1-1.445.278c-.778 0-1.444-.167-1.944-.445a4.81 4.81 0 0 1-1.279-1.056l1.39-1.555c.277.334.555.555.833.722.277.167.611.278.945.278.389 0 .721-.111 1-.389.221-.278.333-.667.333-1.278zM2.222 19.5h9V21h-9z';
const warpPath = 'M12.035 2.723h9.253A2.712 2.712 0 0 1 24 5.435v10.529a2.712 2.712 0 0 1-2.712 2.713H8.047Zm-1.681 2.6L6.766 19.677h5.598l-.399 1.6H2.712A2.712 2.712 0 0 1 0 18.565V8.036a2.712 2.712 0 0 1 2.712-2.712Z';

const EDITORS: Record<string, EditorVisual> = {
  vscode: { bg: '#007ACC', fg: '#ffffff', glyph: vscodeLogo },
  cursor: { bg: '#0a0a0a', fg: '#ffffff', glyph: simplePath(cursorPath) },
  windsurf: { bg: '#f7fffb', fg: '#0b100f', glyph: simplePath(windsurfPath) },
  zed: { bg: '#1348DC', fg: '#ffffff', glyph: simplePath(zedPath) },
  qoder: { bg: '#ffb15e', fg: '#1f2937', glyph: qoderLogo },
  antigravity: { bg: '#ffffff', fg: '#1f2937', glyph: antigravityLogo },
  webstorm: { bg: '#000000', fg: '#ffffff', glyph: simplePath(webstormPath) },
  idea: { bg: '#000000', fg: '#ffffff', glyph: simplePath(ideaPath) },
  xcode: { bg: '#147EFB', fg: '#ffffff', glyph: simplePath(xcodePath) },
  finder: { bg: '#3097f6', fg: '#ffffff', glyph: finderLogo },
  explorer: { bg: '#fbbf24', fg: '#1a1a1a', glyph: folderLogo },
  'file-manager': { bg: '#6b7280', fg: '#ffffff', glyph: folderLogo },
  terminal: { bg: '#111111', fg: '#9be37a', glyph: terminalLogo },
  warp: { bg: '#01A4FF', fg: '#ffffff', glyph: simplePath(warpPath) },
};

export function EditorIcon({ editorId, size = 16 }: Props) {
  const visual = EDITORS[editorId];
  if (!visual) {
    // Fallback — match a neutral folder tile rather than the abstract
    // global handoff glyph the previous design used.
    return (
      <span
        className="editor-icon"
        style={{
          width: size,
          height: size,
          background: '#9ca3af',
          color: '#ffffff',
        }}
      >
        <svg
          width={size * 0.6}
          height={size * 0.6}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      </span>
    );
  }
  return (
    <span
      className="editor-icon"
      style={{ width: size, height: size, background: visual.bg, color: visual.fg }}
    >
      {visual.glyph(size)}
    </span>
  );
}
