#!/usr/bin/env -S npx -y tsx
/**
 * design-studio-web — optional gpt-image-2 generation helper (fal.ai).
 *
 * Without FAL_KEY this is a dry run and prints every final prompt.
 * With FAL_KEY it calls fal.ai's synchronous openai/gpt-image-2 endpoint.
 * Generated raster files are written as PNG. If you use generate mode,
 * update image-manifest filenames / inputs or rename outputs to match the
 * extension expected by your composer.
 *
 * Usage:
 *   FAL_KEY=... npx tsx scripts/imagegen.ts inputs.json --out=./assets --force
 */
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { dirname, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DesignStudioWebInputs } from '../schema.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
interface Slot { id:string; file:string; width:number; height:number; ratio:string; prompt_section:string; required:boolean; }
interface Manifest { slots:Slot[] }

const STYLE_ANCHOR = `Use case: premium creative-studio portfolio website.
Create original art-direction imagery for an internationally competitive independent design studio. Future minimalism, experimental editorial composition, soft glass/refraction, sculptural materials, spatial light, restrained generative geometry, subtle optical distortion, museum-grade calm and cinematic grading. Palette: near-black #0A0A0B, graphite neutrals, electric blue #4D7CFE and aurora cyan #7CFFCB. Saturated accents under 5% of image area. Avoid generic SaaS illustration, purple cyberpunk gradients, stock-photo posing, watermarks, random typography and obvious AI artifacts. Images support real HTML typography, so preserve clean negative space and do not render logos or readable body copy.`;

const SLOT: Record<string,string> = {
  'work-1': 'Wide 4:3 collectible-object campaign still. Translucent sculptural object over a deep graphite plinth, razor edge highlights, refracted electric-blue filament light, tiny cyan caustic reflection, near-black museum room, macro material detail, premium 3D art direction.',
  'work-2': 'Wide 4:3 editorial archive composition. Floating paper sheets, contact prints, cropped monochrome landscape fragments and a glass reading plane arranged as a restrained spatial publishing system. One electric-blue registration line and subtle cyan reflection. No readable text.',
  'work-3': 'Wide 4:3 abstract intelligent-interface visualization without conventional UI. Transparent data planes and volumetric fields orbit a dark central object; precise geometric traces reveal invisible system behavior. Graphite dominant with blue signal lines and rare cyan nodes.',
  'work-4': 'Wide 4:3 quiet hospitality atmosphere at blue hour: minimal architectural corridor, translucent curtains, reflected water and tactile surfaces, cool neutral grade, one cyan reflection and electric-blue light seam. Spatial identity, not real-estate photography.',
  'studio': 'Vertical 7:9 creative studio documentary-art-direction hybrid. Large worktable with printed proofs, material samples, grayscale image tests, transparent acrylic objects and a monitor showing abstract generative shapes. Soft daylight, deep shadow, black/graphite furniture, one electric-blue detail. Human presence only as hands or blurred movement.'
};

function brandBlock(i:DesignStudioWebInputs):string {
  const hero=i.hero.headline.map(s=>s.text).join('');
  return `Studio: ${i.brand.name}\nPositioning: ${i.brand.tagline}\nHero idea: ${hero}\nLocation: ${i.brand.location}`;
}
function promptFor(slot:Slot,i:DesignStudioWebInputs):string {
  return [STYLE_ANCHOR,brandBlock(i),i.imagery.prompts?.[slot.id] || SLOT[slot.id] || `Create the ${slot.id} image slot.`].join('\n\n');
}
async function exists(path:string){try{return (await stat(path)).isFile()}catch{return false}}
async function callFal(prompt:string,width:number,height:number,key:string):Promise<Uint8Array>{
  const res=await fetch('https://fal.run/openai/gpt-image-2',{method:'POST',headers:{Authorization:`Key ${key}`,'Content-Type':'application/json'},body:JSON.stringify({prompt,image_size:{width,height},num_images:1,quality:'high',output_format:'png',background:'opaque'})});
  if(!res.ok) throw new Error(`fal.ai ${res.status}: ${(await res.text()).slice(0,300)}`);
  const json=await res.json() as {images?:{url:string}[]}; const url=json.images?.[0]?.url; if(!url) throw new Error('Missing images[0].url');
  const dl=await fetch(url); if(!dl.ok) throw new Error(`image download failed ${dl.status}`); return new Uint8Array(await dl.arrayBuffer());
}
async function main(){
  const inputArg=process.argv[2]; if(!inputArg||inputArg.startsWith('--')) throw new Error('Usage: imagegen.ts <inputs.json> [--out=assets/] [--only=work-1,studio] [--force]');
  let out='./assets',force=false,only:Set<string>|undefined;
  for(const arg of process.argv.slice(3)){ if(arg.startsWith('--out='))out=arg.slice(6); else if(arg==='--force')force=true; else if(arg.startsWith('--only='))only=new Set(arg.slice(7).split(',')); else throw new Error(`Unknown arg: ${arg}`); }
  const inputs=JSON.parse(await readFile(isAbsolute(inputArg)?inputArg:resolve(process.cwd(),inputArg),'utf8')) as DesignStudioWebInputs;
  const manifest=JSON.parse(await readFile(resolve(ROOT,'assets/image-manifest.json'),'utf8')) as Manifest;
  const outDir=isAbsolute(out)?out:resolve(process.cwd(),out);
  const key=process.env.FAL_KEY||''; const targets=manifest.slots.filter(s=>!only||only.has(s.id));
  if (only && [...only].some(id => !manifest.slots.some(slot => slot.id === id))) throw new Error('Unknown image slot in --only');
  if (key) await mkdir(outDir,{recursive:true});
  const failures: string[] = [];
  for(const slot of targets){
    const pngName=slot.file.replace(/\.svg$/i,'.png'); const target=resolve(outDir,pngName); const prompt=promptFor(slot,inputs);
    if(!force && await exists(target)){console.log(`· ${slot.id} — skip`);continue}
    if(!key){console.log(`\n=== ${slot.id} ${slot.width}×${slot.height} ===\n${prompt}\n=== end ===`);continue}
    process.stdout.write(`· ${slot.id} … `); try{const data=await callFal(prompt,slot.width,slot.height,key);await writeFile(target,data);console.log(`ok ${Math.round(data.byteLength/1024)} KB`)}catch(err){failures.push(slot.id);console.log(`fail — ${err instanceof Error?err.message:String(err)}`)}
  }
  if (failures.length) throw new Error(`Image generation failed for: ${failures.join(', ')}`);
  if(!key) console.log('\nFAL_KEY is not set. Dry run only; use these prompts with your preferred image-generation tool.');
}
main().catch(err=>{console.error(err);process.exit(1)});
