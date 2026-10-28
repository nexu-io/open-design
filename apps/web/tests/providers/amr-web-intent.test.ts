import { afterEach, describe, expect, it, vi } from 'vitest';
import { amrWebTarget, prepareAmrWebUrl } from '../../src/providers/amr-web-intent';
import { setRuntimeAmrConsoleOrigin } from '../../src/runtime/amr-guidance';

afterEach(()=>{vi.unstubAllGlobals();setRuntimeAmrConsoleOrigin(null);});
describe('AMR web account handoff',()=>{
  it('sends only approved console target paths and keeps workspace/billing intent',async()=>{
    setRuntimeAmrConsoleOrigin('https://feature.example.invalid/cloud');
    const fetch=vi.fn(async()=>Response.json({url:'https://feature.example.invalid/cloud/login?intentId=trusted'}));vi.stubGlobal('fetch',fetch);
    const url=await prepareAmrWebUrl('https://feature.example.invalid/cloud/dashboard?workspaceId=ws-a&billing=plan');
    expect(url).toContain('intentId=trusted');expect(fetch).toHaveBeenCalledWith('/api/amr/web-intent',expect.objectContaining({body:JSON.stringify({target:'/dashboard?workspaceId=ws-a&billing=plan'})}));
  });
  it('does not turn unrelated external links into account intents',async()=>{const fetch=vi.fn();vi.stubGlobal('fetch',fetch);expect(amrWebTarget('https://other.example/dashboard')).toBeNull();await expect(prepareAmrWebUrl('https://open-design.ai/pricing')).resolves.toBe('https://open-design.ai/pricing');expect(fetch).not.toHaveBeenCalled();});
  it('uses ordinary login only for an explicitly signed-out daemon',async()=>{vi.stubGlobal('fetch',vi.fn(async()=>Response.json({}, {status:401})));const result=new URL(await prepareAmrWebUrl('https://open-design.ai/cloud/dashboard?billing=plan'));expect(result.pathname).toBe('/cloud/login');expect(result.searchParams.get('redirect')).toBe('/dashboard?billing=plan');});
  it('does not silently lose the verified source on network/server failures',async()=>{vi.stubGlobal('fetch',vi.fn(async()=>Response.json({}, {status:502})));await expect(prepareAmrWebUrl('https://open-design.ai/cloud/dashboard')).rejects.toThrow();});
});
