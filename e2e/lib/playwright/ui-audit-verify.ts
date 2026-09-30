/* Check the portable Current boards in one headless browser; no app server. */
import { chromium } from '@playwright/test';
import { resolve } from 'node:path';
import { readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const directory=resolve(import.meta.dirname,'../../../.tmp/ui-audit/output/boards');
const files=(await readdir(directory)).filter(name=>/^Current-[0-6]-.*\.dc\.html$/.test(name)).sort();
if(files.length!==7)throw new Error(`Expected 7 boards, found ${files.length}`);
const browser=await chromium.launch({headless:true});
try{const page=await browser.newPage({viewport:{width:1600,height:900}});for(const file of files){
  await page.goto(pathToFileURL(resolve(directory,file)).href,{waitUntil:'load'});
  const check=await page.locator('.frame img').evaluateAll(images=>images.map(img=>({src:(img as HTMLImageElement).getAttribute('src'),ok:(img as HTMLImageElement).complete&&(img as HTMLImageElement).naturalWidth>0})));
  if(check.some(image=>!image.ok))throw new Error(`${file} has an unloaded image: ${JSON.stringify(check.filter(image=>!image.ok))}`);
  console.log(`${file}: ${check.length} decoded screenshots`);
}}finally{await browser.close();}
