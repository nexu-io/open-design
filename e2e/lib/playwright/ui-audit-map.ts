/* Draft element maps from verified screenshot JSON; no inferred UI equivalence. */
import { readFile,writeFile,mkdir,readdir } from 'node:fs/promises';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'../../..');const base=resolve(root,'.tmp/ui-audit/captures');const out=resolve(base,'map');await mkdir(out,{recursive:true});
const inventory=await readFile(resolve(root,'.tmp/ui-audit/inventory.md'),'utf8');
const valid=new Set(Array.from(inventory.matchAll(/^\| ([A-Z][A-Z0-9-]*) \|/gm),m=>m[1]));
const actual=(await readdir(resolve(base,'actual'))).filter(x=>x.endsWith('.json')&&valid.has(x.slice(0,-5)));
for(const file of actual){const id=file.slice(0,-5);let a:{id:string;elements?:Array<{index:number;tag:string;text:string;style:Record<string,unknown>}>;observedState?:string};
try { a=JSON.parse(await readFile(resolve(base,'actual',file),'utf8')) as typeof a; } catch(error) { throw new Error(`Invalid actual capture JSON: ${file}`,{cause:error}); }
if(a.id!==id)throw new Error(`Capture ID mismatch: ${file}`);let d:typeof a|undefined;
try { d=JSON.parse(await readFile(resolve(base,'design',file),'utf8')) as typeof a; } catch(error) {
  if (!(error instanceof Error && 'code' in error && error.code==='ENOENT')) throw new Error(`Invalid design capture JSON: ${file}`,{cause:error});
}
const leaves=(list:typeof a.elements)=>list?.filter(x=>x.text.trim().length>0&&x.text.trim().length<=60&&!['div','main','body','article'].includes(x.tag))??[];
const failedState=a.observedState!==id&&!['E2','E3'].includes(id);
const matches=[];const used=new Set<number>();for(const source of failedState?[]:leaves(d?.elements)){const target=leaves(a.elements).find(x=>x.text.trim()===source.text.trim()&&!used.has(x.index));if(!target)continue;used.add(target.index);matches.push({design:{index:source.index,tag:source.tag,text:source.text,style:source.style},actual:{index:target.index,tag:target.tag,text:target.text,style:target.style},matchBasis:'exact visible text; element identity still needs reviewer confirmation'});}
await writeFile(resolve(out,file),JSON.stringify({id,source:{design:d?`../design/${file}`:null,actual:`../actual/${file}`},observedState:a.observedState??null,status:failedState?'unreachable-observed-fallback':d?'draft-exact-text-only':'no-design-research-supplement',pairs:matches,warning:'Do not infer style parity from this draft; inspect matching role/structure/screenshot before classifying.'},null,2));}
console.log(JSON.stringify({draftMaps:actual.length}));
