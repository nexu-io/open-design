// Supported UI locales. Adding a new locale requires creating a new
// dictionary in `./locales/` and registering it in `./index.tsx`.
export type Locale = 'en' | 'zh-CN' | 'zh-TW' | 'pt-BR' | 'ru' | 'fa';

export const LOCALES: Locale[] = ['en', 'zh-CN', 'zh-TW', 'pt-BR', 'ru', 'fa'];

export const LOCALE_LABEL: Record<Locale, string> = {
  'en': 'English',
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
  'pt-BR': 'Português (Brasil)',
  'ru': 'Русский',
  'fa': 'فارسی',
};

// Translation dictionary shape — flat keys, dot-namespaced. We keep it
// flat (not deeply nested) so missing-key TS errors point straight at the
// offending string instead of a generic object mismatch.
export interface Dict {
  // Common
  'common.cancel': string;
  'common.save': string;
  'common.close': string;
  'common.delete': string;
  'common.rename': string;
  'common.preview': string;
  'common.share': string;
  'common.search': string;
  'common.searchEllipsis': string;
  'common.loading': string;
  'common.all': string;
  'common.none': string;
  'common.default': string;
  'common.installed': string;
  'common.notInstalled': string;
  'common.active': string;
  'common.offline': string;
  'common.selected': string;
  'common.create': string;
  'common.openPreview': string;
  'common.exitFullscreen': string;
  'common.fullscreen': string;
  'common.openInNewTab': string;
  'common.exportPdf': string;
  'common.exportZip': string;
  'common.exportHtml': string;
  'common.justNow': string;
  'common.minutesAgo': string;
  'common.hoursAgo': string;
  'common.daysAgo': string;
  'common.now': string;
  'common.minutesShort': string;
  'common.hoursShort': string;
  'common.daysShort': string;
  'common.untitled': string;

  // App / brand
  'app.brand': string;
  'app.brandPill': string;
  'app.brandSubtitle': string;
  'app.welcomeLoading': string;

  // Settings dialog
  'settings.welcomeKicker': string;
  'settings.welcomeTitle': string;
  'settings.welcomeSubtitle': string;
  'settings.kicker': string;
  'settings.title': string;
  'settings.subtitle': string;
  'settings.modeAria': string;
  'settings.modeDaemon': string;
  'settings.modeDaemonHelp': string;
  'settings.modeDaemonOffline': string;
  'settings.modeDaemonOfflineMeta': string;
  'settings.modeDaemonInstalledMeta': string;
  'settings.modeApi': string;
  'settings.modeApiMeta': string;
  'settings.codeAgent': string;
  'settings.codeAgentHint': string;
  'settings.rescan': string;
  'settings.rescanTitle': string;
  'settings.noAgentsDetected': string;
  'settings.apiSection': string;
  'settings.apiKey': string;
  'settings.showKey': string;
  'settings.hideKey': string;
  'settings.show': string;
  'settings.hide': string;
  'settings.model': string;
  'settings.baseUrl': string;
  'settings.apiHint': string;
  'settings.skipForNow': string;
  'settings.getStarted': string;
  'settings.envConfigure': string;
  'settings.localCli': string;
  'settings.anthropicApi': string;
  'settings.noAgentSelected': string;
  'settings.language': string;
  'settings.languageHint': string;
  'settings.modelPicker': string;
  'settings.reasoningPicker': string;
  'settings.modelPickerHint': string;
  'settings.modelCustom': string;
  'settings.modelCustomLabel': string;
  'settings.modelCustomPlaceholder': string;

  // Entry view / tabs
  'entry.tabDesigns': string;
  'entry.tabExamples': string;
  'entry.tabDesignSystems': string;
  'entry.openSettingsTitle': string;
  'entry.openSettingsAria': string;
  'entry.resizeAria': string;
  'entry.loadingWorkspace': string;

  // New project panel
  'newproj.tabPrototype': string;
  'newproj.tabDeck': string;
  'newproj.tabTemplate': string;
  'newproj.tabOther': string;
  'newproj.titlePrototype': string;
  'newproj.titleDeck': string;
  'newproj.titleTemplate': string;
  'newproj.titleOther': string;
  'newproj.namePlaceholder': string;
  'newproj.fidelityLabel': string;
  'newproj.fidelityWireframe': string;
  'newproj.fidelityHigh': string;
  'newproj.toggleSpeakerNotes': string;
  'newproj.toggleSpeakerNotesHint': string;
  'newproj.toggleAnimations': string;
  'newproj.toggleAnimationsHint': string;
  'newproj.templateLabel': string;
  'newproj.noTemplatesTitle': string;
  'newproj.noTemplatesBody': string;
  'newproj.savedTemplate': string;
  'newproj.fileSingular': string;
  'newproj.filePlural': string;
  'newproj.create': string;
  'newproj.createFromTemplate': string;
  'newproj.createDisabledTitle': string;
  'newproj.importClaudeZip': string;
  'newproj.importClaudeZipTitle': string;
  'newproj.importingClaudeZip': string;
  'newproj.privacyFooter': string;
  'newproj.designSystem': string;
  'newproj.dsNoneFreeform': string;
  'newproj.dsNoneSubtitleEmpty': string;
  'newproj.dsNoneSubtitleSelected': string;
  'newproj.dsCategoryFallback': string;
  'newproj.dsSearch': string;
  'newproj.dsModeAria': string;
  'newproj.dsModeSingle': string;
  'newproj.dsModeMulti': string;
  'newproj.dsNoneTitle': string;
  'newproj.dsNoneSub': string;
  'newproj.dsEmpty': string;
  'newproj.dsFootSingular': string;
  'newproj.dsFootPlural': string;
  'newproj.dsFootClear': string;
  'newproj.dsBadgeDefault': string;
  'newproj.dsPrimaryFallback': string;

  // Designs tab
  'designs.subRecent': string;
  'designs.subYours': string;
  'designs.filterAria': string;
  'designs.searchPlaceholder': string;
  'designs.emptyNoProjects': string;
  'designs.emptyNoMatch': string;
  'designs.deleteTitle': string;
  'designs.deleteConfirm': string;
  'designs.cardFreeform': string;

  // Examples tab
  'examples.typeLabel': string;
  'examples.scenarioLabel': string;
  'examples.modeAll': string;
  'examples.modePrototypeDesktop': string;
  'examples.modePrototypeMobile': string;
  'examples.modeDeck': string;
  'examples.modeDocument': string;
  'examples.scenarioGeneral': string;
  'examples.scenarioEngineering': string;
  'examples.scenarioProduct': string;
  'examples.scenarioDesign': string;
  'examples.scenarioMarketing': string;
  'examples.scenarioSales': string;
  'examples.scenarioFinance': string;
  'examples.scenarioHr': string;
  'examples.scenarioOperations': string;
  'examples.scenarioSupport': string;
  'examples.scenarioLegal': string;
  'examples.scenarioEducation': string;
  'examples.scenarioPersonal': string;
  'examples.emptyNoSkills': string;
  'examples.emptyNoMatch': string;
  'examples.openPreview': string;
  'examples.loadingPreview': string;
  'examples.hoverPreview': string;
  'examples.usePrompt': string;
  'examples.previewModalTitle': string;
  'examples.shareTitle': string;
  'examples.shareLoadFirst': string;
  'examples.shareMenu': string;
  'examples.exportPdfAllSlides': string;
  'examples.exportPptxLocked': string;
  'examples.tagSlideDeck': string;
  'examples.tagTemplate': string;
  'examples.tagDesignSystem': string;
  'examples.tagMobilePrototype': string;
  'examples.tagDesktopPrototype': string;
  'examples.previewLabel': string;

  // Design systems tab
  'ds.searchPlaceholder': string;
  'ds.emptyNoMatch': string;
  'ds.badgeDefault': string;
  'ds.preview': string;
  'ds.previewTitle': string;
  'ds.categoryAll': string;
  'ds.categoryUncategorized': string;
  'ds.showcase': string;
  'ds.tokens': string;

  // Avatar menu (project topbar)
  'avatar.title': string;
  'avatar.localCli': string;
  'avatar.anthropicApi': string;
  'avatar.useLocal': string;
  'avatar.useApi': string;
  'avatar.codeAgent': string;
  'avatar.rescan': string;
  'avatar.settings': string;
  'avatar.backToProjects': string;
  'avatar.metaActive': string;
  'avatar.metaOffline': string;
  'avatar.metaSelected': string;
  'avatar.noAgentSelected': string;
  'avatar.modelSection': string;
  'avatar.modelLabel': string;
  'avatar.reasoningLabel': string;
  'avatar.customSuffix': string;

  // Project view / chat pane / composer
  'project.backToProjects': string;
  'project.metaFreeform': string;
  'chat.tabChat': string;
  'chat.tabComments': string;
  'chat.commentsSoon': string;
  'chat.conversationsTitle': string;
  'chat.conversationsAria': string;
  'chat.newConversation': string;
  'chat.newConversationsTitle': string;
  'chat.conversationsHeading': string;
  'chat.new': string;
  'chat.emptyConversations': string;
  'chat.deleteConversation': string;
  'chat.deleteConversationConfirm': string;
  'chat.untitledConversation': string;
  'chat.startTitle': string;
  'chat.startHint': string;
  'chat.fillInputTitle': string;
  'chat.jumpToLatest': string;
  'chat.scrollToLatest': string;
  'chat.you': string;
  'chat.openFile': string;
  'chat.composerPlaceholder': string;
  'chat.composerHint': string;
  'chat.cliSettingsTitle': string;
  'chat.cliSettingsAria': string;
  'chat.attachTitle': string;
  'chat.attachAria': string;
  'chat.importTitle': string;
  'chat.importLabel': string;
  'chat.importComingSoon': string;
  'chat.importSoon': string;
  'chat.importFig': string;
  'chat.importGitHub': string;
  'chat.importWeb': string;
  'chat.importFolder': string;
  'chat.importSkills': string;
  'chat.importProject': string;
  'chat.send': string;
  'chat.stop': string;
  'chat.removeAria': string;
  'chat.example1Title': string;
  'chat.example1Tag': string;
  'chat.example1Prompt': string;
  'chat.example2Title': string;
  'chat.example2Tag': string;
  'chat.example2Prompt': string;
  'chat.example3Title': string;
  'chat.example3Tag': string;
  'chat.example3Prompt': string;

  // Preview modal
  'preview.shareMenu': string;
  'preview.openInNewTab': string;
  'preview.exit': string;
  'preview.fullscreen': string;
  'preview.closeTitle': string;
  'preview.loading': string;

  // Misc fallback names
  'misc.savedTemplate': string;
  'misc.primary': string;
  'misc.designSystem': string;

  // Workspace / file viewer / design files panel
  'workspace.designFiles': string;
  'workspace.closeTab': string;
  'workspace.deleteFileConfirm': string;
  'workspace.openFromDesignFiles': string;
  'workspace.designFilesLink': string;
  'workspace.loadingSketch': string;
  'designFiles.title': string;
  'designFiles.upload': string;
  'designFiles.pasteText': string;
  'designFiles.newSketch': string;
  'designFiles.empty': string;
  'designFiles.refresh': string;
  'designFiles.delete': string;
  'designFiles.searchPlaceholder': string;
  'designFiles.up': string;
  'designFiles.back': string;
  'designFiles.crumbs': string;
  'designFiles.rowMenu': string;
  'designFiles.openInTab': string;
  'designFiles.download': string;
  'designFiles.dropTitle': string;
  'designFiles.dropDesc': string;
  'designFiles.upload.title': string;
  'designFiles.paste.title': string;
  'designFiles.upload.label': string;
  'designFiles.paste.label': string;
  'designFiles.previewOpen': string;
  'designFiles.previewClose': string;
  'designFiles.modified': string;
  'designFiles.weeksAgo': string;
  'designFiles.sectionPages': string;
  'designFiles.sectionScripts': string;
  'designFiles.sectionImages': string;
  'designFiles.sectionSketches': string;
  'designFiles.sectionOther': string;
  'designFiles.kindHtml': string;
  'designFiles.kindImage': string;
  'designFiles.kindSketch': string;
  'designFiles.kindText': string;
  'designFiles.kindCode': string;
  'designFiles.kindPdf': string;
  'designFiles.kindDocument': string;
  'designFiles.kindPresentation': string;
  'designFiles.kindSpreadsheet': string;
  'designFiles.kindBinary': string;
  'pasteDialog.title': string;
  'pasteDialog.hint': string;
  'pasteDialog.fileNameLabel': string;
  'pasteDialog.namePlaceholder': string;
  'pasteDialog.contentLabel': string;
  'pasteDialog.contentPlaceholder': string;
  'pasteDialog.save': string;
  'pasteDialog.cancel': string;
  'sketch.save': string;
  'sketch.cancel': string;
  'sketch.saving': string;
  'sketch.tooltipDirty': string;
  'sketch.tooltipClean': string;
  'fileViewer.empty': string;
  'fileViewer.loading': string;
  'fileViewer.exportPptx': string;
  'fileViewer.openInNewTab': string;
  'fileViewer.copyPath': string;
  'fileViewer.copied': string;
  'fileViewer.share': string;
  'fileViewer.binaryMeta': string;
  'fileViewer.binaryNote': string;
  'fileViewer.pdfMeta': string;
  'fileViewer.documentMeta': string;
  'fileViewer.presentationMeta': string;
  'fileViewer.spreadsheetMeta': string;
  'fileViewer.previewUnavailable': string;
  'fileViewer.download': string;
  'fileViewer.open': string;
  'fileViewer.imageMeta': string;
  'fileViewer.sketchMeta': string;
  'fileViewer.reload': string;
  'fileViewer.reloadDisk': string;
  'fileViewer.copy': string;
  'fileViewer.copyTitle': string;
  'fileViewer.saveDisabled': string;
  'fileViewer.save': string;
  'fileViewer.preview': string;
  'fileViewer.source': string;
  'fileViewer.tweaks': string;
  'fileViewer.comment': string;
  'fileViewer.edit': string;
  'fileViewer.draw': string;
  'fileViewer.zoomOut': string;
  'fileViewer.zoomIn': string;
  'fileViewer.resetZoom': string;
  'fileViewer.reloadAria': string;
  'fileViewer.previousSlide': string;
  'fileViewer.nextSlide': string;
  'fileViewer.slideNavAria': string;
  'fileViewer.present': string;
  'fileViewer.presentInTab': string;
  'fileViewer.presentFullscreen': string;
  'fileViewer.presentNewTab': string;
  'fileViewer.exitPresentation': string;
  'fileViewer.shareLabel': string;
  'fileViewer.exportPdf': string;
  'fileViewer.exportPdfAllSlides': string;
  'fileViewer.exportPptxBusy': string;
  'fileViewer.exportPptxHint': string;
  'fileViewer.exportPptxNa': string;
  'fileViewer.exportZip': string;
  'fileViewer.exportHtml': string;
  'fileViewer.saveAsTemplate': string;
  'fileViewer.savingTemplate': string;
  'fileViewer.savedTemplate': string;
  'fileViewer.savedTemplateFail': string;
  'fileViewer.templateNamePrompt': string;
  'fileViewer.templateNameDefault': string;
  'fileViewer.templateDescPrompt': string;

  // Question form (assistant question UX)
  'questionForm.submit': string;
  'questionForm.skip': string;
  'questionForm.locked': string;

  // Conversations dropdown
  'conv.switch': string;
  'conv.label': string;
  'conv.heading': string;
  'conv.new': string;
  'conv.empty': string;
  'conv.untitled': string;
  'conv.renameTooltip': string;
  'conv.delete': string;
  'conv.deleteConfirm': string;

  // Agent picker (legacy / alt)
  'agentPicker.label': string;
  'agentPicker.modeChoose': string;
  'agentPicker.localCli': string;
  'agentPicker.daemonOff': string;
  'agentPicker.byok': string;
  'agentPicker.selectAgent': string;
  'agentPicker.noAgents': string;
  'agentPicker.notInstalled': string;
  'agentPicker.rescan': string;

  // Tool cards (assistant action cards)
  'tool.openInTab': string;
  'tool.open': string;
  'tool.todos': string;
  'tool.write': string;
  'tool.edit': string;
  'tool.read': string;
  'tool.bash': string;
  'tool.glob': string;
  'tool.grep': string;
  'tool.fetch': string;
  'tool.search': string;
  'tool.lines': string;
  'tool.changeSingular': string;
  'tool.changePlural': string;
  'tool.in': string;
  'tool.hide': string;
  'tool.output': string;
  'tool.running': string;
  'tool.error': string;
  'tool.done': string;

  // Assistant message scaffolding
  'assistant.role': string;
  'assistant.workingLabel': string;
  'assistant.doneLabel': string;
  'assistant.unfinishedLabel': string;
  'assistant.unfinishedSummary': string;
  'assistant.unfinishedMore': string;
  'assistant.continueRemaining': string;
  'assistant.outTokens': string;
  'assistant.producedFiles': string;
  'assistant.openFile': string;
  'assistant.downloadFile': string;
  'assistant.thinking': string;
  'assistant.systemReminder': string;
  'assistant.waitingFirstOutput': string;
  'assistant.statusBootingAgent': string;
  'assistant.statusStarting': string;
  'assistant.statusRequesting': string;
  'assistant.statusThinking': string;
  'assistant.statusStreaming': string;
  'assistant.slowHint': string;
  'assistant.verbEditing': string;
  'assistant.verbWriting': string;
  'assistant.verbReading': string;
  'assistant.verbSearching': string;
  'assistant.verbRunning': string;
  'assistant.verbTodos': string;
  'assistant.verbFetching': string;
  'assistant.verbCalling': string;

  // Question form labels
  'qf.answered': string;
  'qf.choose': string;
  'qf.required': string;
  'qf.lockedSubmitted': string;
  'qf.lockedPrev': string;
  'qf.hint': string;
  'qf.submitDefault': string;
  'qf.submitDisabledTitle': string;
  'qf.submitTitle': string;
  'qf.cardSelected': string;
  'qf.cardRefs': string;
  'qf.cardSampleText': string;

  // Sketch editor
  'sketch.toolSelect': string;
  'sketch.toolPen': string;
  'sketch.toolText': string;
  'sketch.toolRect': string;
  'sketch.toolArrow': string;
  'sketch.toolEraser': string;
  'sketch.color': string;
  'sketch.strokeSize': string;
  'sketch.undo': string;
  'sketch.clear': string;
  'sketch.close': string;
  'sketch.textPrompt': string;
}
