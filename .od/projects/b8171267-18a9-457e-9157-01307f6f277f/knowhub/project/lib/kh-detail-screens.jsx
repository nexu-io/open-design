// kh-detail-screens.jsx — video detail + source detail, mobile
// Reuses shared primitives, icons, Pill, BottomNav from kh-screens.jsx.

// ─── Local icons (detail-specific) ────────────────────────
const Icon2 = ({ d, size = 20, stroke = 'currentColor', fill = 'none', sw = 1.6 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={stroke}
       strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
    {typeof d === 'string' ? <path d={d} /> : d}
  </svg>
);
const IconBack = (p) => <Icon2 {...p} d="M15 6l-6 6 6 6" />;
const IconMore = (p) => <Icon2 {...p} d={<><circle cx="5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="19" cy="12" r="1.4" fill="currentColor"/></>} stroke="none" />;
const IconExt  = (p) => <Icon2 {...p} d={<><path d="M14 4h6v6"/><path d="M20 4l-8 8"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/></>} />;
const IconSparkle = (p) => <Icon2 {...p} d="M12 3v4M12 17v4M3 12h4M17 12h4M5.5 5.5l2.8 2.8M15.7 15.7l2.8 2.8M5.5 18.5l2.8-2.8M15.7 8.3l2.8-2.8" />;
const IconChev = (p) => <Icon2 {...p} d="M9 18l6-6-6-6" />;
const IconPlay2 = (p) => <Icon2 {...p} d="M8 5v14l11-7z" fill="currentColor" stroke="none" />;

// ─── Mobile detail header (56px, back + title + actions) ─
function DetailHeader({ back = 'Back', actions }) {
  return window.DetailHeaderBase
    ? <window.DetailHeaderBase back={back} actions={actions} />
    : (
      <header style={{
        position: 'sticky', top: 0, zIndex: 30,
        height: 56, padding: '0 8px 0 4px',
        display: 'flex', alignItems: 'center', gap: 4,
        background: 'var(--header-bg)', backdropFilter: 'blur(var(--blur-md))', WebkitBackdropFilter: 'blur(var(--blur-md))',
        borderBottom: '1px solid var(--border)',
      }}>
        <IconButton icon={IconBack} label="Back" />
        <div style={{
          fontSize: 13, fontWeight: 500, color: 'var(--muted)', letterSpacing: -0.1,
        }}>{back}</div>
        <div style={{ flex: 1 }} />
        {actions}
        <IconButton icon={IconMore} label="More" />
      </header>
    );
}

function ActionButton({ children, icon, primary }) {
  return <Button variant={primary ? 'primary' : 'outline'} size="md" icon={icon}>{children}</Button>;
}

// ─── Section in detail body ──────────────────────────────
function DetailSection({ label, children, trailing }) {
  return (
    <section style={{ marginTop: 28, padding: '0 16px' }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        marginBottom: 10,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 600, letterSpacing: 0.8, textTransform: 'uppercase',
          color: 'var(--muted)',
        }}>{label}</div>
        {trailing}
      </div>
      {children}
    </section>
  );
}

// ─── Video detail screen ────────────────────────────────
function ScreenVideoDetail() {
  return (
    <div style={{
      width: '100%', height: '100%', background: 'var(--background)', color: 'var(--foreground)', fontFamily: 'var(--font-sans)',
      display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden',
      fontFeatureSettings: 'var(--font-feature-settings)',
    }}>
      <DetailHeader back="Library" />
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 96 }}>
        {/* Hero thumb */}
        <div style={{ padding: '8px 16px 0' }}>
          <div style={{
            position: 'relative', width: '100%', aspectRatio: '16 / 9',
            borderRadius: 12, overflow: 'hidden',
            background: 'linear-gradient(135deg, var(--thumb), var(--thumb-accent))',
          }}>
            <div style={{
              position: 'absolute', inset: 0,
              backgroundImage: 'repeating-linear-gradient(135deg, transparent 0 11px, var(--border) 11px 12px)',
              opacity: 0.6,
            }} />
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{
                width: 52, height: 52, borderRadius: 26,
                background: 'var(--scrim)', backdropFilter: 'blur(4px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--primary-foreground)', paddingLeft: 3,
              }}><IconPlay2 size={18} /></div>
            </div>
            <div style={{
              position: 'absolute', right: 8, bottom: 8,
              padding: '2px 6px', borderRadius: 4, background: 'var(--scrim)',
              color: 'var(--primary-foreground)', fontSize: 11, fontWeight: 600,
              fontVariantNumeric: 'tabular-nums',
            }}>42:08</div>
          </div>
        </div>

        {/* Title + meta */}
        <div style={{ padding: '16px 16px 0' }}>
          <h1 style={{
            margin: 0, fontSize: 20, fontWeight: 650, lineHeight: 1.25,
            color: "var(--foreground)", letterSpacing: -0.4,
          }}>Building agent orchestration with LangGraph from first principles</h1>
          <div style={{
            marginTop: 10, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 10px',
            fontSize: 12, color: "var(--muted)", fontVariantNumeric: 'tabular-nums',
          }}>
            <span style={{ color: "var(--foreground-dim)", fontWeight: 500 }}>Latent Space</span>
            <span style={{ color: "var(--muted-dim)" }}>·</span>
            <span>Posted Apr 14</span>
            <span style={{ color: "var(--muted-dim)" }}>·</span>
            <span>Processed 2026-04-15</span>
          </div>
        </div>

        {/* Action bar */}
        <div style={{ padding: '14px 16px 0', display: 'flex', gap: 8 }}>
          <ActionButton primary icon={IconSparkle}>Create skill</ActionButton>
          <ActionButton icon={IconExt}>YouTube</ActionButton>
        </div>

        {/* TOC pills (horizontal scroll) */}
        <div style={{ marginTop: 20, position: 'relative' }}>
          <div style={{
            display: 'flex', gap: 6, padding: '0 16px',
            overflowX: 'auto', scrollbarWidth: 'none',
          }}>
            {['Summary', 'Takeaways', 'Things', 'Quotes', 'Tools', 'Screenshots', 'Transcript'].map((s, i) => (
              <span key={s} style={{
                flexShrink: 0, height: 28, padding: '0 12px', borderRadius: 14,
                display: 'inline-flex', alignItems: 'center',
                fontSize: 12, fontWeight: 500, letterSpacing: -0.1,
                background: i === 0 ? "var(--primary-tint)" : "var(--pill-bg)",
                color: i === 0 ? "var(--primary)" : "var(--muted)",
                border: `1px solid ${i === 0 ? 'transparent' : "var(--border)"}`,
              }}>{s}</span>
            ))}
          </div>
        </div>

        {/* Summary */}
        <DetailSection label="Summary">
          <p style={{
            margin: 0, fontSize: 14, lineHeight: 1.6, color: "var(--foreground-dim)",
            letterSpacing: -0.1,
          }}>
            A ground-up walkthrough of stateful agent graphs — how to design nodes, edges, and checkpoints so that tool-heavy workflows remain debuggable when things inevitably start failing. The host spends the first half on the mental model and the second half walking through a real orchestration for a customer-support triage bot.
          </p>
        </DetailSection>

        {/* Takeaways */}
        <DetailSection label="Key takeaways">
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              'State graphs beat prompt chains once you have more than two fallible tools in the loop.',
              'Checkpoint the entire graph state, not just the message history — tool outputs are the expensive part.',
              'The ReAct loop is a tarpit; prefer explicit edges with typed handoffs.',
            ].map((s, i) => (
              <li key={i} style={{
                display: 'flex', gap: 10, alignItems: 'flex-start',
                fontSize: 14, lineHeight: 1.55, color: "var(--foreground-dim)",
              }}>
                <span style={{
                  flexShrink: 0, color: "var(--primary)", marginTop: 2, fontSize: 14, fontWeight: 600,
                }}>→</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </DetailSection>

        {/* Things They Do — with timestamp + screenshot */}
        <DetailSection label="Things they do" trailing={
          <span style={{ fontSize: 11, color: "var(--muted-dim)", fontVariantNumeric: 'tabular-nums' }}>4 moments</span>
        }>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { n: 1, text: 'Sketch the graph on paper before opening an editor.', ts: '04:12', hasSs: false },
              { n: 2, text: 'Define a typed State object that every node both reads from and writes to.', ts: '11:38', hasSs: true },
              { n: 3, text: 'Make the router node stateless and deterministic.', ts: '22:07', hasSs: false },
            ].map((th) => (
              <div key={th.n} style={{
                background: "var(--card)", border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden',
              }}>
                <div style={{ padding: 12, display: 'flex', gap: 10 }}>
                  <span style={{
                    flexShrink: 0, width: 22, height: 22, borderRadius: 11,
                    background: "var(--pill-bg)", color: "var(--muted)",
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                  }}>{th.n}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, lineHeight: 1.5, color: "var(--foreground-dim)", letterSpacing: -0.1 }}>
                      {th.text}{' '}
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 3,
                        height: 20, padding: '0 7px', borderRadius: 10,
                        background: 'var(--primary-tint)', color: 'var(--primary)',
                        fontSize: 11, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                        verticalAlign: '2px',
                      }}>
                        <IconPlay2 size={8} />{th.ts}
                      </span>
                    </div>
                  </div>
                </div>
                {th.hasSs && (
                  <div style={{
                    borderTop: '1px solid var(--border)',
                    aspectRatio: '16 / 7',
                    background: 'linear-gradient(135deg, var(--thumb), var(--thumb-accent))',
                    position: 'relative', overflow: 'hidden',
                  }}>
                    <div style={{
                      position: 'absolute', inset: 0,
                      backgroundImage: 'repeating-linear-gradient(135deg, transparent 0 11px, var(--border) 11px 12px)',
                      opacity: 0.55,
                    }} />
                    <div style={{
                      position: 'absolute', left: 8, bottom: 8,
                      display: 'inline-flex', alignItems: 'center', gap: 3,
                      height: 20, padding: '0 7px', borderRadius: 10,
                      background: 'var(--scrim)', color: 'var(--primary-foreground)',
                      fontSize: 11, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                    }}>
                      <IconPlay2 size={8} /> {th.ts}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </DetailSection>

        {/* Quote */}
        <DetailSection label="Notable quote">
          <blockquote style={{
            margin: 0, padding: '10px 14px',
            borderLeft: '2px solid var(--primary)',
            background: "var(--card)", borderRadius: '0 12px 12px 0',
            fontSize: 14, fontStyle: 'italic', lineHeight: 1.55,
            color: "var(--foreground-dim)", letterSpacing: -0.1,
          }}>
            “The mistake people make is treating the agent as the program. The graph is the program. The model is just one of the functions you call.”
          </blockquote>
        </DetailSection>

        {/* Tools */}
        <DetailSection label="Tools mentioned">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {['LangGraph', 'Pydantic', 'Postgres', 'Weights & Biases', 'tmux'].map((x) => (
              <span key={x} style={{
                height: 26, padding: '0 10px', borderRadius: 8,
                display: 'inline-flex', alignItems: 'center',
                fontSize: 12, fontWeight: 500,
                background: "var(--pill-bg)", color: "var(--foreground-dim)", border: '1px solid var(--border)',
              }}>{x}</span>
            ))}
          </div>
        </DetailSection>

        {/* Topics */}
        <DetailSection label="Topics">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {['agents', 'langgraph', 'orchestration', 'tooling', 'state-machines'].map((x) => (
              <span key={x} style={{
                height: 22, padding: '0 8px', borderRadius: 999,
                display: 'inline-flex', alignItems: 'center',
                fontSize: 11, fontWeight: 500,
                background: "var(--pill-bg)", color: "var(--muted)", border: '1px solid var(--border)',
              }}>#{x}</span>
            ))}
          </div>
        </DetailSection>

        {/* Transcript preview row */}
        <DetailSection label="Transcript">
          <button style={{
            width: '100%', padding: 14, background: "var(--card)", border: '1px solid var(--border)',
            borderRadius: 12, textAlign: 'left', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'inherit',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--foreground)", letterSpacing: -0.1 }}>
                Full transcript
              </div>
              <div style={{ fontSize: 11, color: "var(--muted-dim)", marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                42:08 · 8,240 words
              </div>
            </div>
            <IconChev size={16} stroke="var(--muted)" />
          </button>
        </DetailSection>
      </div>

      <BottomNav active="home" />
    </div>
  );
}

// ─── Source detail screen ───────────────────────────────
function ScreenSourceDetail() {
  return (
    <div style={{
      width: '100%', height: '100%', background: "var(--background)", color: "var(--foreground)", fontFamily: "var(--font-sans)",
      display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden',
      fontFeatureSettings: '"cv01","ss03"',
    }}>
      <DetailHeader back="Library" />
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 96 }}>
        {/* Kind + status strip */}
        <div style={{ padding: '14px 16px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8, background: "var(--pill-bg)",
            border: '1px solid var(--border)', color: "var(--muted)",
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}><IconExt size={15} stroke="var(--muted)" /></div>
          <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 500, letterSpacing: 0.1 }}>
            Article · <span style={{ color: 'var(--success)' }}>done</span>
          </div>
        </div>

        {/* Title + host */}
        <div style={{ padding: '10px 16px 0' }}>
          <h1 style={{
            margin: 0, fontSize: 20, fontWeight: 650, lineHeight: 1.25,
            color: "var(--foreground)", letterSpacing: -0.4,
          }}>Context engineering is the new prompt engineering</h1>
          <div style={{
            marginTop: 6, fontSize: 12, color: "var(--muted)",
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>simonwillison.net</div>
        </div>

        {/* Actions */}
        <div style={{ padding: '14px 16px 0', display: 'flex', gap: 8 }}>
          <ActionButton primary icon={IconSparkle}>Create skill</ActionButton>
          <ActionButton icon={IconExt}>Open source</ActionButton>
        </div>

        {/* KV row */}
        <div style={{
          margin: '18px 16px 0', padding: 12,
          background: "var(--card)", border: '1px solid var(--border)', borderRadius: 12,
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px',
        }}>
          {[
            ['Type', 'article'],
            ['Status', 'done'],
            ['Created', 'Apr 12, 2026'],
            ['Processed', 'Apr 12, 2026'],
          ].map(([k, v]) => (
            <div key={k}>
              <div style={{ fontSize: 10, color: "var(--muted-dim)", letterSpacing: 0.6, textTransform: 'uppercase', fontWeight: 600 }}>{k}</div>
              <div style={{ fontSize: 13, color: "var(--foreground-dim)", marginTop: 2, letterSpacing: -0.1 }}>{v}</div>
            </div>
          ))}
        </div>

        {/* Analysis */}
        <DetailSection label="Analysis">
          <div style={{ fontSize: 14, lineHeight: 1.65, color: "var(--foreground-dim)", letterSpacing: -0.1 }}>
            <p style={{ margin: '0 0 12px' }}>
              The author walks through a progression most practitioners are living: the “prompt” as a unit of authorship is dissolving into something closer to long-form context curation — and the tooling is trailing the practice.
            </p>
            <h3 style={{
              margin: '16px 0 8px', fontSize: 13, fontWeight: 600,
              color: "var(--foreground)", letterSpacing: -0.1,
            }}>Three shifts worth noting</h3>
            <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <li>Retrieval is now a first-class product surface, not a hidden subroutine.</li>
              <li>Evaluation moved from prompts to rollouts — you grade the trajectory, not the turn.</li>
              <li>The interesting abstractions live at the context-assembly layer.</li>
            </ul>
          </div>
        </DetailSection>

        {/* Notes */}
        <DetailSection label="Notes">
          <div style={{
            padding: 12, background: "var(--card)", border: '1px solid var(--border)', borderRadius: 12,
            fontSize: 13, lineHeight: 1.55, color: "var(--foreground-dim)", letterSpacing: -0.1,
          }}>
            Worth mining for the “grade the trajectory” framing — fits the orchestration notes from last week.
          </div>
        </DetailSection>

        {/* Topic */}
        <DetailSection label="Topic">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            <span style={{
              height: 22, padding: '0 8px', borderRadius: 999,
              display: 'inline-flex', alignItems: 'center',
              fontSize: 11, fontWeight: 500,
              background: "var(--pill-bg)", color: "var(--muted)", border: '1px solid var(--border)',
            }}>#context</span>
          </div>
        </DetailSection>
      </div>
      <BottomNav active="home" />
    </div>
  );
}

Object.assign(window, { ScreenVideoDetail, ScreenSourceDetail, DetailHeader });
