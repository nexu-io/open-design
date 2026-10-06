import { describe, expect, it } from 'vitest';
import {
  classifyCommand,
  commandFile,
  fileOf,
  isRawCommandTitle,
  searchPattern,
  toolKind,
  toolTitle,
  unwrapShell,
} from '../../../src/runtime/chat/tool-kind';

const bash = (command: string, description?: string): unknown =>
  (description ? { command, description } : { command });

describe('classifyCommand · 九条真命令(规格 §2.2,实测 9/9)', () => {
  // 这九条取自真实录制,不是编的。规则改动后它们必须仍然成立。
  const cases: Array<[string, string]> = [
    ['ls -la', 'search'],
    ['cat index.html', 'read'],
    ['grep -n "gap" index.html settings.html', 'search'],
    ['find . -name "*.html"', 'search'],
    ['npm run build', 'exec'],
    ['mkdir -p dist', 'write'],
    ['cat > card.html <<\'EOF\'\n<div/>\nEOF', 'write'],
    ['sed -n \'1,220p\' src/app.tsx', 'read'],
    ['node scripts/check.mjs', 'exec'],
  ];
  it.each(cases)('%s → %s', (cmd, kind) => {
    expect(classifyCommand(cmd)).toBe(kind);
  });
});

describe('classifyCommand · 容易判错的几种写法', () => {
  it('管道只看上游:搜索结果数行,仍然是搜索不是执行 wc', () => {
    expect(classifyCommand('grep -rn "btn" src | wc -l')).toBe('search');
  });

  it('顺序执行取权重最高的一段:先读后写算写', () => {
    expect(classifyCommand('cat a.txt && tee b.txt')).toBe('write');
  });

  it('整条只有噪音命令时回落成执行,不算写', () => {
    expect(classifyCommand('cd /tmp && echo hi')).toBe('exec');
  });

  it('前置环境变量不影响判定', () => {
    expect(classifyCommand('NODE_ENV=test npm run build')).toBe('exec');
    expect(classifyCommand('FOO=1 grep -n x a.ts')).toBe('search');
  });

  it('sudo / env 只是前缀,看后面那个命令', () => {
    expect(classifyCommand('sudo rm -rf dist')).toBe('delete');
    expect(classifyCommand('env cat a.txt')).toBe('read');
  });

  it('2>&1 不是写文件', () => {
    expect(classifyCommand('npm run build 2>&1')).toBe('exec');
  });

  it('追加重定向算写', () => {
    expect(classifyCommand('echo x >> notes.md')).toBe('write');
  });

  describe('本地 OD 会话命令补样(2026-08-28)', () => {
    it('引号里的 > 是搜索模式,不是写文件重定向', () => {
      expect(classifyCommand(`rg -n 'data-label="[^>]+"' page.html`)).toBe('search');
    });

    it('产生数据的命令通过管道交给 rg 时,主导动作是搜索', () => {
      expect(classifyCommand(`env | rg '^OD_(BIN|PROJECT_ID)='`)).toBe('search');
      expect(classifyCommand(`curl -s https://example.invalid | rg -o 'src="[^"]+"'`)).toBe('search');
    });

    it('只读文本预处理后明确 grep / rg 时,按真正的搜索阶段分类', () => {
      expect(classifyCommand(`sed -n '1,220p' page.html | grep -n 'button' | head`)).toBe('search');
      expect(classifyCommand(`awk '{print $1}' report.txt | rg '^total$'`)).toBe('search');
      expect(classifyCommand(`cat page.html | rg 'button'`)).toBe('search');
      expect(classifyCommand(`cat page.html | head -20`)).toBe('read');
    });

    it('原地改写和删除不再谎报成新建', () => {
      expect(classifyCommand(`sed -i '' 's/old/new/' page.html`)).toBe('edit');
      expect(classifyCommand('rm -f obsolete.html')).toBe('delete');
    });

    it('常见的文件统计命令是读取', () => {
      expect(classifyCommand('wc -l page.html')).toBe('read');
      expect(classifyCommand('nl -ba page.html')).toBe('read');
    });

    it('内联脚本读后写回文件是改写', () => {
      const cmd = `python3 - <<'PY'\np='page.html'\ns=open(p).read()\ns=s.replace('old','new')\nopen(p,'w').write(s)\nPY`;
      expect(classifyCommand(cmd)).toBe('edit');
    });
  });
});

describe('unwrapShell · codex 把每条命令都包一层(踩坑 #16)', () => {
  it('剥掉 /bin/zsh -lc 之后才判得对', () => {
    const wrapped = '/bin/zsh -lc \'grep -n "gap" index.html\'';
    expect(unwrapShell(wrapped)).toBe('grep -n "gap" index.html');
    expect(classifyCommand(wrapped)).toBe('search');
  });

  it('不剥壳会全部判成执行 —— 这就是回归的样子', () => {
    // 直接对剥完的内容分类是 search;若实现里去掉 unwrap,这条会变成 exec。
    expect(classifyCommand('/bin/bash -lc "cat index.html"')).toBe('read');
  });

  it('结尾引号对不上也照剥,不抛错', () => {
    expect(classifyCommand('/bin/zsh -lc \'echo "a\'')).toBe('exec');
  });
});

describe('toolKind · 工具名能说明问题的直接认', () => {
  it.each([
    ['Write', 'write'],
    ['Edit', 'edit'],
    ['MultiEdit', 'edit'],
    ['apply_patch', 'edit'],
    ['Read', 'read'],
    ['Grep', 'search'],
    ['Glob', 'search'],
  ])('%s → %s', (name, kind) => {
    expect(toolKind(name, {})).toBe(kind);
  });

  it('Bash 去看命令内容', () => {
    expect(toolKind('Bash', bash('cat a.html'))).toBe('read');
    expect(toolKind('Bash', bash('npm test'))).toBe('exec');
  });

  it('认不出来的元工具不硬归类,交给 other(T4 的默认)', () => {
    expect(toolKind('ToolSearch', { query: 'select:TodoWrite' })).toBe('other');
  });
});

describe('commandFile · 从命令恢复单一文件目标', () => {
  it('cat 单文件', () => {
    expect(commandFile('cat src/index.html')).toEqual({ path: 'src/index.html', label: 'index.html' });
  });

  it('codex 惯用的 sed -n 也认', () => {
    expect(commandFile("sed -n '1,220p' apps/web/src/app.tsx")?.label).toBe('app.tsx');
  });

  it('多文件或带管道的不猜', () => {
    expect(commandFile('cat a.html b.html')).toBeNull();
    expect(commandFile('cat a.html | head -20')).toBeNull();
  });

  it('真实复合命令会穿过 cd 找到后面的读取目标', () => {
    expect(commandFile(`cd "$PWD" && sed -n '1,220p' page.html`)).toEqual({ path: 'page.html', label: 'page.html' });
  });

  it('新建、改写、删除命令也能抽出单一文件目标', () => {
    expect(commandFile(`cat > card.html <<'EOF'\n<div/>\nEOF`)).toEqual({ path: 'card.html', label: 'card.html' });
    expect(commandFile('echo x >> notes.md')).toEqual({ path: 'notes.md', label: 'notes.md' });
    expect(commandFile(`sed -i '' 's/old/new/' page.html`)).toEqual({ path: 'page.html', label: 'page.html' });
    expect(commandFile('rm -f obsolete.html')).toEqual({ path: 'obsolete.html', label: 'obsolete.html' });
  });

  it('内联脚本写回的文件可从字面量赋值中恢复', () => {
    const cmd = `python3 - <<'PY'\np='page.html'\ns=open(p).read()\nopen(p,'w').write(s)\nPY`;
    expect(commandFile(cmd)).toEqual({ path: 'page.html', label: 'page.html' });
  });

  it('heredoc 标记不是文件目标,不伪造成可打开文件', () => {
    expect(commandFile(`apply_patch <<'PATCH'\n*** Begin Patch\nPATCH`)).toBeNull();
  });
});

describe('searchPattern · 搜索行要显示搜的是什么', () => {
  it('入参里有 pattern 就用它', () => {
    expect(searchPattern('Grep', { pattern: 'gap' })).toBe('gap');
  });

  it('grep 取第一个非选项参数,选项值不算', () => {
    expect(searchPattern('Bash', bash('grep -n "gap" index.html'))).toBe('gap');
    expect(searchPattern('Bash', bash('grep -rn --include=*.ts btn src'))).toBe('btn');
  });

  it('-e 的值才是模式', () => {
    expect(searchPattern('Bash', bash('grep -e "a|b" file'))).toBe('a|b');
  });

  it('引号里的竖线属于模式,不当成管道截断', () => {
    expect(searchPattern('Bash', bash('grep "foo|bar" a.ts | wc -l'))).toBe('foo|bar');
  });

  it('find 只有带 -name 才算搜了什么', () => {
    expect(searchPattern('Bash', bash('find . -name "*.html"'))).toBe('*.html');
    expect(searchPattern('Bash', bash('find . -type f'))).toBeNull();
  });

  it('复合命令能跳过 cd 找到搜索段', () => {
    expect(searchPattern('Bash', bash(`cd "$PWD" && rg -n 'TODO|FIXME' src`))).toBe('TODO|FIXME');
  });

  /*
   * 光秃秃的 `ls` 没有「搜了什么」这个答案 —— 它只是把当前位置有什么摊开。
   * 原来这里回落成字面量 `'.'`,真机上就画成「搜索 . 14 处」(用户 2026-09-03
   * 指认,命令是 `cd "<项目>" && ls -la && …`)。
   *
   * `'.'` 不只是难看:`ToolRow` 的搜索支把 `pattern` 塞进 `FileButton`,所以那个点
   * 是**一枚看起来能点开的文件**。同一个文件里 `commandFile` 的规矩写得很清楚
   * ——「多目标 / glob / 动态变量不猜 —— 猜错比回落成命令更糟」,而
   * `ToolRow` 那支回落分支的注释逐字是「不能伪造一个可点文件」。`'.'` 正是那种伪造。
   *
   * 设计稿(`docs/design/chat-panel/src/body-components.html`,729fa43ce7)只画过
   * 一条搜索行:`搜索 商品卡 6 处` —— 模式是用户真的搜的那个词。稿子从头到尾
   * **没有列目录这一行**,所以这里不发明新行型:抽不出模式就返回 `null`,行退回
   * 稿子已有的形态(有命令没人话 → `搜索 <命令> N 处`;有人话 → 命令折叠块)。
   */
  it('抽不出模式就不伪造:光秃秃的 ls 不返回字面量 "."', () => {
    expect(searchPattern('Bash', bash('ls -la'))).toBeNull();
    // 用户真机上那条(命令原样,只把项目路径匿名化)
    expect(searchPattern('Bash', bash('cd "/Users/u/proj" && ls -la && cat package.json'))).toBeNull();
    // 显式给了路径时仍然照答 —— 那是用户真的打出来的目标
    expect(searchPattern('Bash', bash('ls -la docs'))).toBe('docs');
  });

  it('rg --files 不带 -g 时同样没有模式可报', () => {
    expect(searchPattern('Bash', bash('rg --files'))).toBeNull();
    expect(searchPattern('Bash', bash('rg --files -g "*.ts"'))).toBe('*.ts');
  });
});

describe('toolTitle · 有人话用人话,没有就回落成命令(S8)', () => {
  it('claude 给了 description', () => {
    expect(toolTitle('Bash', bash('grep -n gap a.ts', '对比两页间距'))).toBe('对比两页间距');
    expect(isRawCommandTitle('Bash', bash('grep -n gap a.ts', '对比两页间距'))).toBe(false);
  });

  it('codex 没有 description,标题就是命令本身,且要按等宽显示', () => {
    const input = bash('/bin/zsh -lc \'ls -la\'');
    expect(toolTitle('Bash', input)).toBe('ls -la');
    expect(isRawCommandTitle('Bash', input)).toBe(true);
  });

  /*
   * 多行命令取第一行 —— 但 heredoc 的开启标记要去掉:
   * 它是「后面还有几行」的语法记号,不是这条命令在做的事。
   * 详见 `commandHeadline`(用户 2026-08-26 真机指认 `node - <<'NODE'` 读不出内容)。
   */
  it('多行命令只取第一行,并去掉 heredoc 标记', () => {
    expect(toolTitle('Bash', bash('cat > a.html <<EOF\n<div/>\nEOF'))).toBe('cat > a.html');
  });
});

describe('fileOf · 各家入参字段名不统一', () => {
  it.each([
    [{ file_path: '/a/b/card.html' }],
    [{ filePath: '/a/b/card.html' }],
    [{ path: '/a/b/card.html' }],
  ])('%o → card.html', (input) => {
    expect(fileOf(input)).toEqual({ path: '/a/b/card.html', label: 'card.html' });
  });

  it('没有文件字段时返回 null,不编一个', () => {
    expect(fileOf({ command: 'ls' })).toBeNull();
  });
});
