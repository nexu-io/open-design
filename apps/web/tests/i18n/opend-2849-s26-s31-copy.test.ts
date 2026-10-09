/**
 * OPEND-2849 · 产品文档《Open Design 报错文案｜精简版》S26a / S31b 定稿落地。
 *
 * - S26a 导出失败:标题「导出失败」+ 正文「本次导出未完成，请重新尝试。」,
 *   与 S26c(评论保存失败)同形:Title + Description 两个键。
 * - S31b 检查更新失败:标题「检查更新失败」不带句号,正文逐字。
 *
 * 判据扫全部 19 个 locale:标题行不得以句末标点结尾、新键不得在非英文语言里
 * 留英文占位、被拆掉的旧键 `fileViewer.exportFailed` 不得残留。
 */
import { describe, expect, it } from 'vitest';

import { LOCALES, type Dict, type Locale } from '../../src/i18n/types';

async function loadDict(locale: Locale): Promise<Dict> {
  const module = await import(`../../src/i18n/locales/${locale}.ts`);
  const dict = Object.values(module).find((value): value is Dict => {
    return Boolean(value) && typeof value === 'object';
  });
  if (!dict) throw new Error(`No dictionary export found for locale ${locale}`);
  return dict;
}

function lookup(dict: Dict, key: string): string | undefined {
  return (dict as unknown as Record<string, string | undefined>)[key];
}

// Sentence-final punctuation across the 19 locales (Latin, CJK, Arabic/Persian,
// Thai has none). A title line must not end with any of these.
const SENTENCE_END = /[.。．!！?？؟]\s*$/u;

describe('OPEND-2849 product copy (zh-CN is the source of truth)', () => {
  it('S26a export failure uses the product title and body verbatim', async () => {
    const zh = await loadDict('zh-CN');
    expect(lookup(zh, 'fileViewer.exportFailedTitle')).toBe('导出失败');
    expect(lookup(zh, 'fileViewer.exportFailedDescription')).toBe('本次导出未完成，请重新尝试。');
  });

  it('S31b update-check failure has an unpunctuated title line and the verbatim body', async () => {
    const zh = await loadDict('zh-CN');
    const [title, body, ...rest] = (lookup(zh, 'updater.dialogCheckFailed') ?? '').split('\n');
    expect(title).toBe('检查更新失败');
    expect(body).toBe('暂时无法获取版本信息，请检查网络连接后重试。');
    expect(rest).toEqual([]);
  });
});

describe.each(LOCALES)('OPEND-2849 locale %s', (locale) => {
  it('defines the S26a title/body pair and drops the single-line export key', async () => {
    const dict = await loadDict(locale);
    const title = lookup(dict, 'fileViewer.exportFailedTitle');
    const body = lookup(dict, 'fileViewer.exportFailedDescription');
    expect(title?.trim()).toBeTruthy();
    expect(body?.trim()).toBeTruthy();
    expect(title).not.toMatch(SENTENCE_END);
    expect(lookup(dict, 'fileViewer.exportFailed')).toBeUndefined();
    if (locale !== 'en') {
      const en = await loadDict('en');
      expect(title).not.toBe(lookup(en, 'fileViewer.exportFailedTitle'));
      expect(body).not.toBe(lookup(en, 'fileViewer.exportFailedDescription'));
    }
  });

  it('keeps the update-check failure as title line + body line without a title full stop', async () => {
    const dict = await loadDict(locale);
    const lines = (lookup(dict, 'updater.dialogCheckFailed') ?? '').split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]?.trim()).toBeTruthy();
    expect(lines[0]).not.toMatch(SENTENCE_END);
    expect(lines[1]?.trim()).toBeTruthy();
  });
});

/**
 * OPEND-2849 补充:
 * - 《补充场景》第 13 行 硬盘写不进去:正文逐字「文件无法写入磁盘。请确认有足够的剩余空间后，再重新尝试。」
 *   (去掉了旧稿「且有权限保存到当前文件夹」那半句,19 语跟着改)。
 * - S32 浏览器没打开:只修标点,半角「,」→ 全角「，」;整句不动(整句改写待产品定)。
 */
describe('OPEND-2849 supplement copy', () => {
  it('local storage failure body matches the product copy verbatim (zh-CN)', async () => {
    const zh = await loadDict('zh-CN');
    expect(lookup(zh, 'chat.runError.localStorageFailureMessage')).toBe(
      '文件无法写入磁盘。请确认有足够的剩余空间后，再重新尝试。',
    );
    expect(lookup(zh, 'chat.runError.title.localStorageFailure')).toBe('无法保存文件');
  });

  it('browser-not-opened hint uses a full-width comma and is otherwise unchanged (zh-CN, zh-TW)', async () => {
    const zh = await loadDict('zh-CN');
    const tw = await loadDict('zh-TW');
    expect(lookup(zh, 'settings.amrActivationBrowserFailed')).toBe('没能自动打开浏览器，请打开下面的登录页继续。');
    expect(lookup(tw, 'settings.amrActivationBrowserFailed')).toBe('無法自動開啟瀏覽器，請開啟下方的登入頁繼續。');
  });
});

describe.each(LOCALES)('OPEND-2849 supplement locale %s', (locale) => {
  it('defines a translated local storage failure body without the old permission clause', async () => {
    const dict = await loadDict(locale);
    const body = lookup(dict, 'chat.runError.localStorageFailureMessage');
    expect(body?.trim()).toBeTruthy();
    if (locale !== 'en') {
      const en = await loadDict('en');
      expect(body).not.toBe(lookup(en, 'chat.runError.localStorageFailureMessage'));
    }
  });
});

// The previous (pre-product) wording per locale. A hit means the locale was missed.
const OLD_LOCAL_STORAGE_FAILURE: Record<Locale, string> = {
  ar: "تعذّرت كتابة الملف على القرص. تأكد من وجود مساحة فارغة كافية ومن امتلاكك إذن الحفظ في المجلد الحالي.",
  de: "Die Datei konnte nicht auf den Datenträger geschrieben werden. Prüfe, ob genügend Speicherplatz verfügbar ist und du im aktuellen Ordner speichern darfst.",
  en: "The file could not be written to disk. Please make sure there is enough free space and you have permission to save to the current folder.",
  "es-ES": "No se ha podido escribir el archivo en el disco. Comprueba que haya suficiente espacio libre y que tengas permiso para guardar en la carpeta actual.",
  fa: "نوشتن فایل روی دیسک ممکن نشد. مطمئن شوید فضای خالی کافی دارید و اجازهٔ ذخیره در پوشهٔ فعلی را دارید.",
  fr: "Le fichier n’a pas pu être écrit sur le disque. Vérifiez que l’espace disponible est suffisant et que vous avez l’autorisation d’enregistrer dans le dossier actuel.",
  hu: "Nem sikerült a fájlt lemezre írni. Ellenőrizd, hogy van-e elegendő szabad hely, és van-e jogosultságod az aktuális mappába menteni.",
  id: "File tidak dapat ditulis ke disk. Pastikan ruang kosong mencukupi dan Anda memiliki izin untuk menyimpan ke folder saat ini.",
  it: "Non è stato possibile scrivere il file sul disco. Verifica che ci sia spazio libero sufficiente e di avere il permesso di salvare nella cartella attuale.",
  ja: "ファイルをディスクに書き込めません。十分な空き容量があり、現在のフォルダーへの保存権限があることを確認してください。",
  ko: "파일을 디스크에 쓸 수 없습니다. 여유 공간이 충분하고 현재 폴더에 저장할 권한이 있는지 확인해 주세요.",
  pl: "Nie udało się zapisać pliku na dysku. Upewnij się, że jest wystarczająco dużo wolnego miejsca i masz uprawnienia do zapisu w bieżącym folderze.",
  "pt-BR": "Não foi possível gravar o arquivo no disco. Confirme que há espaço livre suficiente e que você tem permissão para salvar na pasta atual.",
  ru: "Не удалось записать файл на диск. Убедитесь, что достаточно свободного места и у вас есть разрешение на сохранение в текущую папку.",
  th: "ไม่สามารถเขียนไฟล์ลงดิสก์ได้ โปรดตรวจสอบว่ามีพื้นที่ว่างเพียงพอและมีสิทธิ์บันทึกลงในโฟลเดอร์ปัจจุบัน",
  tr: "Dosya diske yazılamadı. Yeterli boş alan bulunduğunu ve mevcut klasöre kaydetme izniniz olduğunu kontrol edin.",
  uk: "Не вдалося записати файл на диск. Переконайтеся, що є достатньо вільного місця та ви маєте дозвіл зберігати файли в поточній папці.",
  "zh-CN": "文件无法写入磁盘。请确认有足够的剩余空间，且有权限保存到当前文件夹。",
  "zh-TW": "檔案無法寫入磁碟。請確認有足夠的剩餘空間，且有權限儲存到目前資料夾。",
};

describe.each(LOCALES)('OPEND-2849 supplement old wording gone: %s', (locale) => {
  it('no longer ships the old permission wording', async () => {
    const dict = await loadDict(locale);
    expect(lookup(dict, 'chat.runError.localStorageFailureMessage')).not.toBe(OLD_LOCAL_STORAGE_FAILURE[locale]);
  });
});
