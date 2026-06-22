import { execSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const appDataPath = 'C:\\Users\\Work-D\\AppData\\Local\\Programs\\Open Design';

function runCommand(cmd: string, cwd: string = repoRoot) {
  console.log(`[ÇALIŞTIRILIYOR] ${cmd}`);
  try {
    execSync(cmd, { cwd, stdio: 'inherit' });
  } catch (error: any) {
    // robocopy returns non-zero exit codes for successful copy (codes 1-7).
    if (cmd.startsWith('robocopy') && error.status !== undefined && error.status < 8) {
      return;
    }
    console.error(`[HATA] Komut başarısız oldu: ${cmd}`);
    throw error;
  }
}

async function main() {
  console.log('================================================================');
  console.log('        OPEN DESIGN TÜRKÇELEŞTİRME VE DEPLOY OTOMASYONU         ');
  console.log('================================================================');

  // 1. Git pull
  console.log('\n[1/4] Güncellemeler kontrol ediliyor (git pull)...');
  try {
    runCommand('git pull');
    console.log('[BAŞARILI] Güncellemeler başarıyla çekildi.');
  } catch (err) {
    console.log('[UYARI] Git pull sırasında bir hata oluştu veya çakışma var. Devam ediliyor...');
  }

  // 2. Türkçeleştirme
  console.log('\n[2/4] Yeni alanlar tespit ediliyor ve Türkçeleştiriliyor...');
  runCommand('npx tsx scripts/sync-locales.ts');
  console.log('[BAŞARILI] Tüm dil dosyaları ve şablonlar Türkçeleştirildi.');

  // 3. Web Arayüzü Derleme (Standalone)
  console.log('\n[3/4] Web arayüzü standalone modunda derleniyor...');
  runCommand('cmd /c "set OD_WEB_OUTPUT_MODE=standalone&& pnpm --filter @open-design/web build"');
  console.log('[BAŞARILI] Web arayüzü derlendi.');

  // 4. Kopyalama / Deploy
  console.log('\n[4/4] Dosyalar uygulamanın yüklü olduğu dizine kopyalanıyor (deploy)...');
  
  const destWeb = path.join(appDataPath, 'resources', 'open-design-web-standalone');
  const destResources = path.join(appDataPath, 'resources', 'open-design');

  // Sync web standalone server & modules
  console.log('-> Web standalone sunucu kopyalanıyor...');
  runCommand(`robocopy "${path.join(repoRoot, 'apps/web/.next/standalone')}" "${destWeb}" /E /R:1 /W:1 /NDL /NFL /NJH /NJS`);

  // Sync public files
  console.log('-> Statik public dosyaları kopyalanıyor...');
  runCommand(`robocopy "${path.join(repoRoot, 'apps/web/public')}" "${path.join(destWeb, 'apps/web/public')}" /E /R:1 /W:1 /NDL /NFL /NJH /NJS`);

  // Sync next static files
  console.log('-> Next static dosyaları kopyalanıyor...');
  runCommand(`robocopy "${path.join(repoRoot, 'apps/web/.next/static')}" "${path.join(destWeb, 'apps/web/.next/static')}" /E /R:1 /W:1 /NDL /NFL /NJH /NJS`);

  // Sync plugins, skills, design-systems, prompt-templates, design-templates
  console.log('-> Eklenti, beceri, tasarım ve şablon kaynakları kopyalanıyor...');
  runCommand(`robocopy "${path.join(repoRoot, 'plugins')}" "${path.join(destResources, 'plugins')}" /E /R:1 /W:1 /NDL /NFL /NJH /NJS`);
  runCommand(`robocopy "${path.join(repoRoot, 'skills')}" "${path.join(destResources, 'skills')}" /E /R:1 /W:1 /NDL /NFL /NJH /NJS`);
  runCommand(`robocopy "${path.join(repoRoot, 'prompt-templates')}" "${path.join(destResources, 'prompt-templates')}" /E /R:1 /W:1 /NDL /NFL /NJH /NJS`);
  runCommand(`robocopy "${path.join(repoRoot, 'design-systems')}" "${path.join(destResources, 'design-systems')}" /E /R:1 /W:1 /NDL /NFL /NJH /NJS`);
  runCommand(`robocopy "${path.join(repoRoot, 'design-templates')}" "${path.join(destResources, 'design-templates')}" /E /R:1 /W:1 /NDL /NFL /NJH /NJS`);

  console.log('\n================================================================');
  console.log('İŞLEMLER TAMAMLANDI! UYGULAMA TÜRKÇE OLARAK GÜNCELLENDİ VE DEPLOY EDİLDİ.');
  console.log('================================================================');
}

main().catch(err => {
  console.error('\n[HATA] Otomasyon başarısız oldu:', err);
  process.exitCode = 1;
});
