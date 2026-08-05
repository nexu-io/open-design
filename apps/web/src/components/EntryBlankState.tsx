import { Icon } from './Icon';

interface Props {
  heading: string;
  description: string;
  actionLabel: string;
  onCreate: () => void;
}

export function EntryBlankState({
  heading,
  description,
  actionLabel,
  onCreate,
}: Props) {
  return (
    <div className="entry-section">
      <header className="entry-section__head">
        <h1 className="entry-section__title">{heading}</h1>
      </header>
      <div className="entry-blank">
        <img className="entry-blank__mark" src="/drafts-empty-mark.png?v=2" alt="" aria-hidden />
        <p className="entry-blank__desc">{description}</p>
        <button type="button" className="entry-blank__cta" onClick={onCreate}>
          <Icon name="plus" size={15} /> {actionLabel}
        </button>
      </div>
    </div>
  );
}
