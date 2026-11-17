import { describe, it, expect, vi } from 'vitest';
import { createVelaWebIntent } from '../src/integrations/vela-web-intent.js';

describe('client web account intent', () => {
  const input={apiUrl:'http://127.0.0.1:18080',consoleOrigin:'http://127.0.0.1:5173/cloud',controlKey:'local-test-key',target:'/dashboard?billing=plan'};
  it('passes source credential only to API and opens an opaque same-profile intent',async()=>{
    const request=vi.fn().mockResolvedValue(new Response(JSON.stringify({intentId:'opaque-intent'})));
    const result=await createVelaWebIntent(input,request);
    expect(result.url).toBe('http://127.0.0.1:5173/cloud/login?intentId=opaque-intent');
    expect(request.mock.calls[0]?.[1].headers.authorization).toBe('Bearer local-test-key');
    expect(request.mock.calls[0]?.[1].body).toBe(JSON.stringify({target:input.target}));
    expect(result.url).not.toContain(input.controlKey);
  });
  it('rejects arbitrary destinations before sending credentials',async()=>{
    const request=vi.fn();
    await expect(createVelaWebIntent({...input,target:'//attacker.test'},request)).rejects.toThrow('invalid_target');
    expect(request).not.toHaveBeenCalled();
  });
  it('does not silently open a different account when source validation fails',async()=>{
    await expect(createVelaWebIntent(input,vi.fn().mockResolvedValue(new Response('',{status:401})))).rejects.toThrow('amr_login_required');
    await expect(createVelaWebIntent(input,vi.fn().mockResolvedValue(new Response('',{status:503})))).rejects.toThrow('amr_web_intent_unavailable');
  });
});
