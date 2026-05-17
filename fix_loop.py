import sys
sys.stdout.reconfigure(encoding='utf-8')
path = 'F:/open-design/apps/daemon/src/prompts/system.ts'
with open(path, encoding='utf-8') as f:
    src = f.read()

old = 'while [ "\\$ec" -eq 2 ] && [ -n "\\$task_id" ]; do\n  out=\\$("$OD_NODE_BIN" "$OD_BIN" media wait "\\$task_id" --since "\\$since")\n  ec=\\$?\n  last=\\$(printf \'%s\\\\n\' "\\$out" | tail -1)\n  since=\\$(printf \'%s\\\\n\' "\\$last" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get(\'nextSince\',\\$since))" 2>/dev/null)\n  since="\\${since:-0}"\ndone'

new = 'while [ -n "\\$task_id" ]; do\n  out=\\$("$OD_NODE_BIN" "$OD_BIN" media wait "\\$task_id" --since "\\$since")\n  ec=\\$?\n  last=\\$(printf \'%s\\\\n\' "\\$out" | tail -1)\n  since=\\$(printf \'%s\\\\n\' "\\$last" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get(\'nextSince\',\\$since))" 2>/dev/null)\n  since="\\${since:-0}"\n  if [ "\\$ec" -eq 0 ]; then\n    task_id=""\n  elif [ "\\$ec" -ne 2 ]; then\n    echo "\\$out" >&2; exit "\\$ec"\n  fi\ndone'

if old in src:
    src = src.replace(old, new)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(src)
    print('SUCCESS: replaced while loop')
else:
    print('FAIL: not found')
