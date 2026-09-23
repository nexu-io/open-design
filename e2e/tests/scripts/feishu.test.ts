import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

it("keeps Python notification transport, rendering and publication decisions independent of product setup", () => {
  const result = spawnSync("python3", ["-c", `
import base64, hashlib, hmac, io, json, os, sys, urllib.error
from unittest.mock import patch
sys.path.insert(0, '.github/scripts')
import feishu as entry
from lib.feishu import signed_envelope, request_json, AppClient, NoRedirect
from lib.notification_cards import duration, elapsed, lane_duration, terminal, undiscovered, render_progress, changelog_lines
from lib.notification_watch import Observer
assert signed_envelope({}, '') == {'msg_type':'interactive', 'card':{}}
expected = base64.b64encode(hmac.new(b'123\\nsecret', b'', hashlib.sha256).digest()).decode()
assert signed_envelope({}, 'secret', 123)['sign'] == expected
assert NoRedirect().redirect_request(None, None, None, None, None, None) is None
class Opener:
    def __init__(self, replies): self.replies, self.calls = iter(replies), []
    def open(self, request, timeout):
        self.calls.append(request)
        value = next(self.replies)
        if isinstance(value, Exception): raise value
        return io.StringIO(json.dumps(value))
retry = Opener([{'code':9499}, {'code':0}]); waits=[]
assert request_json('https://open.feishu.cn/hook/secret', {}, opener=retry, retry_codes=(9499,), sleep=waits.append)['code'] == 0
assert len(retry.calls) == 2 and waits == [1]
for bad in [{'code':123,'msg':'private-secret'}, {'message':'not an acknowledgement'}]:
    transport=Opener([bad])
    try: request_json('https://open.feishu.cn/hook/secret', {}, opener=transport)
    except RuntimeError as error: assert 'private-secret' not in str(error) and 'hook/secret' not in str(error)
    else: raise AssertionError('accepted failed delivery')
    assert len(transport.calls) == 1
clock=[0]; calls=[]
def request(url, body, **kwargs):
    calls.append((url,body,kwargs))
    return {'tenant_access_token':'token', 'expire':120} if '/auth/' in url else {'data':{'message_id':'message'}}
client=AppClient('id','secret', request=request, now=lambda:clock[0])
assert client.send_card('chat', {'header':{}}) == 'message'
client.patch_card('message', {'header':{'changed':True}})
assert len([c for c in calls if '/auth/' in c[0]]) == 1
assert isinstance(calls[-1][1]['content'],str) and calls[-1][2]['method'] == 'PATCH'
clock[0]=61;client.token();assert len([c for c in calls if '/auth/' in c[0]]) == 2
assert duration(42400)=='42s' and duration(702000)=='11m42s' and duration(3845000)=='1h04m05s'
assert elapsed(59000)=='<1m' and elapsed(3599000)=='59m' and elapsed(3845000)=='1h04m'
for status in ['pending','unknown','skipped','never_started']:
    assert lane_duration(status,{'startedAt':1,'completedAt':2},1000)==''
assert undiscovered(False,False,True)=='never_started'
assert undiscovered(True,False,True)=='pending' and undiscovered(True,True,False)=='skipped'
assert terminal('never_started') and not terminal('running')
observer=Observer(env={'GITHUB_REPOSITORY':'nexu-io/open-design','ORIGIN_RUN_ID':'42','VERSION':'0.23.1-prerelease.1','GITHUB_TOKEN':'token','EXPECT_TESTS':'true','EXPECT_SMOKE':'false','VALIDATION_LOCATION':'origin'}, now=lambda:1000)
def completed(name): return {'name':name,'status':'completed','conclusion':'success','started_at':'2026-09-21T00:00:00Z','completed_at':'2026-09-21T00:01:00Z'}
observer.current.update(originJobs=[completed('Build prerelease mac arm64'),completed('Build prerelease mac intel x64'),completed('Build prerelease win x64')],originRun={'completed':True},publish='success',testsRun={'completed':True,'url':'https://example.test/run'},testsJobs=[],smokeRun={'completed':True,'url':'https://example.test/run'})
observer.plan_hits={'test_functional_e2e':True,'test_e2e_vitest':True,'test_daemon_unit_tests':True,'test_verify':True}
origin_state=observer.state(False)
assert [item['key'] for item in origin_state['platforms']]==['mac_arm64','mac_x64','win_x64']
assert all(item['status']=='success' for item in origin_state['tests']) and origin_state['finished']
state=dict(channelLabel='Prerelease',version='0.22.3-prerelease.1',branch='',commit='',previousCommit='',repo='',originRunUrl='',testsRunUrl='',smokeRunUrl='',changelog=changelog_lines(''),platforms=[],tests=[],expectTests=True,expectSmoke=True,finished=False,timedOut=False,now=60000,runCreatedAt=None,publishCompletedAt=None)
def platform(status): return dict(key='mac_arm64',label='macOS',build=status,smoke='skipped',downloadUrl='',timing={'startedAt':None,'completedAt':None})
state['platforms']=[platform('failure'),platform('pending')]
assert render_progress(state)['header']['template']=='blue'
state['platforms']=[platform('failure')]
assert '全部平台构建失败' in render_progress(state)['header']['title']['content']
state['platforms']=[platform('success')]; state['tests']=[{'key':'verify','label':'Verify','status':'never_started'}]
render=render_progress(state); assert render['header']['template']=='orange' and '未触发' in render['header']['title']['content'] and '未通过' not in render['header']['title']['content']
with patch.dict(os.environ, {'VERSION':'0.22.3-beta.1','CHANNEL_LABEL':'Beta','BUILD_STATE':'failure','VERSION_METADATA_URL':'https://cdn.example/metadata.json','WIN_X64_SMOKE_RESULT':'failure','WIN_URL':'https://cdn.example/setup.exe'}, clear=True):
    card=entry.release_card()
    assert card['header']['template']=='orange'
    assert any(e.get('actions') for e in card['elements'])
for stage,values in [('dispatch',{'CARD_DISPATCHED':'true'}),('watch',{'CARD_JOB_RESULT':'success','CARD_DELIVERED':'true'})]:
    with patch.dict(os.environ, {'STAGE':stage,**values}, clear=True), patch.object(entry,'output') as output, patch.object(entry,'public_probe') as probe:
        entry.fallback(); assert output.call_args_list[-1].args==('alert','false'); probe.assert_not_called()
with patch.dict(os.environ, {'STAGE':'watch','CARD_JOB_RESULT':'success','VERSION_METADATA_URL':'https://cdn.example/metadata.json'}, clear=True), patch.object(entry,'output') as output:
    entry.fallback(); assert output.call_args_list[-1].args==('alert','true')
    assert dict(call.args for call in output.call_args_list)['template']=='orange'
print('notification contracts passed')
`], { cwd: root, encoding: "utf8" });
  expect(result.status, result.stderr || result.stdout).toBe(0);
});
