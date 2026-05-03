import type { Project, ProjectFile } from '../types';
import { Icon } from './Icon';

interface Props {
  project: Project;
  files: ProjectFile[];
  onOpenFile: (name: string) => void;
}

const WEBSITE_PACKET_FILES = [
  'site_plan.md',
  'section_library.md',
  'design_tokens.md',
  'codex_build_brief.md',
  'responsive_qa.md',
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

  return (
    <section className="project-packet" aria-label="Project packet">
      <div className="project-packet-head">
        <span>
          <Icon name="file-code" size={13} />
          Project Packet
        </span>
        <strong>{websiteStudio.adapterStatus}</strong>
      </div>
      <div className="project-packet-grid">
        <article>
          <h3>Artifacts on disk</h3>
          <div className="project-packet-files">
            {WEBSITE_PACKET_FILES.map((name) => {
              const file = filesByName.get(name);
              return (
                <button
                  key={name}
                  type="button"
                  disabled={!file}
                  onClick={() => file && onOpenFile(file.name)}
                >
                  <span>{name}</span>
                  <small>{file ? 'ready' : 'pending'}</small>
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
          <ul>
            {websiteStudio.pins.slice(0, 5).map((pin) => (
              <li key={pin.id}>
                <strong>{pin.target}</strong>
                <span>{pin.note}</span>
              </li>
            ))}
          </ul>
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
