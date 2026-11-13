import { expect, test } from 'vitest'
import inlineModule from '../../../../clipper/inline.js'

const { inlineHtml } = inlineModule

// #9265 regression coverage for the extracted clipper inliner. The old
// per-URL split/join pass let a shorter mapped URL shadow a longer one that
// extended it, and never matched the "&amp;"-escaped spelling that HTML
// serialization produces inside attributes.

test('replaces a single mapped url with its data uri', () => {
  const html = '<img src="https://cdn.example.com/x.png">'
  const out = inlineHtml(html, new Map([['https://cdn.example.com/x.png', 'data:image/png;base64,AAA']]))
  expect(out).toContain('data:image/png;base64,AAA')
  expect(out).not.toContain('https://cdn.example.com/x.png')
})

test('a prefix-pair of mapped urls keeps each attribute on its own image', () => {
  const html =
    '<img src="https://cdn.example.com/x.png"><img src="https://cdn.example.com/x.png?v=2">'
  const out = inlineHtml(
    html,
    new Map([
      ['https://cdn.example.com/x.png', 'data:image/png;base64,SHORT'],
      ['https://cdn.example.com/x.png?v=2', 'data:image/png;base64,VARIANT'],
    ]),
  )
  expect(out).toContain('data:image/png;base64,SHORT')
  expect(out).toContain('data:image/png;base64,VARIANT')
  expect(out).not.toContain('https://cdn.example.com')
})

test('a url containing an ampersand is replaced through its escaped spelling', () => {
  const html = '<img src="https://cdn.example.com/img.png?a=1&amp;b=2">'
  const out = inlineHtml(
    html,
    new Map([['https://cdn.example.com/img.png?a=1&b=2', 'data:image/png;base64,AMP']]),
  )
  expect(out).toContain('data:image/png;base64,AMP')
  expect(out).not.toContain('https://cdn.example.com/img.png')
})

test('raw and escaped spellings of the same url in one document both resolve', () => {
  const html =
    '<script>var u = "https://cdn.example.com/img.png?a=1&b=2"</script><img src="https://cdn.example.com/img.png?a=1&amp;b=2">'
  const out = inlineHtml(
    html,
    new Map([['https://cdn.example.com/img.png?a=1&b=2', 'data:image/png;base64,AMP']]),
  )
  expect(out.match(/data:image\/png;base64,AMP/g)?.length).toBe(2)
})

test('an empty map leaves the html untouched', () => {
  const html = '<img src="https://cdn.example.com/x.png">'
  expect(inlineHtml(html, new Map())).toBe(html)
})
