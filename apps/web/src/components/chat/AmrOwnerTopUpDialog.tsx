/**
 * 「找所有者充值」弹窗 —— 余额耗尽 × **没有账单权限的成员**那两组
 * (产品文档「四、升级情况」的第 2 / 4 行,规格 `run-error-catalog.md` §6.V)。
 *
 * 它同时是 §6.Y 那条死胡同的出口。在此之前,这类成员看到的是
 * `AmrBalanceDialog`,而那张弹窗的主按钮取自 `workspaceUpgradeUrl` ——
 * 该函数对没有 `canManageBilling` 的成员返回 `null`,于是三元落空,
 * **弹窗上只剩一颗「暂不需要」**:既不能升级,也没有「通知管理员」,
 * 任务就那么 park 在队列里。
 *
 * ⚠️ **2026-09-06 产品裁决(T56):这一档回到单出口。** 原来那颗「复制请求」
 * (一键复制一句可以直接发给所有者的话)整颗删除,产品原话「不要保留,严格按
 * 产品稿,不要私自发挥」。代价是明确的:§6.Y 那条「必须给出一条前进的路」的
 * 硬要求不再由这张弹窗满足 —— 现在它只说明「该找谁」,不再替你把话写好。
 * 产品知情。原来那份是**有授权的临时文案**(§6.V「文案由研发拟,产品复核」),
 * 这次是正式文案替换临时文案,不是推翻设计。
 *
 * ⚠️ **2026-09-07:产品给了这张卡自己的设计稿**(`topup-reminder2.html`)。
 * 文案一个字没变,变的是**形**:它从 `SupportDialog` 那副小弹窗骨架换到了
 * `AmrBalanceDialog` / `AmrArtifactUpgradeDialog` 那族「邀请卡」——
 * 满幅插画 + 居中大标题 + 居中正文 + 整宽胶囊 CTA。逐格实测与取舍见
 * `AmrOwnerTopUpDialog.module.css` 的头注,回归钉在
 * `tests/components/chat/amr-owner-top-up-dialog-design.test.tsx`。
 *
 * 文案两个变体(T57,产品已批,一个字都不许改):
 *   拿得到 Owner 名字 → 「…请联系「{name}」完成充值后再继续使用。」
 *   拿不到           → 「…请联系团队所有者完成充值后再继续使用。」
 * 只有插值那一处不同,其余逐字相同。
 */
import { useEffect, useId, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@open-design/components';
import { Icon } from '../Icon';
import { useT } from '../../i18n';
import { chatSeam } from './ChatRoot';
import styles from './AmrOwnerTopUpDialog.module.css';

export interface AmrOwnerTopUpDialogProps {
  /** 关掉:任务留在队列里,和今天的「暂不需要」一样。 */
  onClose: () => void;
  /**
   * 工作区所有者的显示名。
   *
   * **今天恒为空。** 契约里唯一的 owner 名是 `CollabProject.ownerDisplayName`
   * —— 项目级,而且它自己的注释逐字写着 "STUB: the real name source is B's
   * member roster";`WorkspaceCollabContext` 上没有工作区 owner 名。所以这里
   * 留出参数、由文案分支兜住,后端补上名字来源之后接上即可自动生效,不用再改
   * 一次文案。
   */
  ownerName?: string | null;
  /** 测试与陈列页用:不走 portal,就地渲染。 */
  inline?: boolean;
}

/**
 * 插值哨兵:先把 Owner 名字换成它,再按它把整句劈成「名字之前 / 名字之后」。
 * 选 `\u0000` 是因为它不可能出现在任何一个用户显示名里。
 */
const OWNER_NAME_SLOT = '\u0000';

export function AmrOwnerTopUpDialog({
  onClose,
  ownerName,
  inline,
}: AmrOwnerTopUpDialogProps): ReactElement | null {
  const t = useT();
  const titleId = useId();
  const messageId = useId();
  const name = ownerName?.trim();
  /*
   * 产品稿把 Owner 名字**单独加粗一档**(`.owner-name { font-weight: 700 }`,
   * 正文是 400),所以那一段必须是自己的元素,不能整句一个文本节点。
   *
   * 拿哨兵插值再劈开,而不是在这里手拼句子:文案是产品逐字批过的(T57),
   * 两个语序在 19 个 locale 里各不相同(英文的名字在句中、阿拉伯语从右起),
   * 手拼等于在代码里重写一遍译文。哨兵用 `\u0000` —— 它不可能出现在
   * 任何一个显示名里,也不会被 `trim()` 留下。
   *
   * key 里哪天没了 `{name}`,`split` 只会得到一段,`after` 为 `undefined`,
   * 整句照常渲染,只是不再加粗 —— 降级成今天的样子,不会碎。
   */
  const messageParts = name
    ? t('chat.amrBalanceOwner.message', { name: OWNER_NAME_SLOT }).split(OWNER_NAME_SLOT)
    : [t('chat.amrBalanceOwner.messageNoOwnerName')];
  const [beforeName, afterName] = messageParts;

  useEffect(() => {
    if (inline) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [inline, onClose]);

  /*
   * 浮层形态自己带上 `--chat-*` 接缝(和 `SupportDialog` 同一条线,同一个写法)。
   *
   * 它走 portal 挂到 `<body>` 下,而自定义属性按 **DOM 树**继承 —— 于是它落在
   * 页面上那个接缝之外,遮罩的 `color-mix(… var(--chat-text-strong) …)`、卡片的
   * `background` / `box-shadow` / `border-radius` 全部解析失败,弹窗整个透明,
   * 文字裸浮在页面上(OPEND-2722 报的「未正常弹出提示」就是这个现场 ——
   * 它其实弹了)。`ChatRoot.tsx` 的注释早写过这条:脱离接缝
   * 「组件会退化成无色无字号的裸结构 —— **而且不报错**」。
   *
   * 就地形态(陈列页那一格)本来就渲染在接缝之内,再挂一层是多余的,也会让
   * 陈列页多出一个 `data-chat-root`,把按这个属性数接缝的回归测试搅乱。
   */
  const seam = inline ? null : chatSeam();
  const dialog = (
    <div
      className={
        inline
          ? `${styles.overlay} ${styles.overlayInline}`
          : `${styles.overlay} ${seam?.className ?? ''}`.trim()
      }
      {...(seam ? { 'data-chat-root': seam['data-chat-root'] } : {})}
      data-testid="amr-balance-owner-dialog"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={styles.modal}
        role="dialog"
        aria-modal={!inline}
        aria-labelledby={titleId}
        aria-describedby={messageId}
      >
        {/*
         * 满幅插画。**复用现成的那张** `cloud-signin-aurora.jpg` —— 产品稿
         * `.media-panel img` 的 `src` 直接指到仓库里这个路径,和兄弟弹窗
         * `AmrBalanceDialog` 用的是同一份文件(固有 1680×720),所以既不用从
         * 稿子里抠新素材,也不用新起一个资源位。
         *
         * `alt=""` + `aria-hidden`:它是气氛,不承载信息,不该念给读屏。
         * 固有宽高写在属性上,图还没到时浏览器就按 1680:720 把位置留出来,
         * 卡片不会先塌一下再撑开。
         */}
        <div className={styles.banner} aria-hidden>
          <img
            className={styles.bannerImage}
            src="/upgrade/cloud-signin-aurora.jpg"
            alt=""
            width={1680}
            height={720}
            decoding="async"
            draggable={false}
          />
        </div>
        <button
          type="button"
          className={styles.close}
          onClick={onClose}
          aria-label={t('common.close')}
        >
          <Icon name="close" size={14} />
        </button>
        <h2 id={titleId} className={styles.title}>
          {t('chat.amrBalanceOwner.title')}
        </h2>
        <p id={messageId} className={styles.message}>
          {beforeName}
          {afterName === undefined ? null : (
            <>
              <strong className={styles.ownerName}>{name}</strong>
              {afterName}
            </>
          )}
        </p>
        <Button
          type="button"
          variant="primary"
          className={styles.cta}
          data-testid="amr-balance-owner-dismiss"
          onClick={onClose}
        >
          {t('chat.amrBalanceOwner.dismissCta')}
        </Button>
      </div>
    </div>
  );

  if (inline) return dialog;
  if (typeof document === 'undefined') return null;
  return createPortal(dialog, document.body);
}
