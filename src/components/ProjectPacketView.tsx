import type { Project, ProjectFile } from '../types';
import { Icon } from './Icon';

interface Props {
  project: Project;
  files: ProjectFile[];
  onOpenFile: (name: string) => void;
}

const WEBSITE_PACKET_FILES: Array<{ name: string; group: string }> = [
  { name: 'site_plan.md', group: 'Plan' },
  { name: 'section_library.md', group: 'Plan' },
  { name: 'design_tokens.md', group: 'Design' },
  { name: 'DESIGN.md', group: 'Design' },
  { name: 'evidence_inventory.md', group: 'Evidence' },
  { name: 'opportunity_packet.md', group: 'Evidence' },
  { name: 'codex_build_brief.md', group: 'Build' },
  { name: 'responsive_qa.md', group: 'QA' },
  { name: 'adapter_execution.md', group: 'Adapter' },
  { name: 'packet_review.md', group: 'Review' },
];

export function ProjectPacketView({ project, files, onOpenFile }: Props) {
  const websiteStudio = project.metadata?.websiteStudio;
  if (!websiteStudio) return null;

  const filesByName = new Map(files.map((file) => [file.name, file]));
  const statuses = websiteStudio.qualityReviews.reduce(
    (counts, gate) => ({
      ...counts,
      [gate.status]: (counts[gate.status] ?? 0) + 1,
    }),
    {} as Record<string, number>,
  );
  const evidence = websiteStudio.evidenceStudio;
  const readyArtifacts = WEBSITE_PACKET_FILES.filter(({ name }) => filesByName.has(name)).length;
  const blockedGates = statuses.blocked ?? 0;
  const needsReviewGates = statuses['needs-review'] ?? 0;
  const packetUpdatedAt = websiteStudio.updatedAt ?? project.updatedAt;

  return (
    <section className="project-packet" aria-label="Project packet">
      <div className="project-packet-head">
        <span>
          <Icon name="file-code" size={13} />
          Project Packet
        </span>
        <strong>{websiteStudio.adapterStatus}</strong>
      </div>
      <div className="project-packet-summary" aria-label="Project packet readiness summary">
        <span>artifacts <strong>{readyArtifacts}/{WEBSITE_PACKET_FILES.length}</strong></span>
        <span>blocked <strong>{blockedGates}</strong></span>
        <span>review <strong>{needsReviewGates}</strong></span>
        <span>pins <strong>{websiteStudio.pins.length}</strong></span>
        <span>evidence <strong>{evidence.files?.length ?? 0}</strong></span>
      </div>
      <div className="project-packet-grid">
        <article>
          <h3>Artifacts on disk</h3>
          <div className="project-packet-files">
            {WEBSITE_PACKET_FILES.map(({ name, group }) => {
              const file = filesByName.get(name);
              return (
                <button
                  key={name}
                  type="button"
                  disabled={!file}
                  onClick={() => file && onOpenFile(file.name)}
                >
                  <span>{name}</span>
                  <small>{file ? group : 'pending'}</small>
                </button>
              );
            })}
          </div>
        </article>

        <article>
          <h3>Quality gates</h3>
          <div className="project-packet-counts">
            <span>pass <strong>{statuses.pass ?? 0}</strong></span>
            <span>needs review <strong>{statuses['needs-review'] ?? 0}</strong></span>
            <span>blocked <strong>{statuses.blocked ?? 0}</strong></span>
          </div>
          <ul>
            {websiteStudio.qualityReviews.slice(0, 4).map((gate) => (
              <li key={gate.id}>
                <strong>{gate.title}</strong>
                <span>{gate.status}</span>
              </li>
            ))}
          </ul>
        </article>

        <article>
          <h3>Pins and comments</h3>
          {websiteStudio.pins.length ? (
            <ul>
              {websiteStudio.pins.slice(0, 6).map((pin) => (
                <li key={pin.id}>
                  <strong>{pin.target}</strong>
                  <span>{pin.note}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p>No comments or pins recorded.</p>
          )}
        </article>

        <article>
          <h3>Codex handoff</h3>
          <div className="project-packet-files">
            {['codex_build_brief.md', 'adapter_execution.md', 'packet_review.md'].map((name) => {
              const file = filesByName.get(name);
              return (
                <button
                  key={name}
                  type="button"
                  disabled={!file}
                  onClick={() => file && onOpenFile(file.name)}
                >
                  <span>{name}</span>
                  <small>{file ? 'open' : 'pending'}</small>
                </button>
              );
            })}
          </div>
          <ul>
            <li>
              <strong>typecheck</strong>
              <span>required</span>
            </li>
            <li>
              <strong>test</strong>
              <span>required</span>
            </li>
            <li>
              <strong>build</strong>
              <span>required</span>
            </li>
          </ul>
        </article>

        <article>
          <h3>Packet history</h3>
          <ul>
            <li>
              <strong>Project created</strong>
              <span>{formatPacketDate(project.createdAt)}</span>
            </li>
            <li>
              <strong>Project updated</strong>
              <span>{formatPacketDate(project.updatedAt)}</span>
            </li>
            <li>
              <strong>Packet updated</strong>
              <span>{formatPacketDate(packetUpdatedAt)}</span>
            </li>
            <li>
              <strong>Evidence scan</strong>
              <span>{evidence.lastScanAt ? formatPacketDate(evidence.lastScanAt) : 'pending'}</span>
            </li>
          </ul>
        </article>

        <article>
          <h3>Evidence files</h3>
          {evidence.files?.length ? (
            <ul>
              {evidence.files.slice(0, 6).map((file) => (
                <li key={`${file.role}-${file.path}`}>
                  <strong>{file.role}</strong>
                  <span>{file.path}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p>No scanned evidence files yet.</p>
          )}
        </article>

        <article>
          <h3>Evidence trail</h3>
          <div className="project-packet-counts">
            <span>originals <strong>{evidence.originals}</strong></span>
            <span>thumbs <strong>{evidence.thumbnails}</strong></span>
            <span>supporting <strong>{evidence.supportingAssets}</strong></span>
            <span>flagged <strong>{evidence.flaggedFiles}</strong></span>
          </div>
          <p>{evidence.sourcePath}</p>
          {evidence.scanError ? <p className="project-packet-risk">{evidence.scanError}</p> : null}
        </article>
      </div>
    </section>
  );
}

function formatPacketDate(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 'pending';
  return new Date(value).toLocaleString();
}
