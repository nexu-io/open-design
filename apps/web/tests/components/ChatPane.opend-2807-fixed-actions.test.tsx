// @vitest-environment jsdom
// Product decision 2026-09-15 / OPEND-2807: fixed card actions replace every
// previous ladder action. Real ChatPane, AssistantMessage and RunErrorCard;
// only the unrelated composer is replaced. No classifier or card mocks.
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {forwardRef,type ComponentProps} from 'react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {ChatPane} from '../../src/components/ChatPane';
import {zhCN} from '../../src/i18n/locales/zh-CN';
import type {AgentEvent,AppConfig,ChatMessage} from '../../src/types';

const translate=(key:string,vars?:Record<string,string|number>)=>{
 const text=zhCN[key as keyof typeof zhCN]??key;
 return text.replace(/\{(\w+)\}/g,(_,name:string)=>vars?.[name]===undefined?`{${name}}`:String(vars[name]));
};
vi.mock('../../src/i18n',()=>({useI18n:()=>({locale:'zh-CN',setLocale:()=>undefined,t:translate}),useT:()=>translate}));
vi.mock('../../src/components/ChatComposer',()=>({ChatComposer:forwardRef((_props,_ref)=><div data-testid="composer"/>)}));
afterEach(()=>{cleanup();vi.clearAllMocks();});

type StatusEvent=Extract<AgentEvent,{kind:'status'}>;
function errorEvent(overrides:Partial<StatusEvent>={}):StatusEvent{
 return {kind:'status',label:'error',code:'AGENT_EXECUTION_FAILED',detail:'controlled diagnostic retained for export',failureDetail:'process_crashed',...overrides};
}
const cases:Array<{name:string;agentId:string;event:StatusEvent;resumable?:boolean}>=[
 {name:'Cloud plan unavailable previously showed upgrade plus retry',agentId:'amr',event:errorEvent({code:'AMR_TIER_UPGRADE_REQUIRED',failureDetail:undefined})},
 {name:'Cloud sign-in previously mounted inline authorize',agentId:'amr',event:errorEvent({code:'AMR_AUTH_REQUIRED',failureDetail:undefined})},
 {name:'Cloud generic unauthorized alias',agentId:'amr',event:errorEvent({code:'UNAUTHORIZED',failureDetail:undefined})},
 {name:'Cloud workspace credit recharge action',agentId:'amr',event:errorEvent({failureDetail:'workspace_credits_exhausted'})},
 {name:'Cloud suspended account support-only rung',agentId:'amr',event:errorEvent({failureDetail:'account_suspended',retryable:false,failureAction:'none'})},
 {name:'Cloud model-unavailable switch-model rung',agentId:'amr',event:errorEvent({code:'AMR_MODEL_UNAVAILABLE',failureDetail:undefined,retryable:false})},
 {name:'Cloud resumable failure must not replace Retry with Continue',agentId:'amr',event:errorEvent(),resumable:true},
 {name:'Cloud transient failure',agentId:'amr',event:errorEvent()},
 {name:'CLI transient failure previously retained local Retry',agentId:'claude',event:errorEvent()},
 {name:'CLI local sign-in',agentId:'claude',event:errorEvent({code:'AGENT_AUTH_REQUIRED',failureDetail:undefined})},
 {name:'CLI terminal authorization',agentId:'antigravity',event:errorEvent({code:'AGENT_AUTH_REQUIRED',failureDetail:undefined})},
 {name:'CLI terminal model switch',agentId:'antigravity',event:errorEvent({code:'RATE_LIMITED',failureDetail:undefined})},
 {name:'CLI certificate settings action',agentId:'claude',event:errorEvent({failureDetail:'certificate_failure'})},
 {name:'CLI proxy settings action',agentId:'claude',event:errorEvent({failureDetail:'proxy_configuration'})},
 {name:'CLI model switch action',agentId:'claude',event:errorEvent({code:'AMR_MODEL_UNAVAILABLE',failureDetail:undefined})},
 {name:'CLI resumable failure previously offered Continue',agentId:'claude',event:errorEvent(),resumable:true},
 {name:'BYOK invalid API key',agentId:'deepseek',event:errorEvent({failureDetail:'invalid_api_key'})},
 {name:'BYOK suspended account local escape',agentId:'deepseek',event:errorEvent({failureDetail:'account_suspended',retryable:false,failureAction:'none'})},
];
function failedTurn(agentId:string,event:StatusEvent,resumable=false):ChatMessage{
 return {id:'failed-assistant',role:'assistant',content:'',createdAt:1000,endedAt:2000,runId:'failed-run',runStatus:'failed',agentId,resumable,events:[event]};
}
function renderPane(message:ChatMessage,extra:Partial<ComponentProps<typeof ChatPane>>={}){
 const onRetry=vi.fn(),onSwitchToAmrAndRetry=vi.fn();
 const actions={onRetry,onSwitchToAmrAndRetry,onResumeRun:vi.fn(),onSwitchModel:vi.fn(),onOpenSettings:vi.fn(),onSwitchToLocalCli:vi.fn(),onLaunchAntigravityOauth:vi.fn().mockResolvedValue(undefined)};
 render(<ChatPane messages={[{id:'user-1',role:'user',content:'Create the requested page',createdAt:0},message]}
  streaming={false} error={null} projectId="project-2807" projectFiles={[]}
  onEnsureProject={async()=>'project-2807'} onSend={vi.fn()} onStop={vi.fn()}
  conversations={[{projectId:'project-2807',id:'conversation-1',title:'Current',createdAt:0,updatedAt:0}]}
  activeConversationId="conversation-1" onSelectConversation={vi.fn()} onDeleteConversation={vi.fn()}
  config={{mode:'daemon',agentId:message.agentId,agentCliEnv:{}} as AppConfig}
  showByokRecoveryAction {...actions} {...extra}/>);
 return actions;
}
function expectFixedActions(cloud:boolean){
 const card=screen.getByTestId('chat-run-error-card');
 const names=within(card).getAllByRole('button').map(button=>button.textContent?.trim());
 expect(names).toEqual(['联系我们','导出日志',cloud?'重试':'切换到 OpenDesign Cloud']);
 expect(card.querySelectorAll('[data-run-error-action="primary"]')).toHaveLength(1);
 return within(card).getByRole('button',{name:cloud?'重试':'切换到 OpenDesign Cloud'});
}
describe('OPEND-2807 fixed actions override the old recovery ladder',()=>{
 it.each(cases)('$name',({agentId,event,resumable})=>{
  const message=failedTurn(agentId,event,resumable),before=structuredClone(message);
  const actions=renderPane(message);const primary=expectFixedActions(agentId==='amr');
  fireEvent.click(primary);
  if(agentId==='amr'){
   expect(actions.onRetry).toHaveBeenCalledOnce();
   expect(actions.onRetry).toHaveBeenCalledWith(expect.objectContaining({id:message.id}),'manual_retry');
   expect(actions.onSwitchToAmrAndRetry).not.toHaveBeenCalled();
  }else{
   expect(actions.onSwitchToAmrAndRetry).toHaveBeenCalledOnce();
   expect(actions.onSwitchToAmrAndRetry).toHaveBeenCalledWith(expect.objectContaining({id:message.id}));
   expect(actions.onRetry).not.toHaveBeenCalled();
  }
  expect(actions.onResumeRun).not.toHaveBeenCalled();expect(actions.onSwitchModel).not.toHaveBeenCalled();
  expect(actions.onOpenSettings).not.toHaveBeenCalled();expect(actions.onSwitchToLocalCli).not.toHaveBeenCalled();
  expect(actions.onLaunchAntigravityOauth).not.toHaveBeenCalled();expect(message).toEqual(before);
 });
 it.each([{failed:'amr',selected:'claude'},{failed:'claude',selected:'amr'}])('uses failed run $failed even after selection changes to $selected',({failed,selected})=>{
  renderPane(failedTurn(failed,errorEvent()),{config:{mode:'daemon',agentId:selected,agentCliEnv:{}} as AppConfig});
  expectFixedActions(failed==='amr');
 });
 it('keeps Cloud Retry visible but disabled while this conversation is busy',()=>{
  const actions=renderPane(failedTurn('amr',errorEvent()),{recoveryActionsBlockedReason:'conversation-busy'});
  const retry=expectFixedActions(true) as HTMLButtonElement;
  expect(retry.disabled).toBe(true);fireEvent.click(retry);expect(actions.onRetry).not.toHaveBeenCalled();
  expect(screen.queryByTestId('chat-error-actions-blocked')).toBeNull();
 });
 it('does not revive the Git Bash card or erase the real failed history',()=>{
  const message=failedTurn('claude',errorEvent({failureDetail:'git_bash_missing',retryable:false,detail:'Claude Code on Windows requires git-bash.'}));
  const before=structuredClone(message);renderPane(message);
  expect(screen.queryByTestId('chat-run-error-card')).toBeNull();
  expect(screen.getByTestId('assistant-role')).toBeTruthy();expect(screen.getByText('运行失败')).toBeTruthy();
  expect(message).toEqual(before);
 });
});
