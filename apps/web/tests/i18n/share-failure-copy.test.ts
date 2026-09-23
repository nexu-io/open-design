import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Recovery copy must work for card and toolbar: only retry exists in both.
const expected: Record<string, string> = {
  "ar": "تعذّر إنشاء رابط المشاركة. حاول مجددًا لاحقًا.",
  "de": "Freigabelink konnte nicht erstellt werden. Versuche es später erneut.",
  "en": "Could not create the share link. Please try again later.",
  "es-ES": "No se pudo crear el enlace para compartir. Inténtalo de nuevo más tarde.",
  "fa": "ایجاد پیوند اشتراک‌گذاری ناموفق بود. لطفاً بعداً دوباره تلاش کنید.",
  "fr": "Impossible de créer le lien de partage. Réessayez plus tard.",
  "hu": "Nem sikerült létrehozni a megosztási linket. Próbáld újra később.",
  "id": "Tidak dapat membuat tautan berbagi. Silakan coba lagi nanti.",
  "it": "Impossibile creare il link di condivisione. Riprova più tardi.",
  "ja": "共有リンクを作成できませんでした。しばらくしてから再試行してください。",
  "ko": "공유 링크를 만들지 못했습니다. 나중에 다시 시도해 주세요.",
  "pl": "Nie udało się utworzyć linku. Spróbuj ponownie później.",
  "pt-BR": "Não foi possível criar o link de compartilhamento. Tente novamente mais tarde.",
  "ru": "Не удалось создать ссылку. Повторите попытку позже.",
  "th": "สร้างลิงก์แชร์ไม่สำเร็จ โปรดลองอีกครั้งในภายหลัง",
  "tr": "Paylaşım bağlantısı oluşturulamadı. Lütfen daha sonra tekrar deneyin.",
  "uk": "Не вдалося створити посилання. Повторіть спробу пізніше.",
  "zh-CN": "生成分享链接失败，请稍后重试。",
  "zh-TW": "產生分享連結失敗，請稍後重試。"
};
const directory = resolve(__dirname, '../../src/i18n/locales');

describe('share failure recovery copy', () => {
  it('covers every shipped locale', () => {
    expect(readdirSync(directory).filter(name => name.endsWith('.ts')).map(name => name.slice(0, -3)).sort()).toEqual(Object.keys(expected).sort());
    expect(Object.keys(expected)).toHaveLength(19);
  });
  it.each(Object.entries(expected))('%s only directs users to retry', async (locale, copy) => {
    const module = await import(/* @vite-ignore */ resolve(directory, `${locale}.ts`));
    const dict = Object.values(module).find(value => value && typeof value === 'object' && 'fileViewer.publishFileFailed' in value);
    expect(dict).toHaveProperty(['fileViewer.publishFileFailed'], copy);
  });
});
