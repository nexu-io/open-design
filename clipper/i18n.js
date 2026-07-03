// Open Design Web Clipper i18n runtime.
//
// Standalone on purpose: the clipper is not part of the pnpm workspace, so the
// popup, content script, service worker, and injected design-system renderer all use
// this small browser/worker-safe dictionary instead of importing app code.

(function () {
  const LOCALES = ['en', 'id', 'de', 'zh-CN', 'zh-TW', 'pt-BR', 'es-ES', 'ru', 'fa', 'ar', 'ja', 'ko', 'pl', 'hu', 'fr', 'uk', 'tr', 'th', 'it', 'vi', 'nl'];
  const RTL = new Set(['ar', 'fa']);

  const en = {
    extensionName: 'Open Design Web Clipper',
    extensionDescription: 'Clip pages, design systems, screenshots, images, and Figma import JSON into your Open Design Library.',
    webClipper: 'Web Clipper',
    openDesign: 'Open Design',
    statusConnected: 'Connected',
    statusOffline: 'Offline',
    infoLabel: 'What gets captured',
    infoTooltip: '"Capture page" saves a self-contained page copy. "Extract design system" saves a structured design-system HTML asset. Figma JSON must be imported with the OD Figma Import plugin, not dragged into Figma Drafts.',
    capturePageTitle: 'Capture page',
    capturePageSub: 'Full-fidelity snapshot -> Library',
    screenshot: 'Screenshot',
    region: 'Region',
    pickImages: 'Pick images',
    pickElement: 'Pick element',
    figmaJson: 'Figma JSON',
    extractDesignSystem: 'Extract design system',
    hintHtml: '<strong>Open Design</strong> is not running. Start the app, then reopen this popup - the clipper connects automatically.',
    advanced: 'Advanced',
    onPageBar: 'On-page bar',
    onPageBarSub: 'floating launcher on the page',
    imageHoverButton: 'Image hover button',
    imageHoverButtonSub: 'tiny save button on each image',
    inlineImages: 'Inline images',
    inlineImagesSub: 'higher fidelity, larger files',
    daemonUrl: 'Daemon URL',
    save: 'Save',
    refreshPage: 'Refresh page',
    refreshPageTitle: 'Reload this page so Open Design can attach',
    toggleOnPageBar: 'Toggle the on-page bar',
    toggleImageHover: 'Toggle the per-image hover capture button',
    close: 'Close',
    cancel: 'Cancel',
    clear: 'Clear',
    selectAll: 'Select all',
    unknown: 'unknown',
    noResponse: 'no response',
    failed: 'Failed: {error}',
    extensionErrorReload: 'Extension error - reload the page',
    openDesignNotRunning: 'Open Design is not running - start the app first.',
    savedConnected: 'Saved - connected.',
    savedNotDetected: 'Saved, but Open Design was not detected at that URL.',
    capturingPage: 'Capturing page...',
    pageAlreadyInLibrary: 'Page already in library.',
    largePagePartialLayout: 'large page - partial layout',
    figmaLayoutSkippedPageTooLarge: 'Figma layout skipped - page too large',
    resourcesLeftLinks: '{count} resource(s) left as links',
    imagesLeftLinks: '{count} image(s) left as links',
    savedPageWithFigma: 'Saved page + Figma capture{suffix} to library.',
    savedPage: 'Saved page{suffix} to library.',
    buildingFigma: 'Building Figma import JSON...',
    figmaDownloaded: 'Figma JSON downloaded. Open it with the OD Figma Import plugin (Figma -> Plugins -> Development) - do not drag the file into Figma. First time: install the plugin once from figma-plugin/ (see its README).',
    extractingDesignSystem: 'Extracting design system...',
    designSystemAlreadyInLibrary: 'Design system already in library{suffix}.',
    designSystemSaved: 'Design system saved to library{suffix}.',
    capturingScreenshot: 'Capturing screenshot...',
    alreadyInLibrary: 'Already in library.',
    screenshotSaved: 'Screenshot saved to library.',
    openNormalPage: 'Open a normal web page to use this.',
    openNormalPageForBar: 'Open a normal web page to use the on-page bar.',
    odNotAttached: 'Open Design has not attached to this page yet.',
    elementPickerUnavailable: 'The element picker is not available on this page - try a normal website.',
    imagePickerUnavailable: 'The image picker is not available on this page - try a normal website.',
    regionUnavailable: 'Region capture is not available on this page - try a normal website.',
    clickElement: 'Click an element on the page...',
    pickImagesOnPage: 'Pick images on the page...',
    dragRegionOnPage: 'Drag a region on the page...',
    onPageBarUnavailable: 'The on-page bar is not available on this page - try a normal website.',
    onPageBarShown: 'On-page bar shown.',
    onPageBarHidden: 'On-page bar hidden.',
    imageHoverOn: 'Image hover button on.',
    imageHoverOff: 'Image hover button off.',
    readyTryAgain: 'Ready - try again.',
    reloadingPage: 'Reloading the page...',
    reloadedReopen: 'Reloaded - reopen this popup to continue.',
    toolbarDrag: 'Drag to move',
    toolbarDragLabel: 'Drag the Open Design bar',
    toolbarHomeTip: 'Open Design - open-design.ai',
    toolbarHomeLabel: 'Open Design home',
    toolbarCapturePage: 'Capture page -> Library',
    toolbarExtractDesignSystem: 'Extract design system',
    toolbarDownloadFigma: 'Download Figma import JSON',
    toolbarCaptureScreenshot: 'Capture screenshot',
    toolbarCaptureRegion: 'Capture a region',
    toolbarPickImages: 'Pick images to save',
    toolbarPickElement: 'Pick an element to capture',
    toolbarHide: 'Hide Open Design bar',
    openDesignStartApp: 'Open Design is not running - start the app',
    savedPageFigmaShort: 'Saved page + Figma',
    savedPageShort: 'Saved page',
    someImagesLeftLinks: 'some images left as links',
    savedDesignSystemShort: 'Saved design system',
    savedScreenshot: 'Saved screenshot',
    elementPickerTitle: 'Select an element',
    elementPickerHint: 'hover, then click to capture',
    capture: 'Capture',
    elementPickCancelled: 'Element pick cancelled',
    elementNoVisibleSize: 'That element has no visible size',
    elementAlreadyInLibrary: 'Element already in library',
    elementSaved: 'Saved element to library',
    noImagesFound: 'No images found on this page',
    selectImagesToSave: 'Select images to save',
    selectedCount: '{selected} / {total} selected',
    saveNToLibrary: 'Save {count} to Library',
    imageLabel: 'Image {index}',
    findOnPage: 'Find on page',
    saving: 'Saving...',
    savingImages: 'Saving {count} image(s)...',
    savedImagesCount: 'Saved {count}/{total} image(s) to library',
    // On-bar progress while a capture runs: a step counter, a rough ETA, and a
    // patience line once the wait runs past the expected budget.
    busyStepOf: 'Step {step} of {total}',
    busyAbout: 'about {sec}s',
    busyTakingLonger: 'Still working — thanks for your patience',
    busyPageSnapshot: 'Snapshotting the page…',
    busyPageInline: 'Inlining styles & images…',
    busyPageSaving: 'Saving to your Library…',
    busySystemReading: 'Reading page styles…',
    busySystemExtract: 'Extracting colors, type & components…',
    busySystemBuilding: 'Building the design-system asset…',
    busySystemSaving: 'Saving to your Library…',
    busyFigmaReading: 'Reading the page layout…',
    busyFigmaBuilding: 'Building Figma import JSON…',
    busyFigmaPreparing: 'Preparing the download…',
    busyShotCapturing: 'Capturing screenshot…',
    busyShotSaving: 'Saving to your Library…',
    busyRegionCapturing: 'Capturing the region…',
    busyRegionSaving: 'Saving to your Library…',
    busyElementCapturing: 'Capturing the element…',
    busyElementSaving: 'Saving to your Library…',
    busyImagesDownloading: 'Downloading {count} image(s)…',
    busyImagesSaving: 'Saving to your Library…',
    regionTooSmall: 'Region too small - drag a larger box',
    regionCancelled: 'Region capture cancelled',
    dragToSelectRegion: 'Drag',
    dragToSelectRegionTail: 'to select a region',
    regionAlreadyInLibrary: 'Region already in library',
    regionSaved: 'Saved region to library',
    saveImageToLibrary: 'Save image to Open Design Library',
    saveImageToOpenDesign: 'Save image to Open Design',
    savingImage: 'Saving image...',
    imageSaved: 'Saved image to library',
    imageSaveFailed: 'Could not save that image',
    errorCaptureTooLarge: 'Capture too large - try unchecking "Inline images" in Advanced',
    errorDesignSystemCaptureFailed: 'design system capture failed',
    brandFallbackTitle: 'Captured brand',
    brandFallbackDescription: 'Programmatically extracted from the live web page.',
    brandPageTitleSuffix: 'Design System Capture',
    brandFileTitle: '{title} Design System',
    brandExtracted: 'Extracted design system',
    brandAssetMap: 'Brand asset map',
    brandAssetMapSub: '6 extracted groups',
    brandLogo: 'Logo',
    brandImages: 'Images',
    brandTypography: 'Typography',
    brandPalette: 'Palette',
    brandVoice: 'Voice',
    brandComponents: 'Components',
    brandLogoCount: '{count} marks and app icons',
    brandImageCount: '{count} representative images',
    brandFontCount: '{count} font families',
    brandColorCount: '{count} observed colors',
    brandHeadingCount: '{count} heading samples',
    brandComponentSummary: 'Buttons, fields, cards and navigation',
    brandIdentity: 'Identity',
    brandLogoSub: 'Brand marks',
    brandTypographySub: 'Live computed styles',
    brandPaletteSub: 'Light and dark tokens',
    brandComponentKit: 'Component kit',
    brandComponentKitSub: 'Template filled from page tokens',
    brandImagesSub: 'Representative assets',
    brandVoiceContent: 'Voice & Content',
    brandVoiceContentSub: 'Detected headings',
    brandNoImages: 'No large page images were detected.',
    brandObservedColor: 'observed color',
    brandNoHeading: 'No heading sample was available.',
    brandKeywordFallback: 'captured brand',
    brandAssetAlt: 'Brand asset',
    brandLogoAsset: 'Logo asset',
    brandImageAlt: 'Brand image {index}',
    brandImageLabel: 'Image {index}',
    brandTheme: 'Theme',
    brandLight: 'Light',
    brandDark: 'Dark',
    brandPrimaryAction: 'Primary action',
    brandSecondaryAction: 'Secondary',
    brandFormField: 'Form field',
    brandFormFieldSample: 'Form field sample',
    brandSurfaceCard: 'Surface card',
    brandSurfaceCardText: 'Radius, border, color and type inherit from the extracted design system.',
    brandNavigationItem: 'Navigation item',
    brandDataNote: 'This file contains a structured JSON payload at <code>#od-design-system-data</code> for future automation.',
    swatchBackground: 'Background',
    swatchSurface: 'Surface',
    swatchForeground: 'Foreground',
    swatchMuted: 'Muted',
    swatchBorder: 'Border',
    swatchAccent: 'Accent',
    swatchSupport: 'Support',
    swatchHighlight: 'Highlight',
    swatchColor: 'Color {index}',
  };

  const overrides = {
    id: {
      extensionDescription: 'Klip halaman, sistem desain, tangkapan layar, gambar, dan JSON impor Figma ke Library Open Design.',
      webClipper: 'Web Clipper', statusConnected: 'Terhubung', statusOffline: 'Offline',
      capturePageTitle: 'Klip halaman', capturePageSub: 'Snapshot lengkap -> Library',
      screenshot: 'Tangkapan layar', region: 'Area', pickImages: 'Pilih gambar', pickElement: 'Pilih elemen',
      extractDesignSystem: 'Ekstrak sistem desain', advanced: 'Lanjutan', inlineImages: 'Sematkan gambar',
      onPageBar: 'Bilah di halaman', imageHoverButton: 'Tombol gambar', save: 'Simpan', refreshPage: 'Muat ulang halaman',
      extractingDesignSystem: 'Mengekstrak sistem desain...', designSystemSaved: 'Sistem desain disimpan ke library{suffix}.',
      toolbarExtractDesignSystem: 'Ekstrak sistem desain', savedDesignSystemShort: 'Sistem desain disimpan',
      brandExtracted: 'Sistem desain diekstrak', brandPageTitleSuffix: 'Tangkapan Sistem Desain', brandAssetMap: 'Peta aset sistem desain',
      brandIdentity: 'Identitas', brandLogo: 'Logo', brandImages: 'Gambar', brandTypography: 'Tipografi',
      brandPalette: 'Palet', brandVoice: 'Suara', brandComponents: 'Komponen', brandComponentKit: 'Kit komponen',
    },
    de: {
      extensionDescription: 'Sammle Seiten, Designsysteme, Screenshots, Bilder und Figma-Import-JSON in deiner Open Design Library.',
      webClipper: 'Web Clipper', statusConnected: 'Verbunden', statusOffline: 'Offline',
      capturePageTitle: 'Seite erfassen', capturePageSub: 'Vollständiger Snapshot -> Library',
      screenshot: 'Screenshot', region: 'Bereich', pickImages: 'Bilder wählen', pickElement: 'Element wählen',
      extractDesignSystem: 'Designsystem extrahieren', advanced: 'Erweitert', inlineImages: 'Bilder einbetten',
      onPageBar: 'Seitenleiste', imageHoverButton: 'Bild-Hover-Button', save: 'Speichern', refreshPage: 'Seite neu laden',
      extractingDesignSystem: 'Designsystem wird extrahiert...', designSystemSaved: 'Designsystem in Library gespeichert{suffix}.',
      toolbarExtractDesignSystem: 'Designsystem extrahieren', savedDesignSystemShort: 'Designsystem gespeichert',
      brandExtracted: 'Extrahiertes Designsystem', brandPageTitleSuffix: 'Designsystem-Erfassung', brandAssetMap: 'Designsystem-Asset-Karte',
      brandIdentity: 'Identität', brandLogo: 'Logo', brandImages: 'Bilder', brandTypography: 'Typografie',
      brandPalette: 'Palette', brandVoice: 'Stimme', brandComponents: 'Komponenten', brandComponentKit: 'Komponenten-Kit',
    },
    'zh-CN': {
      extensionName: 'Open Design 网页剪藏',
      extensionDescription: '将网页、设计系统、截图、图片和 Figma 导入 JSON 剪藏到 Open Design 素材库。',
      webClipper: '网页剪藏', statusConnected: '已连接', statusOffline: '离线',
      infoLabel: '捕获内容说明',
      infoTooltip: '“捕获页面”会保存自包含页面副本。“提取设计系统”会保存结构化设计系统 HTML 资产。Figma JSON 需要在 OD Figma Import 插件内导入，不能拖进 Figma Drafts。',
      capturePageTitle: '捕获页面', capturePageSub: '高保真快照 -> 素材库',
      screenshot: '截图', region: '区域', pickImages: '选择图片', pickElement: '选择元素',
      figmaJson: 'Figma JSON', extractDesignSystem: '提取设计系统',
      hintHtml: '<strong>Open Design</strong> 未运行。启动应用后重新打开此弹窗，插件会自动连接。',
      advanced: '高级', onPageBar: '页面浮条', onPageBarSub: '网页上的悬浮启动器',
      imageHoverButton: '图片悬浮按钮', imageHoverButtonSub: '每张图片上的小保存按钮',
      inlineImages: '内联图片', inlineImagesSub: '保真度更高，文件更大',
      daemonUrl: 'Daemon 地址', save: '保存', refreshPage: '刷新页面', refreshPageTitle: '刷新此页面以便 Open Design 挂载',
      toggleOnPageBar: '切换页面浮条', toggleImageHover: '切换图片悬浮捕获按钮',
      openDesignNotRunning: 'Open Design 未运行，请先启动应用。', savedConnected: '已保存，已连接。',
      savedNotDetected: '已保存，但该地址未检测到 Open Design。', capturingPage: '正在捕获页面...',
      pageAlreadyInLibrary: '页面已在素材库中。', largePagePartialLayout: '页面较大，布局部分捕获',
      figmaLayoutSkippedPageTooLarge: '页面过大，已跳过 Figma 布局', resourcesLeftLinks: '{count} 个资源保留为链接',
      imagesLeftLinks: '{count} 张图片保留为链接', savedPageWithFigma: '已保存页面 + Figma 捕获{suffix}到素材库。',
      savedPage: '已保存页面{suffix}到素材库。', buildingFigma: '正在生成 Figma 导入 JSON...',
      figmaDownloaded: 'Figma JSON 已下载。请用 OD Figma Import 插件打开（Figma -> Plugins -> Development），不要直接把文件拖进 Figma。首次使用需先从 figma-plugin/ 安装插件（见其 README）。',
      extractingDesignSystem: '正在提取设计系统...', designSystemAlreadyInLibrary: '设计系统已在素材库中{suffix}。',
      designSystemSaved: '设计系统已保存到素材库{suffix}。', capturingScreenshot: '正在截图...',
      alreadyInLibrary: '已在素材库中。', screenshotSaved: '截图已保存到素材库。',
      openNormalPage: '请打开普通网页后使用。', openNormalPageForBar: '请打开普通网页后使用页面浮条。',
      odNotAttached: 'Open Design 尚未挂载到此页面。', elementPickerUnavailable: '此页面不可使用元素选择器，请尝试普通网站。',
      imagePickerUnavailable: '此页面不可使用图片选择器，请尝试普通网站。', regionUnavailable: '此页面不可使用区域截图，请尝试普通网站。',
      clickElement: '在页面上点击一个元素...', pickImagesOnPage: '在页面上选择图片...', dragRegionOnPage: '在页面上拖选区域...',
      onPageBarUnavailable: '此页面不可使用页面浮条，请尝试普通网站。', onPageBarShown: '页面浮条已显示。',
      onPageBarHidden: '页面浮条已隐藏。', imageHoverOn: '图片悬浮按钮已开启。', imageHoverOff: '图片悬浮按钮已关闭。',
      readyTryAgain: '已就绪，请重试。', reloadingPage: '正在刷新页面...', reloadedReopen: '已刷新，请重新打开此弹窗继续。',
      toolbarDrag: '拖动移动', toolbarDragLabel: '拖动 Open Design 浮条', toolbarCapturePage: '捕获页面 -> 素材库',
      toolbarExtractDesignSystem: '提取设计系统', toolbarDownloadFigma: '下载 Figma 导入 JSON', toolbarCaptureScreenshot: '截图',
      toolbarCaptureRegion: '捕获区域', toolbarPickImages: '选择要保存的图片', toolbarPickElement: '选择要捕获的元素',
      toolbarHide: '隐藏 Open Design 浮条', openDesignStartApp: 'Open Design 未运行，请启动应用',
      savedPageFigmaShort: '已保存页面 + Figma', savedPageShort: '已保存页面', someImagesLeftLinks: '部分图片保留为链接',
      savedDesignSystemShort: '已保存设计系统', savedScreenshot: '已保存截图',
      elementPickerTitle: '选择元素', elementPickerHint: '悬停后点击捕获', capture: '捕获', cancel: '取消', clear: '清除',
      selectAll: '全选', close: '关闭', elementPickCancelled: '已取消元素选择', elementNoVisibleSize: '该元素没有可见尺寸',
      elementAlreadyInLibrary: '元素已在素材库中', elementSaved: '元素已保存到素材库',
      noImagesFound: '此页面未找到图片', selectImagesToSave: '选择要保存的图片',
      selectedCount: '已选择 {selected} / {total}', saveNToLibrary: '保存 {count} 个到素材库',
      imageLabel: '图片 {index}', findOnPage: '在页面中定位', saving: '正在保存...', savingImages: '正在保存 {count} 张图片...',
      busyStepOf: '第 {step}/{total} 步', busyAbout: '约 {sec} 秒', busyTakingLonger: '仍在处理，请耐心等待…',
      busyPageSnapshot: '正在快照页面…', busyPageInline: '正在内联样式与图片…', busyPageSaving: '正在保存到素材库…',
      busySystemReading: '正在读取页面样式…', busySystemExtract: '正在提取颜色、字体与组件…',
      busySystemBuilding: '正在生成设计系统资源…', busySystemSaving: '正在保存到素材库…',
      busyFigmaReading: '正在读取页面布局…', busyFigmaBuilding: '正在生成 Figma 导入 JSON…', busyFigmaPreparing: '正在准备下载…',
      busyShotCapturing: '正在截图…', busyShotSaving: '正在保存到素材库…',
      busyRegionCapturing: '正在捕获区域…', busyRegionSaving: '正在保存到素材库…',
      busyElementCapturing: '正在捕获元素…', busyElementSaving: '正在保存到素材库…',
      busyImagesDownloading: '正在下载 {count} 张图片…', busyImagesSaving: '正在保存到素材库…',
      savedImagesCount: '已保存 {count}/{total} 张图片到素材库', regionTooSmall: '区域太小，请拖选更大的框',
      regionCancelled: '已取消区域截图', dragToSelectRegion: '拖动', dragToSelectRegionTail: '选择区域',
      regionAlreadyInLibrary: '区域已在素材库中', regionSaved: '区域已保存到素材库',
      saveImageToLibrary: '保存图片到 Open Design 素材库', saveImageToOpenDesign: '保存图片到 Open Design',
      savingImage: '正在保存图片...', imageSaved: '图片已保存到素材库', imageSaveFailed: '无法保存该图片',
      errorCaptureTooLarge: '捕获内容过大，请在高级设置中取消“内联图片”后重试', errorDesignSystemCaptureFailed: '设计系统捕获失败',
      brandFallbackTitle: '捕获的品牌', brandFallbackDescription: '从实时网页中程序化提取。',
      brandPageTitleSuffix: '设计系统捕获', brandFileTitle: '{title} 设计系统', brandExtracted: '提取的设计系统',
      brandAssetMap: '品牌资产地图', brandAssetMapSub: '6 组提取结果', brandLogo: '标志', brandImages: '图片',
      brandTypography: '字体', brandPalette: '色板', brandVoice: '语气', brandComponents: '组件',
      brandLogoCount: '{count} 个标志和应用图标', brandImageCount: '{count} 张代表图片',
      brandFontCount: '{count} 个字体族', brandColorCount: '{count} 个观察到的颜色',
      brandHeadingCount: '{count} 个标题样本', brandComponentSummary: '按钮、表单、卡片和导航',
      brandIdentity: '身份', brandLogoSub: '品牌标志', brandTypographySub: '实时计算样式',
      brandPaletteSub: '浅色和深色令牌', brandComponentKit: '组件套件', brandComponentKitSub: '用页面令牌填充的模板',
      brandImagesSub: '代表性资产', brandVoiceContent: '语气与内容', brandVoiceContentSub: '检测到的标题',
      brandNoImages: '未检测到大尺寸页面图片。', brandObservedColor: '观察到的颜色', brandNoHeading: '没有可用标题样本。',
      brandKeywordFallback: '捕获的品牌', brandAssetAlt: '品牌资产', brandLogoAsset: '标志资产',
      brandImageAlt: '品牌图片 {index}', brandImageLabel: '图片 {index}', brandTheme: '主题',
      brandLight: '浅色', brandDark: '深色', brandPrimaryAction: '主要操作', brandSecondaryAction: '次要操作',
      brandFormField: '表单字段', brandFormFieldSample: '表单字段示例', brandSurfaceCard: '表面卡片',
      brandSurfaceCardText: '圆角、边框、颜色和字体继承自提取的设计系统。', brandNavigationItem: '导航项',
      brandDataNote: '此文件在 <code>#od-design-system-data</code> 中包含结构化 JSON，供后续自动化使用。',
      swatchBackground: '背景', swatchSurface: '表面', swatchForeground: '前景', swatchMuted: '弱化',
      swatchBorder: '边框', swatchAccent: '强调', swatchSupport: '辅助', swatchHighlight: '高亮', swatchColor: '颜色 {index}',
    },
    'zh-TW': {
      extensionName: 'Open Design 網頁剪藏',
      extensionDescription: '將網頁、設計系統、截圖、圖片和 Figma 匯入 JSON 剪藏到 Open Design 素材庫。',
      webClipper: '網頁剪藏', statusConnected: '已連線', statusOffline: '離線',
      capturePageTitle: '擷取頁面', capturePageSub: '高保真快照 -> 素材庫',
      screenshot: '截圖', region: '區域', pickImages: '選擇圖片', pickElement: '選擇元素',
      extractDesignSystem: '提取設計系統', advanced: '進階', inlineImages: '內嵌圖片',
      onPageBar: '頁面浮條', imageHoverButton: '圖片懸浮按鈕', save: '儲存', refreshPage: '重新整理頁面',
      extractingDesignSystem: '正在提取設計系統...', designSystemSaved: '設計系統已儲存到素材庫{suffix}。',
      toolbarExtractDesignSystem: '提取設計系統', savedDesignSystemShort: '已儲存設計系統',
      brandExtracted: '提取的設計系統', brandPageTitleSuffix: '設計系統擷取', brandAssetMap: '設計系統資產地圖',
      brandIdentity: '識別', brandLogo: '標誌', brandImages: '圖片', brandTypography: '字體',
      brandPalette: '色板', brandVoice: '語氣', brandComponents: '元件', brandComponentKit: '元件套件',
      brandLight: '淺色', brandDark: '深色',
      busyStepOf: '第 {step}/{total} 步', busyAbout: '約 {sec} 秒', busyTakingLonger: '仍在處理，請耐心等候…',
      busyPageSnapshot: '正在快照頁面…', busyPageInline: '正在內聯樣式與圖片…', busyPageSaving: '正在儲存到素材庫…',
      busySystemReading: '正在讀取頁面樣式…', busySystemExtract: '正在提取顏色、字體與元件…',
      busySystemBuilding: '正在產生設計系統資源…', busySystemSaving: '正在儲存到素材庫…',
      busyFigmaReading: '正在讀取頁面佈局…', busyFigmaBuilding: '正在產生 Figma 匯入 JSON…', busyFigmaPreparing: '正在準備下載…',
      busyShotCapturing: '正在截圖…', busyShotSaving: '正在儲存到素材庫…',
      busyRegionCapturing: '正在擷取區域…', busyRegionSaving: '正在儲存到素材庫…',
      busyElementCapturing: '正在擷取元素…', busyElementSaving: '正在儲存到素材庫…',
      busyImagesDownloading: '正在下載 {count} 張圖片…', busyImagesSaving: '正在儲存到素材庫…',
    },
    'pt-BR': {
      extensionDescription: 'Capture páginas, kits de marca, screenshots, imagens e JSON de importação do Figma na sua Library Open Design.',
      statusConnected: 'Conectado', statusOffline: 'Offline', capturePageTitle: 'Capturar página',
      screenshot: 'Screenshot', region: 'Região', pickImages: 'Escolher imagens', pickElement: 'Escolher elemento',
      extractDesignSystem: 'Extrair sistema de design', advanced: 'Avançado', inlineImages: 'Incorporar imagens',
      onPageBar: 'Barra na página', save: 'Salvar', refreshPage: 'Recarregar página',
      toolbarExtractDesignSystem: 'Extrair sistema de design', savedDesignSystemShort: 'Sistema de design salvo',
      brandExtracted: 'Sistema de design extraído', brandPageTitleSuffix: 'Captura de Sistema de Design',
      brandAssetMap: 'Mapa de ativos do sistema de design', brandIdentity: 'Identidade', brandLogo: 'Logo',
      brandImages: 'Imagens', brandTypography: 'Tipografia', brandPalette: 'Paleta', brandVoice: 'Voz',
      brandComponents: 'Componentes', brandComponentKit: 'Kit de componentes',
    },
    'es-ES': {
      extensionDescription: 'Guarda páginas, kits de marca, capturas, imágenes y JSON de importación de Figma en tu Library de Open Design.',
      statusConnected: 'Conectado', statusOffline: 'Sin conexión', capturePageTitle: 'Capturar página',
      screenshot: 'Captura', region: 'Región', pickImages: 'Elegir imágenes', pickElement: 'Elegir elemento',
      extractDesignSystem: 'Extraer sistema de diseño', advanced: 'Avanzado', inlineImages: 'Incrustar imágenes',
      onPageBar: 'Barra en página', save: 'Guardar', refreshPage: 'Recargar página',
      toolbarExtractDesignSystem: 'Extraer sistema de diseño', savedDesignSystemShort: 'Sistema de diseño guardado',
      brandExtracted: 'Sistema de diseño extraído', brandPageTitleSuffix: 'Captura de Sistema de Diseño',
      brandAssetMap: 'Mapa de activos del sistema de diseño', brandIdentity: 'Identidad', brandLogo: 'Logo',
      brandImages: 'Imágenes', brandTypography: 'Tipografía', brandPalette: 'Paleta', brandVoice: 'Voz',
      brandComponents: 'Componentes', brandComponentKit: 'Kit de componentes',
    },
    ru: {
      extensionDescription: 'Сохраняйте страницы, дизайн-системы, скриншоты, изображения и Figma import JSON в библиотеку Open Design.',
      statusConnected: 'Подключено', statusOffline: 'Офлайн', capturePageTitle: 'Захватить страницу',
      screenshot: 'Скриншот', region: 'Область', pickImages: 'Выбрать изображения', pickElement: 'Выбрать элемент',
      extractDesignSystem: 'Извлечь дизайн-систему', advanced: 'Дополнительно', inlineImages: 'Встроить изображения',
      onPageBar: 'Панель на странице', save: 'Сохранить', refreshPage: 'Обновить страницу',
      toolbarExtractDesignSystem: 'Извлечь дизайн-систему', savedDesignSystemShort: 'Дизайн-система сохранена',
      brandExtracted: 'Извлеченная дизайн-система', brandPageTitleSuffix: 'Захват дизайн-системы',
      brandAssetMap: 'Карта активов дизайн-системы', brandIdentity: 'Идентичность', brandLogo: 'Логотип',
      brandImages: 'Изображения', brandTypography: 'Типографика', brandPalette: 'Палитра', brandVoice: 'Тон',
      brandComponents: 'Компоненты', brandComponentKit: 'Набор компонентов',
    },
    fa: {
      extensionDescription: 'صفحه‌ها، سیستم‌های طراحی، اسکرین‌شات‌ها، تصاویر و JSON واردسازی Figma را در کتابخانه Open Design ذخیره کنید.',
      statusConnected: 'متصل', statusOffline: 'آفلاین', capturePageTitle: 'گرفتن صفحه',
      screenshot: 'اسکرین‌شات', region: 'ناحیه', pickImages: 'انتخاب تصاویر', pickElement: 'انتخاب المان',
      extractDesignSystem: 'استخراج سیستم طراحی', advanced: 'پیشرفته', inlineImages: 'درون‌گذاری تصاویر',
      onPageBar: 'نوار روی صفحه', save: 'ذخیره', refreshPage: 'بازخوانی صفحه',
      toolbarExtractDesignSystem: 'استخراج سیستم طراحی', savedDesignSystemShort: 'سیستم طراحی ذخیره شد',
      brandExtracted: 'سیستم طراحی استخراج‌شده', brandPageTitleSuffix: 'برداشت سیستم طراحی',
      brandAssetMap: 'نقشه دارایی سیستم طراحی', brandIdentity: 'هویت', brandLogo: 'لوگو',
      brandImages: 'تصاویر', brandTypography: 'تایپوگرافی', brandPalette: 'پالت', brandVoice: 'لحن',
      brandComponents: 'کامپوننت‌ها', brandComponentKit: 'کیت کامپوننت',
    },
    ar: {
      extensionDescription: 'احفظ الصفحات وأنظمة التصميم ولقطات الشاشة والصور وملف Figma JSON في مكتبة Open Design.',
      statusConnected: 'متصل', statusOffline: 'غير متصل', capturePageTitle: 'التقاط الصفحة',
      screenshot: 'لقطة شاشة', region: 'منطقة', pickImages: 'اختر الصور', pickElement: 'اختر عنصرا',
      extractDesignSystem: 'استخراج نظام التصميم', advanced: 'متقدم', inlineImages: 'تضمين الصور',
      onPageBar: 'شريط الصفحة', save: 'حفظ', refreshPage: 'تحديث الصفحة',
      toolbarExtractDesignSystem: 'استخراج نظام التصميم', savedDesignSystemShort: 'تم حفظ نظام التصميم',
      brandExtracted: 'نظام تصميم مستخرج', brandPageTitleSuffix: 'التقاط نظام التصميم',
      brandAssetMap: 'خريطة أصول نظام التصميم', brandIdentity: 'الهوية', brandLogo: 'الشعار',
      brandImages: 'الصور', brandTypography: 'الخطوط', brandPalette: 'الألوان', brandVoice: 'النبرة',
      brandComponents: 'المكونات', brandComponentKit: 'عدة المكونات',
    },
    ja: {
      extensionDescription: 'ページ、デザインシステム、スクリーンショット、画像、Figma インポート JSON を Open Design Library に保存します。',
      webClipper: 'Web クリッパー', statusConnected: '接続済み', statusOffline: 'オフライン',
      capturePageTitle: 'ページを取得', capturePageSub: '高忠実度スナップショット -> Library',
      screenshot: 'スクリーンショット', region: '範囲', pickImages: '画像を選択', pickElement: '要素を選択',
      extractDesignSystem: 'デザインシステムを抽出', advanced: '詳細', inlineImages: '画像を埋め込む',
      onPageBar: 'ページ上バー', imageHoverButton: '画像ホバーボタン', save: '保存', refreshPage: 'ページを再読み込み',
      extractingDesignSystem: 'デザインシステムを抽出中...', designSystemSaved: 'デザインシステムを Library に保存しました{suffix}。',
      toolbarExtractDesignSystem: 'デザインシステムを抽出', savedDesignSystemShort: 'デザインシステムを保存',
      brandExtracted: '抽出したデザインシステム', brandPageTitleSuffix: 'デザインシステム取得',
      brandAssetMap: 'ブランドアセットマップ', brandIdentity: 'アイデンティティ', brandLogo: 'ロゴ',
      brandImages: '画像', brandTypography: 'タイポグラフィ', brandPalette: 'パレット', brandVoice: 'トーン',
      brandComponents: 'コンポーネント', brandComponentKit: 'コンポーネントキット',
    },
    ko: {
      extensionDescription: '페이지, 디자인 시스템, 스크린샷, 이미지, Figma 가져오기 JSON을 Open Design Library에 저장합니다.',
      statusConnected: '연결됨', statusOffline: '오프라인', capturePageTitle: '페이지 캡처',
      screenshot: '스크린샷', region: '영역', pickImages: '이미지 선택', pickElement: '요소 선택',
      extractDesignSystem: '디자인 시스템 추출', advanced: '고급', inlineImages: '이미지 포함',
      onPageBar: '페이지 바', save: '저장', refreshPage: '페이지 새로고침',
      toolbarExtractDesignSystem: '디자인 시스템 추출', savedDesignSystemShort: '디자인 시스템 저장됨',
      brandExtracted: '추출된 디자인 시스템', brandPageTitleSuffix: '디자인 시스템 캡처',
      brandAssetMap: '디자인 시스템 에셋 맵', brandIdentity: '아이덴티티', brandLogo: '로고',
      brandImages: '이미지', brandTypography: '타이포그래피', brandPalette: '팔레트', brandVoice: '보이스',
      brandComponents: '컴포넌트', brandComponentKit: '컴포넌트 키트',
    },
    pl: {
      extensionDescription: 'Zapisuj strony, systemy projektowe, zrzuty ekranu, obrazy i JSON importu Figma w bibliotece Open Design.',
      statusConnected: 'Połączono', statusOffline: 'Offline', capturePageTitle: 'Przechwyć stronę',
      screenshot: 'Zrzut ekranu', region: 'Region', pickImages: 'Wybierz obrazy', pickElement: 'Wybierz element',
      extractDesignSystem: 'Wyodrębnij system projektowy', advanced: 'Zaawansowane', inlineImages: 'Osadź obrazy',
      onPageBar: 'Pasek na stronie', save: 'Zapisz', refreshPage: 'Odśwież stronę',
      toolbarExtractDesignSystem: 'Wyodrębnij system projektowy', savedDesignSystemShort: 'System projektowy zapisany',
      brandExtracted: 'Wyodrębniony system projektowy', brandPageTitleSuffix: 'Przechwycenie systemu projektowego',
      brandAssetMap: 'Mapa zasobów systemu projektowego', brandIdentity: 'Tożsamość', brandLogo: 'Logo',
      brandImages: 'Obrazy', brandTypography: 'Typografia', brandPalette: 'Paleta', brandVoice: 'Głos',
      brandComponents: 'Komponenty', brandComponentKit: 'Zestaw komponentów',
    },
    hu: {
      extensionDescription: 'Oldalak, designrendszerek, képernyőképek, képek és Figma import JSON mentése az Open Design Librarybe.',
      statusConnected: 'Csatlakozva', statusOffline: 'Offline', capturePageTitle: 'Oldal mentése',
      screenshot: 'Képernyőkép', region: 'Terület', pickImages: 'Képek kiválasztása', pickElement: 'Elem kiválasztása',
      extractDesignSystem: 'Designrendszer kinyerése', advanced: 'Speciális', inlineImages: 'Képek beágyazása',
      onPageBar: 'Oldalsáv', save: 'Mentés', refreshPage: 'Oldal frissítése',
      toolbarExtractDesignSystem: 'Designrendszer kinyerése', savedDesignSystemShort: 'Designrendszer mentve',
      brandExtracted: 'Kinyert designrendszer', brandPageTitleSuffix: 'Designrendszer-rögzítés',
      brandAssetMap: 'Designrendszer-eszköztérkép', brandIdentity: 'Identitás', brandLogo: 'Logó',
      brandImages: 'Képek', brandTypography: 'Tipográfia', brandPalette: 'Paletta', brandVoice: 'Hang',
      brandComponents: 'Komponensek', brandComponentKit: 'Komponenskészlet',
    },
    fr: {
      extensionDescription: 'Capturez pages, systèmes de design, captures, images et JSON import Figma dans votre Library Open Design.',
      statusConnected: 'Connecté', statusOffline: 'Hors ligne', capturePageTitle: 'Capturer la page',
      screenshot: 'Capture', region: 'Zone', pickImages: 'Choisir images', pickElement: 'Choisir élément',
      extractDesignSystem: 'Extraire le système de design', advanced: 'Avancé', inlineImages: 'Intégrer les images',
      onPageBar: 'Barre de page', save: 'Enregistrer', refreshPage: 'Recharger la page',
      toolbarExtractDesignSystem: 'Extraire le système de design', savedDesignSystemShort: 'Système de design enregistré',
      brandExtracted: 'Système de design extrait', brandPageTitleSuffix: 'Capture du système de design',
      brandAssetMap: 'Carte des actifs du système de design', brandIdentity: 'Identité', brandLogo: 'Logo',
      brandImages: 'Images', brandTypography: 'Typographie', brandPalette: 'Palette', brandVoice: 'Voix',
      brandComponents: 'Composants', brandComponentKit: 'Kit de composants',
    },
    uk: {
      extensionDescription: 'Зберігайте сторінки, дизайн-системи, скриншоти, зображення та Figma import JSON у бібліотеку Open Design.',
      statusConnected: 'Підключено', statusOffline: 'Офлайн', capturePageTitle: 'Захопити сторінку',
      screenshot: 'Скриншот', region: 'Область', pickImages: 'Вибрати зображення', pickElement: 'Вибрати елемент',
      extractDesignSystem: 'Витягти дизайн-систему', advanced: 'Додатково', inlineImages: 'Вбудувати зображення',
      onPageBar: 'Панель сторінки', save: 'Зберегти', refreshPage: 'Оновити сторінку',
      toolbarExtractDesignSystem: 'Витягти дизайн-систему', savedDesignSystemShort: 'Дизайн-систему збережено',
      brandExtracted: 'Витягнута дизайн-система', brandPageTitleSuffix: 'Захоплення дизайн-системи',
      brandAssetMap: 'Мапа активів дизайн-системи', brandIdentity: 'Ідентичність', brandLogo: 'Логотип',
      brandImages: 'Зображення', brandTypography: 'Типографіка', brandPalette: 'Палітра', brandVoice: 'Голос',
      brandComponents: 'Компоненти', brandComponentKit: 'Набір компонентів',
    },
    tr: {
      extensionDescription: 'Sayfaları, tasarım sistemlerini, ekran görüntülerini, görselleri ve Figma içe aktarma JSONunu Open Design Libraryye kaydedin.',
      statusConnected: 'Bağlandı', statusOffline: 'Çevrimdışı', capturePageTitle: 'Sayfayı yakala',
      screenshot: 'Ekran görüntüsü', region: 'Bölge', pickImages: 'Görsel seç', pickElement: 'Öğe seç',
      extractDesignSystem: 'Tasarım sistemini çıkar', advanced: 'Gelişmiş', inlineImages: 'Görselleri göm',
      onPageBar: 'Sayfa çubuğu', save: 'Kaydet', refreshPage: 'Sayfayı yenile',
      toolbarExtractDesignSystem: 'Tasarım sistemini çıkar', savedDesignSystemShort: 'Tasarım sistemi kaydedildi',
      brandExtracted: 'Çıkarılan tasarım sistemi', brandPageTitleSuffix: 'Tasarım Sistemi Yakalama',
      brandAssetMap: 'Tasarım sistemi varlık haritası', brandIdentity: 'Kimlik', brandLogo: 'Logo',
      brandImages: 'Görseller', brandTypography: 'Tipografi', brandPalette: 'Palet', brandVoice: 'Ses',
      brandComponents: 'Bileşenler', brandComponentKit: 'Bileşen kiti',
    },
    th: {
      extensionDescription: 'บันทึกหน้าเว็บ ระบบดีไซน์ ภาพหน้าจอ รูปภาพ และ Figma import JSON ไปยัง Open Design Library',
      statusConnected: 'เชื่อมต่อแล้ว', statusOffline: 'ออฟไลน์', capturePageTitle: 'จับภาพหน้า',
      screenshot: 'ภาพหน้าจอ', region: 'พื้นที่', pickImages: 'เลือกรูปภาพ', pickElement: 'เลือกองค์ประกอบ',
      extractDesignSystem: 'ดึงระบบดีไซน์', advanced: 'ขั้นสูง', inlineImages: 'ฝังรูปภาพ',
      onPageBar: 'แถบบนหน้า', save: 'บันทึก', refreshPage: 'โหลดหน้าใหม่',
      toolbarExtractDesignSystem: 'ดึงระบบดีไซน์', savedDesignSystemShort: 'บันทึกระบบดีไซน์แล้ว',
      brandExtracted: 'ระบบดีไซน์ที่ดึงมา', brandPageTitleSuffix: 'การจับระบบดีไซน์',
      brandAssetMap: 'แผนที่ทรัพยากรระบบดีไซน์', brandIdentity: 'อัตลักษณ์', brandLogo: 'โลโก้',
      brandImages: 'รูปภาพ', brandTypography: 'ตัวอักษร', brandPalette: 'พาเลต', brandVoice: 'น้ำเสียง',
      brandComponents: 'คอมโพเนนต์', brandComponentKit: 'ชุดคอมโพเนนต์',
    },
    it: {
      extensionDescription: 'Salva pagine, design system, screenshot, immagini e JSON di importazione Figma nella Library Open Design.',
      statusConnected: 'Connesso', statusOffline: 'Offline', capturePageTitle: 'Acquisisci pagina',
      screenshot: 'Screenshot', region: 'Area', pickImages: 'Scegli immagini', pickElement: 'Scegli elemento',
      extractDesignSystem: 'Estrai design system', advanced: 'Avanzate', inlineImages: 'Incorpora immagini',
      onPageBar: 'Barra pagina', save: 'Salva', refreshPage: 'Ricarica pagina',
      toolbarExtractDesignSystem: 'Estrai design system', savedDesignSystemShort: 'Design system salvato',
      brandExtracted: 'Design system estratto', brandPageTitleSuffix: 'Acquisizione Design System',
      brandAssetMap: 'Mappa asset del design system', brandIdentity: 'Identità', brandLogo: 'Logo',
      brandImages: 'Immagini', brandTypography: 'Tipografia', brandPalette: 'Palette', brandVoice: 'Voce',
      brandComponents: 'Componenti', brandComponentKit: 'Kit componenti',
    },
    vi: {
      extensionDescription: 'Lưu trang, hệ thống thiết kế, ảnh chụp màn hình, hình ảnh và JSON nhập Figma vào Open Design Library.',
      statusConnected: 'Đã kết nối', statusOffline: 'Ngoại tuyến', capturePageTitle: 'Chụp trang',
      screenshot: 'Ảnh chụp màn hình', region: 'Vùng', pickImages: 'Chọn hình ảnh', pickElement: 'Chọn phần tử',
      extractDesignSystem: 'Trích xuất hệ thống thiết kế', advanced: 'Nâng cao', inlineImages: 'Nhúng hình ảnh',
      onPageBar: 'Thanh trên trang', save: 'Lưu', refreshPage: 'Tải lại trang',
      toolbarExtractDesignSystem: 'Trích xuất hệ thống thiết kế', savedDesignSystemShort: 'Đã lưu hệ thống thiết kế',
      brandExtracted: 'Hệ thống thiết kế đã trích xuất', brandPageTitleSuffix: 'Chụp Hệ Thống Thiết Kế',
      brandAssetMap: 'Bản đồ tài sản hệ thống thiết kế', brandIdentity: 'Nhận diện', brandLogo: 'Logo',
      brandImages: 'Hình ảnh', brandTypography: 'Kiểu chữ', brandPalette: 'Bảng màu', brandVoice: 'Giọng điệu',
      brandComponents: 'Thành phần', brandComponentKit: 'Bộ thành phần',
    },
    nl: {
      extensionDescription: 'Sla pagina’s, designsystemen, screenshots, afbeeldingen en Figma-import-JSON op in je Open Design Library.',
      statusConnected: 'Verbonden', statusOffline: 'Offline', capturePageTitle: 'Pagina vastleggen',
      screenshot: 'Screenshot', region: 'Gebied', pickImages: 'Afbeeldingen kiezen', pickElement: 'Element kiezen',
      extractDesignSystem: 'Designsysteem extraheren', advanced: 'Geavanceerd', inlineImages: 'Afbeeldingen insluiten',
      onPageBar: 'Paginabalk', save: 'Opslaan', refreshPage: 'Pagina herladen',
      toolbarExtractDesignSystem: 'Designsysteem extraheren', savedDesignSystemShort: 'Designsysteem opgeslagen',
      brandExtracted: 'Geëxtraheerd designsysteem', brandPageTitleSuffix: 'Designsysteem-vastlegging',
      brandAssetMap: 'Kaart met designsysteem-assets', brandIdentity: 'Identiteit', brandLogo: 'Logo',
      brandImages: 'Afbeeldingen', brandTypography: 'Typografie', brandPalette: 'Palet', brandVoice: 'Stem',
      brandComponents: 'Componenten', brandComponentKit: 'Componentkit',
    },
  };

  const dicts = {};
  for (const locale of LOCALES) dicts[locale] = { ...en, ...(overrides[locale] || {}) };

  function normalizeLocale(raw) {
    const value = String(raw || '').trim().replace(/_/g, '-');
    if (!value) return '';
    const lower = value.toLowerCase();
    const exact = LOCALES.find((locale) => locale.toLowerCase() === lower);
    if (exact) return exact;
    const [language, regionOrScript] = lower.split('-');
    if (language === 'zh') {
      if (['hant', 'tw', 'hk', 'mo'].includes(regionOrScript)) return 'zh-TW';
      return 'zh-CN';
    }
    if (language === 'pt') return 'pt-BR';
    if (language === 'es') return 'es-ES';
    return LOCALES.find((locale) => locale.toLowerCase().split('-')[0] === language) || '';
  }

  function resolveLocale(languages) {
    for (const raw of languages || []) {
      const locale = normalizeLocale(raw);
      if (locale) return locale;
    }
    return 'en';
  }

  function browserLanguages() {
    const values = [];
    try {
      if (typeof chrome !== 'undefined' && chrome.i18n && typeof chrome.i18n.getUILanguage === 'function') {
        values.push(chrome.i18n.getUILanguage());
      }
    } catch {
      // ignore
    }
    try {
      if (typeof navigator !== 'undefined') {
        if (navigator.languages) values.push(...navigator.languages);
        if (navigator.language) values.push(navigator.language);
      }
    } catch {
      // ignore
    }
    return values;
  }

  function currentLocale() {
    return resolveLocale(browserLanguages());
  }

  function interpolate(raw, vars) {
    if (!vars) return raw;
    return raw.replace(/\{(\w+)\}/g, (_, name) => (vars[name] == null ? `{${name}}` : String(vars[name])));
  }

  function t(key, vars, locale) {
    const resolved = normalizeLocale(locale) || currentLocale();
    const dict = dicts[resolved] || en;
    return interpolate(dict[key] || en[key] || key, vars);
  }

  function isRtl(locale) {
    return RTL.has(normalizeLocale(locale) || currentLocale());
  }

  function htmlLang(locale) {
    return normalizeLocale(locale) || currentLocale();
  }

  function translateDocument(root, locale) {
    const doc = root || (typeof document !== 'undefined' ? document : null);
    if (!doc) return;
    const resolved = htmlLang(locale);
    const documentElement = doc.documentElement || doc.querySelector?.('html');
    if (documentElement) {
      documentElement.setAttribute('lang', resolved);
      documentElement.setAttribute('dir', isRtl(resolved) ? 'rtl' : 'ltr');
    }
    doc.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.getAttribute('data-i18n'), undefined, resolved);
    });
    doc.querySelectorAll('[data-i18n-html]').forEach((el) => {
      el.innerHTML = t(el.getAttribute('data-i18n-html'), undefined, resolved);
    });
    doc.querySelectorAll('[data-i18n-title]').forEach((el) => {
      el.setAttribute('title', t(el.getAttribute('data-i18n-title'), undefined, resolved));
    });
    doc.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder'), undefined, resolved));
    });
    doc.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
      el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria-label'), undefined, resolved));
    });
    const title = doc.querySelector('title[data-i18n]');
    if (title) title.textContent = t(title.getAttribute('data-i18n'), undefined, resolved);
  }

  const api = {
    LOCALES,
    dictionaries: dicts,
    normalizeLocale,
    resolveLocale,
    currentLocale,
    htmlLang,
    isRtl,
    t,
    translateDocument,
  };

  globalThis.OD_CLIPPER_I18N = api;
})();
