import { useT } from '../i18n';

/**
 * 激活提示那一句(`.amr-login-activation__hint` 里的文字)。三处登录入口
 * (设置页 `AmrLoginPill`、首页 `CloudSignInTip`、引导页 `EntryShell`)共用同一份,
 * 免得一处改了另两处还留着旧话。
 *
 * 浏览器没能自动打开时是产品《报错文案》S32a 那一格(OPEND-2849):
 * 标题「无法打开登录页面」+ 正文「浏览器未能自动打开，请重新尝试登录。」。
 * 下面那颗〔打开登录页〕链接由各入口自己画,不在这里 —— 只换文字,不动出口。
 */
export function AmrActivationHintText({ browserOpenFailed }: { browserOpenFailed: boolean }) {
  const t = useT();
  if (!browserOpenFailed) return <>{t('settings.amrActivationHint')}</>;
  return (
    <>
      <span className="amr-login-activation__title">{t('settings.amrActivationBrowserFailedTitle')}</span>
      <span className="amr-login-activation__body">{t('settings.amrActivationBrowserFailedDescription')}</span>
    </>
  );
}
