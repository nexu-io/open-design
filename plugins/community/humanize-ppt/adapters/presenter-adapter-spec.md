# Presenter Adapter

V0.1 uses a shell-style presenter adapter.

It does not rewrite the rendered deck. It wraps it.

```text
final/
  deck/index.html
  presenter/index.html
  presenter/notes.json
```

Minimum features:

- current slide preview
- next slide preview
- speaker notes
- timer
- keyboard navigation
- no visual mutation of the audience deck

Future bridge targets:

- generic hash navigation
- guizang-style deck bridge
- Zara deck-stage bridge
