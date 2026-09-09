import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const run = promisify(execFile);
const root = resolve("..");

describe("release notification boundary", () => {
  it("checks receipt states, safe transport and missing evidence without network or builds", async () => {
    await run("python3", ["-c", [
      "import sys, json, io, zipfile",
      "from unittest.mock import Mock, patch",
      "sys.path.insert(0, sys.argv[1])",
      "from feishu import build_report, decode_bot, signed_envelope, send, read_evidence",
      "context = dict(branch='feature', actor='alice', attempt=1, run_url='https://github.com/a/b/actions/runs/1')",
      "receipt = dict(operation='exact.publish', channel='betahyx', releaseVersion='1.0.0-betahyx.1', sourceCommit='a'*40)",
      "def report(evidence, results=None):",
      " return build_report('betahyx','1.0.0-betahyx.1','a'*40,evidence,[],results or {'publish':{'result':'failure'}},context,[])",
      "assert report({})['state'] == 'unconfirmed'",
      "assert report({'publish-receipt.json':receipt})['state'] == 'published'",
      "assert report({'publish-receipt.json':{**receipt,'sourceCommit':'b'*40}})['state'] == 'unconfirmed'",
      "evidence = {'activate-receipt.json':{**receipt,'operation':'exact.activate'}}",
      "assert report(evidence)['state'] == 'activated'",
      "assert report(evidence)['card']['header']['template'] != 'green'",
      "assert report(evidence,{'activate':{'result':'success'}})['card']['header']['template'] == 'green'",
      "assert decode_bot('') is None",
      "bot = decode_bot(json.dumps(['v1','https://open.feishu.cn/open-apis/bot/v2/hook/test','secret']))",
      "for url in ['https://evil.test/hook/test','https://open.feishu.cn/open-apis/bot/v2/hook/test?token=x','https://user@open.feishu.cn/open-apis/bot/v2/hook/test']:",
      " try: decode_bot(json.dumps(['v1',url,'secret']))",
      " except ValueError: pass",
      " else: raise AssertionError('unsafe URL accepted')",
      "assert signed_envelope({},'secret',123)['timestamp'] == '123'",
      "assert 'sign' not in signed_envelope({},'')",
      "opener, sleep = Mock(), Mock()",
      "opener.open.side_effect = [OSError('secret-url'), io.BytesIO(b'{\"code\":0}')]",
      "send({},bot,opener=opener,sleep=sleep)",
      "assert opener.open.call_count == 2 and sleep.call_count == 1",
      "opener.open.side_effect = [io.BytesIO(b'{\"code\":123}') ]",
      "try: send({},bot,opener=opener,sleep=sleep)",
      "except RuntimeError as error: assert 'secret' not in str(error)",
      "else: raise AssertionError('permanent error accepted')",
      "def download(repository, artifact, destination):",
      " with zipfile.ZipFile(destination, 'w') as archive:",
      "  archive.writestr('publish-receipt.json',json.dumps(receipt))",
      "  archive.writestr('../publish-receipt.json', '{}')",
      "inventory = [{'name':'receipts','id':1,'expired':False,'size_in_bytes':200}]",
      "with patch('feishu.run_artifacts',return_value=inventory) as listing, patch('feishu.download_artifact',side_effect=download) as fetch:",
      " warnings = []",
      " evidence = read_evidence('a/b',1,[('receipts',['publish-receipt.json']),('missing',['summary.json'])],warnings)",
      " assert evidence == {'publish-receipt.json':receipt}",
      " assert listing.call_count == 1 and fetch.call_count == 1 and len(warnings) == 1",
    ].join("\n"), resolve(root, ".github/scripts")]);
  });

  it.each(["exact", "stable", "prerelease"])("keeps %s notification independent of tool bootstrap", async lane => {
    const workflow = await readFile(resolve(root, `.github/workflows/release-${lane}.yml`), "utf8");
    const notification = workflow.slice(workflow.indexOf("\n  notify:"));
    expect(notification).toContain("always() && !cancelled()");
    expect(notification).toContain("continue-on-error: true");
    expect(notification).toContain("python3 .github/scripts/feishu.py");
    expect(notification).toContain("fetch-depth: 1");
    expect(notification).not.toMatch(/pnpm|setup-node|tools-release|release-tools/);
    expect(notification).toContain(lane === "exact" ? "secrets.RELEASE_FEISHU_BETA" : `secrets.RELEASE_FEISHU_${lane.toUpperCase()}`);
    expect(notification).toContain('--publication-artifact "exact-$RELEASE_CHANNEL-$RELEASE_VERSION-receipts"');
  });

  it.each(["dev", "pack", "release", "serve"])("uses prebuilt metatool for tools-%s", async tool => {
    const pkg = JSON.parse(await readFile(resolve(root, `tools/${tool}/package.json`), "utf8"));
    const bin = await readFile(resolve(root, `tools/${tool}/bin/tools-${tool}.mjs`), "utf8");
    expect(pkg.dependencies["@open-design/metatool"]).toBe("workspace:*");
    expect(pkg.scripts.build).toContain("metatool write .");
    expect(bin).toContain('from "@open-design/metatool"');
    expect(bin).not.toContain("/src/");
    expect(bin).not.toContain("feishu");
  });
});
