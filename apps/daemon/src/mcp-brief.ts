import {
  collectOpenDesignBrief,
  openDesignBriefCatalog,
  type OpenDesignBriefAnswers,
  type OpenDesignBriefArtifactType,
  type OpenDesignBriefQuestion,
} from '@open-design/contracts';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  type ExternalPluginContext,
  validateExternalPluginContext,
  validatePluginWorkflowId,
} from './mcp-observability.js';

const DEFAULT_BRIEF_TTL_MS = 15 * 60 * 1000;

type UnknownRecord = Record<string, unknown>;
export type LocalMcpBriefLocale = 'en' | 'zh-CN' | 'zh-TW' | 'ja';

interface LocalizedBriefCopy {
  artifactNames: Record<OpenDesignBriefArtifactType, string>;
  title: (artifactName: string) => string;
  description: string;
  submitLabel: string;
  completeCard: string;
  confirmed: string;
  continueWithBrief: string;
  noDecisions: string;
  questionDescription: string;
  optionDescription: (label: string) => string;
}

type LocalizedDecisionLabels = Record<
  string,
  readonly [questionLabel: string, ...optionLabels: string[]]
>;

const ENGLISH_ARTIFACT_NAMES: Record<OpenDesignBriefArtifactType, string> = {
  website: 'website',
  'product-prototype': 'product prototype',
  presentation: 'presentation',
  document: 'document',
  image: 'image',
  video: 'video',
  audio: 'audio',
  'design-system': 'design system',
};

const BRIEF_COPY: Record<LocalMcpBriefLocale, LocalizedBriefCopy> = {
  en: {
    artifactNames: ENGLISH_ARTIFACT_NAMES,
    title: (artifactName) => `Choose the ${artifactName} direction`,
    description:
      'Choose one option for each decision. The same readable brief can be used with Open Design Cloud or Local Codex.',
    submitLabel: 'Confirm brief',
    completeCard:
      'Complete the rendered Open Design brief card. The confirmation returns a readable summary; internal correlation values must remain hidden.',
    confirmed: 'Brief confirmed.',
    continueWithBrief: 'Continue with this brief.',
    noDecisions: 'No brief decisions have been confirmed yet.',
    questionDescription: 'Choose the option that best fits your request.',
    optionDescription: (label) => `Use “${label}” as the direction.`,
  },
  'zh-CN': {
    artifactNames: {
      website: '网站',
      'product-prototype': '产品原型',
      presentation: '演示文稿',
      document: '文档',
      image: '图片',
      video: '视频',
      audio: '音频',
      'design-system': '设计系统',
    },
    title: (artifactName) => `选择${artifactName}方向`,
    description:
      '请为每项决策选择一个选项。确认后的可读需求可用于 Open Design Cloud、本地 Codex 或安全 BYOK。',
    submitLabel: '确认需求',
    completeCard: '请填写显示的 Open Design 需求卡。确认后会返回可读摘要；不要向用户展示内部关联值。',
    confirmed: '需求已确认。',
    continueWithBrief: '请根据这份需求继续。',
    noDecisions: '尚未确认任何需求选项。',
    questionDescription: '请选择最符合当前需求的选项。',
    optionDescription: (label) => `选择“${label}”作为本项方向。`,
  },
  'zh-TW': {
    artifactNames: {
      website: '網站',
      'product-prototype': '產品原型',
      presentation: '簡報',
      document: '文件',
      image: '圖片',
      video: '影片',
      audio: '音訊',
      'design-system': '設計系統',
    },
    title: (artifactName) => `選擇${artifactName}方向`,
    description:
      '請為每項決策選擇一個選項。確認後的可讀需求可用於 Open Design Cloud、本機 Codex 或安全 BYOK。',
    submitLabel: '確認需求',
    completeCard: '請填寫顯示的 Open Design 需求卡。確認後會回傳可讀摘要；不要向使用者顯示內部關聯值。',
    confirmed: '需求已確認。',
    continueWithBrief: '請依照這份需求繼續。',
    noDecisions: '尚未確認任何需求選項。',
    questionDescription: '請選擇最符合目前需求的選項。',
    optionDescription: (label) => `選擇「${label}」作為本項方向。`,
  },
  ja: {
    artifactNames: {
      website: 'ウェブサイト',
      'product-prototype': '製品プロトタイプ',
      presentation: 'プレゼンテーション',
      document: 'ドキュメント',
      image: '画像',
      video: '動画',
      audio: '音声',
      'design-system': 'デザインシステム',
    },
    title: (artifactName) => `${artifactName}の方向性を選択`,
    description:
      '各項目から 1 つ選択してください。確認したブリーフは Open Design Cloud、ローカル Codex、安全な BYOK で利用できます。',
    submitLabel: 'ブリーフを確認',
    completeCard:
      '表示された Open Design のブリーフカードに回答してください。確認後は読みやすい概要が返されます。内部の関連付け値は表示しないでください。',
    confirmed: 'ブリーフを確認しました。',
    continueWithBrief: 'このブリーフに沿って続行してください。',
    noDecisions: 'まだブリーフの選択項目が確認されていません。',
    questionDescription: '依頼に最も合う選択肢を選んでください。',
    optionDescription: (label) => `「${label}」をこの項目の方向性として選択します。`,
  },
};

const LOCALIZED_DECISION_LABELS: Record<
  Exclude<LocalMcpBriefLocale, 'en'>,
  LocalizedDecisionLabels
> = {
  'zh-CN': {
    'website.goal': ['这个网站需要实现什么目标？', '发布产品', '销售服务', '展示作品'],
    'website.scope': ['网站应包含多少内容？', '聚焦型落地页', '丰富的单页网站', '小型多页网站'],
    'website.character': ['选择视觉风格', '精致科技感', '大胆编辑风', '温暖人文风'],
    'prototype.platform': ['原型面向哪个平台？', '网页应用', '移动应用', '跨平台'],
    'prototype.scope': ['产品需要多少可交互内容？', '一个核心流程', '多个关联流程', '产品框架'],
    'prototype.fidelity': ['原型需要多高的完成度？', '结构化线框图', '精致产品界面', '探索性概念'],
    'presentation.purpose': ['这份演示文稿用于什么目的？', '说服受众', '传达信息', '教学讲解'],
    'presentation.length': ['演示文稿需要多长？', '简短：5–7 页', '标准：8–12 页', '详细：13–18 页'],
    'presentation.character': ['选择视觉风格', '编辑风', '商务风', '视觉展示型'],
    'document.purpose': ['这份文档需要达成什么目标？', '提出方案', '记录规范', '创建指南'],
    'document.depth': ['文档需要多详细？', '高管简报', '工作文档', '参考文档'],
    'document.tone': ['选择写作语气', '清晰专业', '正式严谨', '轻松易读'],
    'image.purpose': ['这张图片用于什么场景？', '营销活动视觉', '编辑插画', '产品视觉'],
    'image.ratio': ['选择宽高比', '横向 16:9', '方形 1:1', '竖向 4:5'],
    'image.style': ['选择图片风格', '平面设计', '摄影风格', '插画风格'],
    'video.purpose': ['视频需要实现什么目标？', '推广宣传', '讲解说明', '营造氛围'],
    'video.duration': ['选择目标时长', '6–10 秒', '15–30 秒', '45–60 秒'],
    'video.ratio': ['选择宽高比', '横向 16:9', '竖向 9:16', '方形 1:1'],
    'audio.purpose': ['需要制作哪种音频？', '背景音乐', '语音旁白', '声音设计'],
    'audio.duration': ['选择目标时长', '5–10 秒', '15–30 秒', '60–90 秒'],
    'audio.mood': ['选择音频氛围', '乐观明快', '平静舒缓', '戏剧张力'],
    'design-system.scope': ['设计系统需要覆盖什么？', '产品界面', '营销场景', '统一品牌与产品'],
    'design-system.maturity': ['目前处于什么起点？', '从零开始', '演进现有品牌', '规范现有界面'],
    'design-system.depth': ['第一版需要做到多深入？', '设计基础', '设计基础 + 核心组件', '完整的起步系统'],
  },
  'zh-TW': {
    'website.goal': ['這個網站需要達成什麼目標？', '發佈產品', '銷售服務', '展示作品'],
    'website.scope': ['網站應包含多少內容？', '聚焦型登陸頁', '豐富的單頁網站', '小型多頁網站'],
    'website.character': ['選擇視覺風格', '精緻科技感', '大膽編輯風', '溫暖人文風'],
    'prototype.platform': ['原型面向哪個平台？', '網頁應用程式', '行動應用程式', '跨平台'],
    'prototype.scope': ['產品需要多少可互動內容？', '一個核心流程', '多個關聯流程', '產品框架'],
    'prototype.fidelity': ['原型需要多高的完成度？', '結構化線框圖', '精緻產品介面', '探索性概念'],
    'presentation.purpose': ['這份簡報用於什麼目的？', '說服受眾', '傳達資訊', '教學講解'],
    'presentation.length': ['簡報需要多長？', '簡短：5–7 頁', '標準：8–12 頁', '詳細：13–18 頁'],
    'presentation.character': ['選擇視覺風格', '編輯風', '商務風', '視覺展示型'],
    'document.purpose': ['這份文件需要達成什麼目標？', '提出方案', '記錄規範', '建立指南'],
    'document.depth': ['文件需要多詳細？', '高階主管簡報', '工作文件', '參考文件'],
    'document.tone': ['選擇寫作語氣', '清晰專業', '正式嚴謹', '輕鬆易讀'],
    'image.purpose': ['這張圖片用於什麼場景？', '行銷活動視覺', '編輯插畫', '產品視覺'],
    'image.ratio': ['選擇長寬比', '橫向 16:9', '方形 1:1', '直向 4:5'],
    'image.style': ['選擇圖片風格', '平面設計', '攝影風格', '插畫風格'],
    'video.purpose': ['影片需要達成什麼目標？', '推廣宣傳', '講解說明', '營造氛圍'],
    'video.duration': ['選擇目標時長', '6–10 秒', '15–30 秒', '45–60 秒'],
    'video.ratio': ['選擇長寬比', '橫向 16:9', '直向 9:16', '方形 1:1'],
    'audio.purpose': ['需要製作哪種音訊？', '背景音樂', '語音旁白', '聲音設計'],
    'audio.duration': ['選擇目標時長', '5–10 秒', '15–30 秒', '60–90 秒'],
    'audio.mood': ['選擇音訊氛圍', '樂觀明快', '平靜舒緩', '戲劇張力'],
    'design-system.scope': ['設計系統需要涵蓋什麼？', '產品介面', '行銷場景', '統一品牌與產品'],
    'design-system.maturity': ['目前處於什麼起點？', '從零開始', '演進現有品牌', '規範現有介面'],
    'design-system.depth': ['第一版需要做到多深入？', '設計基礎', '設計基礎 + 核心元件', '完整的起步系統'],
  },
  ja: {
    'website.goal': ['このウェブサイトの目的は何ですか？', '製品を発表する', 'サービスを販売する', '作品を紹介する'],
    'website.scope': ['どの程度のコンテンツを含めますか？', '要点を絞ったランディングページ', '充実した 1 ページサイト', '小規模な複数ページサイト'],
    'website.character': ['ビジュアルの方向性を選択', '洗練されたテック', '大胆なエディトリアル', '温かみのある人間的な表現'],
    'prototype.platform': ['どのプラットフォーム向けのプロトタイプですか？', 'ウェブアプリ', 'モバイルアプリ', 'クロスプラットフォーム'],
    'prototype.scope': ['どの範囲を操作可能にしますか？', '1 つの主要フロー', '関連する複数フロー', '製品全体の枠組み'],
    'prototype.fidelity': ['プロトタイプの完成度は？', '構造化ワイヤーフレーム', '洗練された製品 UI', '探索的なコンセプト'],
    'presentation.purpose': ['プレゼンテーションの目的は？', '説得する', '情報を伝える', '教える'],
    'presentation.length': ['スライドの長さは？', '短め：5〜7 枚', '標準：8〜12 枚', '詳細：13〜18 枚'],
    'presentation.character': ['ビジュアルの方向性を選択', 'エディトリアル', 'エグゼクティブ', 'ビジュアル中心'],
    'document.purpose': ['ドキュメントの目的は？', '提案する', '仕様を記録する', 'ガイドを作成する'],
    'document.depth': ['どの程度詳しくしますか？', 'エグゼクティブ概要', '作業用ドキュメント', 'リファレンス文書'],
    'document.tone': ['文章のトーンを選択', '明快でプロフェッショナル', 'フォーマル', '会話調'],
    'image.purpose': ['画像の用途は？', 'キャンペーンビジュアル', 'エディトリアルイラスト', '製品ビジュアル'],
    'image.ratio': ['アスペクト比を選択', '横長 16:9', '正方形 1:1', '縦長 4:5'],
    'image.style': ['画像スタイルを選択', 'グラフィックデザイン', '写真表現', 'イラスト表現'],
    'video.purpose': ['動画の目的は？', '宣伝する', '説明する', '雰囲気をつくる'],
    'video.duration': ['目標の長さを選択', '6〜10 秒', '15〜30 秒', '45〜60 秒'],
    'video.ratio': ['アスペクト比を選択', '横長 16:9', '縦長 9:16', '正方形 1:1'],
    'audio.purpose': ['どの種類の音声を作りますか？', '背景音楽', 'ナレーション', 'サウンドデザイン'],
    'audio.duration': ['目標の長さを選択', '5〜10 秒', '15〜30 秒', '60〜90 秒'],
    'audio.mood': ['音の雰囲気を選択', '前向き', '穏やか', 'ドラマチック'],
    'design-system.scope': ['デザインシステムの対象は？', '製品 UI', 'マーケティング画面', 'ブランドと製品を統合'],
    'design-system.maturity': ['現在の出発点は？', '新しく始める', '既存ブランドを発展させる', '既存 UI を体系化する'],
    'design-system.depth': ['初版をどこまで作り込みますか？', '基礎', '基礎 + 主要コンポーネント', '包括的なスターターシステム'],
  },
};

for (const locale of ['zh-CN', 'zh-TW', 'ja'] as const) {
  const labels = LOCALIZED_DECISION_LABELS[locale];
  for (const questions of Object.values(openDesignBriefCatalog)) {
    for (const question of questions) {
      const localized = labels[question.id];
      if (!localized || localized.length !== question.options.length + 1) {
        throw new Error(
          `Brief locale ${locale} is incomplete for ${question.id}`,
        );
      }
    }
  }
}

export interface LocalMcpBriefStoreOptions {
  now?: () => number;
  ttlMs?: number;
}

interface StoredBriefDraft {
  artifactType: OpenDesignBriefArtifactType;
  projectTitle: string;
  locale: LocalMcpBriefLocale;
  localeSource: 'provided' | 'fallback';
  knownAnswers: UnknownRecord;
  nonce: string;
  expiresAt: number;
  confirmation?: LocalMcpBriefConfirmation;
  confirmationAnswersDigest?: string;
  pluginWorkflowId?: string;
  externalPluginContext?: ExternalPluginContext;
  briefState?: 'confirmed' | 'skipped';
}

export interface LocalMcpBriefQuestionForm {
  id: 'open-design-brief';
  title: string;
  description: string;
  submitLabel: string;
  questions: Array<{
    id: string;
    label: string;
    description: string;
    type: 'radio';
    required: true;
    allowCustom: false;
    defaultValue: string;
    options: Array<{
      value: string;
      label: string;
      description: string;
    }>;
  }>;
}

export interface LocalMcpBriefForm {
  view: 'brief-form';
  artifactType: OpenDesignBriefArtifactType;
  projectTitle: string;
  locale: LocalMcpBriefLocale;
  localeSource: 'provided' | 'fallback';
  briefDraftId: string;
  nonce: string;
  expiresAt: number;
  pluginWorkflowId?: string;
  externalPluginContext?: ExternalPluginContext;
  questionForm: LocalMcpBriefQuestionForm;
  questionFormsByLocale: Record<LocalMcpBriefLocale, LocalMcpBriefQuestionForm>;
}

export interface LocalMcpBriefConfirmation {
  view: 'brief-confirmed';
  artifactType: OpenDesignBriefArtifactType;
  projectTitle: string;
  locale: LocalMcpBriefLocale;
  briefDraftId: string;
  briefConfirmationId: string;
  confirmedAt: number;
  answers: OpenDesignBriefAnswers;
  summary: string;
  pluginWorkflowId?: string;
  externalPluginContext?: ExternalPluginContext;
}

export interface LocalMcpBriefStore {
  collect(input: UnknownRecord): LocalMcpBriefForm;
  confirm(input: UnknownRecord): LocalMcpBriefConfirmation;
  attributionForDraft(
    briefDraftId: unknown,
  ): {
    pluginWorkflowId: string;
    externalPluginContext: ExternalPluginContext;
  } | null;
  briefStateForWorkflow(
    pluginWorkflowId: unknown,
  ): 'confirmed' | 'skipped' | 'not_applicable';
}

export function createLocalMcpBriefStore(
  options: LocalMcpBriefStoreOptions = {},
): LocalMcpBriefStore {
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? DEFAULT_BRIEF_TTL_MS;
  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) {
    throw new Error('brief ttlMs must be a positive integer');
  }
  const drafts = new Map<string, StoredBriefDraft>();

  const pruneExpired = (at: number) => {
    for (const [id, draft] of drafts) {
      if (draft.expiresAt <= at) drafts.delete(id);
    }
  };

  return {
    attributionForDraft(briefDraftId) {
      if (typeof briefDraftId !== 'string') return null;
      const draft = drafts.get(briefDraftId);
      if (!draft?.pluginWorkflowId || !draft.externalPluginContext) return null;
      return {
        pluginWorkflowId: draft.pluginWorkflowId,
        externalPluginContext: draft.externalPluginContext,
      };
    },
    briefStateForWorkflow(pluginWorkflowId) {
      if (typeof pluginWorkflowId !== 'string') return 'not_applicable';
      for (const draft of drafts.values()) {
        if (
          draft.pluginWorkflowId === pluginWorkflowId
          && draft.briefState
        ) {
          return draft.briefState;
        }
      }
      return 'not_applicable';
    },
    collect(input) {
      const at = now();
      pruneExpired(at);
      const artifactType = readArtifactType(input.artifactType);
      const projectTitle = readProjectTitle(input.projectTitle);
      const localeSource =
        typeof input.locale === 'string' && input.locale.trim().length > 0
          ? 'provided'
          : 'fallback';
      const locale = readBriefLocale(input.locale);
      const knownAnswers = readAnswerRecord(input.knownAnswers, 'knownAnswers');
      const skip = input.skip === true;
      const hasPluginContext = Object.prototype.hasOwnProperty.call(
        input,
        'externalPluginContext',
      );
      const externalPluginContext = hasPluginContext
        ? validateExternalPluginContext(input.externalPluginContext)
        : undefined;
      const pluginWorkflowId = hasPluginContext
        ? validatePluginWorkflowId(input.pluginWorkflowId)
        : undefined;
      if (!hasPluginContext && input.pluginWorkflowId !== undefined) {
        throw new Error(
          'pluginWorkflowId requires a validated externalPluginContext',
        );
      }
      const decision = collectOpenDesignBrief({
        artifactType,
        knownAnswers,
        skip,
      });
      const briefDraftId = randomUUID();
      const nonce = randomBytes(24).toString('hex');
      const expiresAt = at + ttlMs;
      drafts.set(briefDraftId, {
        artifactType,
        projectTitle,
        locale,
        localeSource,
        knownAnswers: { ...decision.answers },
        nonce,
        expiresAt,
        ...(pluginWorkflowId ? { pluginWorkflowId } : {}),
        ...(externalPluginContext ? { externalPluginContext } : {}),
        ...(pluginWorkflowId && skip ? { briefState: 'skipped' as const } : {}),
      });

      const questionFormsByLocale = Object.fromEntries(
        (['en', 'zh-CN', 'zh-TW', 'ja'] as const).map((candidateLocale) => [
          candidateLocale,
          localizedBriefQuestionForm(
            artifactType,
            decision.questions,
            candidateLocale,
          ),
        ]),
      ) as Record<LocalMcpBriefLocale, LocalMcpBriefQuestionForm>;

      return {
        view: 'brief-form',
        artifactType,
        projectTitle,
        locale,
        localeSource,
        briefDraftId,
        nonce,
        expiresAt,
        ...(pluginWorkflowId ? { pluginWorkflowId } : {}),
        ...(externalPluginContext ? { externalPluginContext } : {}),
        questionForm: questionFormsByLocale[locale],
        questionFormsByLocale,
      };
    },

    confirm(input) {
      const at = now();
      pruneExpired(at);
      const briefDraftId = readRequiredString(
        input.briefDraftId,
        'briefDraftId',
      );
      const nonce = readRequiredString(input.nonce, 'nonce');
      const draft = drafts.get(briefDraftId);
      if (!draft) {
        throw new Error(
          'The Open Design brief has expired or is unknown. Call collect_brief again.',
        );
      }
      if (draft.nonce !== nonce) {
        throw new Error('The Open Design brief nonce is invalid.');
      }
      const submittedAnswers = readAnswerRecord(input.answers, 'answers');
      const mergedAnswers: UnknownRecord = {
        ...draft.knownAnswers,
        ...submittedAnswers,
      };
      const decision = collectOpenDesignBrief({
        artifactType: draft.artifactType,
        knownAnswers: mergedAnswers,
      });
      if (!decision.complete) {
        const missing = decision.questions.map((question) => question.id);
        throw new Error(
          `The Open Design brief is incomplete. Missing: ${missing.join(', ')}.`,
        );
      }
      const confirmationAnswersDigest = stableAnswerDigest(decision.answers);
      if (draft.confirmation) {
        if (draft.confirmationAnswersDigest !== confirmationAnswersDigest) {
          throw new Error(
            'This Open Design brief was already confirmed with different answers.',
          );
        }
        return draft.confirmation;
      }

      const confirmationLocale =
        draft.localeSource === 'fallback'
          ? readBriefLocale(input.locale)
          : draft.locale;
      const confirmation: LocalMcpBriefConfirmation = {
        view: 'brief-confirmed',
        artifactType: draft.artifactType,
        projectTitle: draft.projectTitle,
        locale: confirmationLocale,
        briefDraftId,
        briefConfirmationId: randomUUID(),
        confirmedAt: at,
        answers: decision.answers,
        summary: localizedBriefSummary(
          draft.artifactType,
          decision.answers,
          confirmationLocale,
        ),
        ...(draft.pluginWorkflowId
          ? { pluginWorkflowId: draft.pluginWorkflowId }
          : {}),
        ...(draft.externalPluginContext
          ? { externalPluginContext: draft.externalPluginContext }
          : {}),
      };
      draft.confirmation = confirmation;
      draft.confirmationAnswersDigest = confirmationAnswersDigest;
      if (draft.pluginWorkflowId && draft.briefState !== 'skipped') {
        draft.briefState = 'confirmed';
      }
      return confirmation;
    },
  };
}

function readArtifactType(value: unknown): OpenDesignBriefArtifactType {
  if (
    typeof value !== 'string'
    || !Object.hasOwn(openDesignBriefCatalog, value)
  ) {
    throw new Error(
      `artifactType must be one of: ${Object.keys(openDesignBriefCatalog).join(', ')}`,
    );
  }
  return value as OpenDesignBriefArtifactType;
}

export function readBriefLocale(value: unknown): LocalMcpBriefLocale {
  if (typeof value !== 'string' || value.trim().length === 0) return 'en';
  const normalized = value.trim().replaceAll('_', '-').toLowerCase();
  if (normalized === 'zh' || normalized === 'zh-cn' || normalized.startsWith('zh-hans')) {
    return 'zh-CN';
  }
  if (
    normalized === 'zh-tw'
    || normalized === 'zh-hk'
    || normalized === 'zh-mo'
    || normalized.startsWith('zh-hant')
  ) {
    return 'zh-TW';
  }
  if (normalized === 'ja' || normalized.startsWith('ja-')) return 'ja';
  if (normalized === 'en' || normalized.startsWith('en-')) return 'en';
  return 'en';
}

function localizedBriefTitle(
  artifactType: OpenDesignBriefArtifactType,
  locale: LocalMcpBriefLocale,
): string {
  const copy = BRIEF_COPY[locale];
  return copy.title(copy.artifactNames[artifactType]);
}

function localizedBriefQuestionForm(
  artifactType: OpenDesignBriefArtifactType,
  questions: readonly OpenDesignBriefQuestion[],
  locale: LocalMcpBriefLocale,
): LocalMcpBriefQuestionForm {
  return {
    id: 'open-design-brief',
    title: localizedBriefTitle(artifactType, locale),
    description: BRIEF_COPY[locale].description,
    submitLabel: BRIEF_COPY[locale].submitLabel,
    questions: questions.map((question) =>
      localizeBriefQuestion(question, locale)),
  };
}

function localizeBriefQuestion(
  question: OpenDesignBriefQuestion,
  locale: LocalMcpBriefLocale,
): LocalMcpBriefQuestionForm['questions'][number] {
  if (locale === 'en') {
    return {
      id: question.id,
      label: question.label,
      description: question.description,
      type: question.type,
      required: question.required,
      allowCustom: question.allowCustom,
      defaultValue: question.defaultOptionId,
      options: question.options.map((candidate) => ({
        value: candidate.id,
        label: candidate.label,
        description: candidate.description,
      })),
    };
  }

  const localized = LOCALIZED_DECISION_LABELS[locale][question.id];
  const [questionLabel, ...optionLabels] = localized ?? [];
  const copy = BRIEF_COPY[locale];
  return {
    id: question.id,
    label: questionLabel ?? question.label,
    description: copy.questionDescription,
    type: question.type,
    required: question.required,
    allowCustom: question.allowCustom,
    defaultValue: question.defaultOptionId,
    options: question.options.map((candidate, index) => {
      const label = optionLabels[index] ?? candidate.label;
      return {
        value: candidate.id,
        label,
        description: copy.optionDescription(label),
      };
    }),
  };
}

function localizedBriefSummary(
  artifactType: OpenDesignBriefArtifactType,
  answers: OpenDesignBriefAnswers,
  locale: LocalMcpBriefLocale,
): string {
  const lines = openDesignBriefCatalog[artifactType]
    .map((question) => {
      const selected = answers[question.id]?.[0];
      const selectedIndex = question.options.findIndex(
        (candidate) => candidate.id === selected,
      );
      if (selectedIndex < 0) return null;
      if (locale === 'en') {
        return `${question.label}: ${question.options[selectedIndex]?.label}`;
      }
      const localized = LOCALIZED_DECISION_LABELS[locale][question.id];
      const questionLabel = localized?.[0] ?? question.label;
      const optionLabel =
        localized?.[selectedIndex + 1]
        ?? question.options[selectedIndex]?.label;
      return optionLabel ? `${questionLabel}: ${optionLabel}` : null;
    })
    .filter((line): line is string => Boolean(line));
  return lines.length > 0 ? lines.join('\n') : BRIEF_COPY[locale].noDecisions;
}

export function localMcpBriefResponseCopy(locale: LocalMcpBriefLocale) {
  return {
    completeCard: BRIEF_COPY[locale].completeCard,
    confirmed: BRIEF_COPY[locale].confirmed,
    continueWithBrief: BRIEF_COPY[locale].continueWithBrief,
  };
}

function readProjectTitle(value: unknown): string {
  if (value === undefined) return 'Untitled Open Design artifact';
  const title = readRequiredString(value, 'projectTitle').trim();
  if (title.length > 256) {
    throw new Error('projectTitle must be at most 256 characters');
  }
  return title;
}

function readRequiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value;
}

function readAnswerRecord(value: unknown, field: string): UnknownRecord {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return { ...(value as UnknownRecord) };
}

function stableAnswerDigest(answers: OpenDesignBriefAnswers): string {
  return JSON.stringify(
    Object.entries(answers)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, [...value]]),
  );
}
