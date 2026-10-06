/**
 * 报错卡上那颗〔导出日志〕(交付稿第 78 格,三颗动作里的第二颗,次级)。
 *
 * 产品裁决:「好多都应该得有导出日志这个按钮」—— **不挑场景,所有报错卡都给**。
 * 在这之前 chat 里根本没有「导出」:卡上只有一颗把诊断串拷进剪贴板的图标按钮,
 * 真正的导出(daemon 的 `/api/diagnostics/export`)只挂在设置 → 关于。
 * 一个人任务失败时正站在报错卡前,却要被指去设置里翻。
 *
 * 这里**不新造导出**:走 `useDiagnosticsExport`,和设置里那一行是同一套实现、
 * 同一个端点、同样的 Electron 原生保存框 / 浏览器下载分流。
 *
 * 结果不另起一行状态字 —— 报错卡的动作行是一排按钮,底下再挂一行绿字/红字会把
 * 卡撑变形。成功与失败都落在按钮自己的 `title` / `data-status` 上,
 * 屏幕阅读器通过 `role="status"` 的隐藏文本拿到同一句话。
 */
import type { ReactElement } from 'react';
import { VisuallyHidden } from '@open-design/components';
import { Icon } from '../Icon';
import { useDiagnosticsExport } from '../ExportDiagnosticsButton';
import { useT } from '../../i18n';
import { RunErrorCardAction } from './RunErrorCard';

export function ExportLogsAction(): ReactElement {
  const t = useT();
  const { status, busy, run } = useDiagnosticsExport();
  const label = busy ? t('diagnostics.exporting') : t('chat.runError.exportLogsCta');
  const detail =
    status.kind === 'success' || status.kind === 'error' ? status.message : null;
  return (
    <>
      <RunErrorCardAction
        type="button"
        variant="secondary"
        data-testid="chat-error-export-logs"
        data-status={status.kind}
        disabled={busy}
        title={detail ?? label}
        onClick={() => void run()}
      >
        <Icon name="upload" size={11} />
        {label}
      </RunErrorCardAction>
      {detail ? (
        <VisuallyHidden role="status">{detail}</VisuallyHidden>
      ) : null}
    </>
  );
}
