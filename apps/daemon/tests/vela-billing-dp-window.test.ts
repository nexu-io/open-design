import { describe, expect, it } from 'vitest';
import { parseWorkspaceBillingSnapshot } from '../src/integrations/vela-billing.js';
const base = { schemaVersion:1, workspaceId:'ws_team', workspaceMemberId:'member_team', billingScopeVersion:2, billing:{ billingState:'active', planId:'pro' }, wallet:{ balanceUsd:'7.89', expiresAt:null, updatedAt:null }, revisions:{billing:'b',wallet:'w'} };
const valid = { kind:'5h', windowStart:null, resetsAt:'2028-02-29T01:02:03.123456789Z', remainingCredits:'0', limitCredits:'900719925474099300000' };
describe('DP windows additive transport', () => {
 it.each([{windows:[valid]}, {windows:[]}, {windows:[valid,valid]}])('preserves original valid window array $windows', ({windows}) => {
   expect(parseWorkspaceBillingSnapshot(JSON.stringify({...base, designPlanWindows:windows}), 'ws_team')).toEqual({...base, designPlanWindows:windows});
 });
 it.each([undefined,null,{},[{...valid,kind:'1d'}],[{...valid,remainingCredits:0}],[{...valid,remainingCredits:'-1'}],[{...valid,limitCredits:'01'}],[{...valid,windowStart:'2026-02-29T00:00:00Z'}],[{...valid,resetsAt:undefined}],[valid,{...valid,limitCredits:'1.5'}]].map(windows=>({windows})))('omits entire invalid optional $windows without losing original wallet', ({windows}) => {
   const parsed=parseWorkspaceBillingSnapshot(JSON.stringify({...base, designPlanWindows:windows}), 'ws_team');
   expect(parsed).toEqual(base);
   expect(parsed).not.toHaveProperty('designPlanWindows');
 });
 it('retains exact workspace/member authority', () => {
   expect(parseWorkspaceBillingSnapshot(JSON.stringify({...base,designPlanWindows:[valid]}),'foreign')).toBeNull();
   expect(parseWorkspaceBillingSnapshot(JSON.stringify({...base,workspaceMemberId:'',designPlanWindows:[valid]}),'ws_team')).toBeNull();
 });
});
