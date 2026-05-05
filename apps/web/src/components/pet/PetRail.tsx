import { useEffect, useState } from 'react';
import { useT } from '../../i18n';
import { Icon } from '../Icon';
import type { AppConfig, PetConfig } from '../../types';
import { DEFAULT_PET } from '../../state/config';
import { BUILT_IN_PETS, CUSTOM_PET_ID, defaultCustomPet, resolveActivePet } from './pets';
import { PetSpriteFace } from './PetSpriteFace';

interface Props {
  config: AppConfig;
  // Adopt + wake a built-in or the user's custom pet inline. The rail
  // wires this to the saved config so picks survive across reloads
  // without bouncing the user into Settings for the common case.
  onAdoptInline: (petId: string) => void;
  // Open Settings → Pets so the user can tweak the custom pet, change
  // accent, or read the catalog flavor copy.
  onOpenPetSettings: () => void;
  // Tuck the live overlay without changing the active pet id.
  onTuck: () => void;
  // Optional "remove the rail entirely" action. When provided, the
  // header gets a × button that hides the rail from the layout (the
  // user re-summons it from the avatar dropdown). Distinct from the
  // existing collapse toggle, which only narrows the column.
  onHide?: () => void;
}

const COLLAPSED_KEY = 'open-design:pet-rail-collapsed';

function loadCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

// Vertical pet column rendered to the right of the entry view's main
// content. Doubles as a discovery surface (un-adopted users see the
// full catalog inline) and a switcher (adopted users tap to swap).
export function PetRail({ config, onAdoptInline, onOpenPetSettings, onTuck, onHide }: Props) {
  const t = useT();
  const [collapsed, setCollapsed] = useState<boolean>(() => loadCollapsed());
  const pet: PetConfig = config.pet ?? { ...DEFAULT_PET, custom: defaultCustomPet() };

  useEffect(() => {
    try {
      window.localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  const activeId = pet.adopted ? pet.petId : null;

  if (collapsed) {
    return (
      <aside className="pet-rail collapsed" aria-label={t('pet.railAria')}>
        <button
          type="button"
          className="pet-rail-toggle"
          onClick={() => setCollapsed(false)}
          title={t('pet.railExpand')}
          aria-label={t('pet.railExpand')}
        >
          <span className="pet-rail-toggle-glyph" aria-hidden>🐾</span>
          <Icon name="chevron-left" size={14} />
        </button>
      </aside>
    );
  }

  return (
    <aside className="pet-rail" aria-label={t('pet.railAria')}>
      <header className="pet-rail-head">
        <div className="pet-rail-title">
          <span aria-hidden>🐾</span>
          <strong>{t('pet.railTitle')}</strong>
        </div>
        <div className="pet-rail-head-actions">
          <button
            type="button"
            className="pet-rail-collapse"
            onClick={() => setCollapsed(true)}
            title={t('pet.railCollapse')}
            aria-label={t('pet.railCollapse')}
          >
            <Icon name="chevron-right" size={14} />
          </button>
          {onHide ? (
            <button
              type="button"
              className="pet-rail-collapse"
              onClick={onHide}
              title={t('pet.railHide')}
              aria-label={t('pet.railHide')}
            >
              <Icon name="close" size={14} />
            </button>
          ) : null}
        </div>
      </header>
      <p className="pet-rail-hint">{t('pet.railHint')}</p>
      <div className="pet-rail-status">
        {pet.adopted ? (
          <button
            type="button"
            className="pet-rail-status-pill"
            onClick={onTuck}
            title={pet.enabled ? t('pet.tuckTitle') : t('pet.wakeTitle')}
          >
            <Icon name={pet.enabled ? 'eye' : 'sparkles'} size={12} />
            <span>{pet.enabled ? t('pet.tuck') : t('pet.wake')}</span>
          </button>
        ) : (
          <span className="pet-rail-fresh">{t('pet.adoptCallout')}</span>
        )}
      </div>
      <div className="pet-rail-list">
        {BUILT_IN_PETS.map((p) => {
          const active = activeId === p.id;
          return (
            <button
              type="button"
              key={p.id}
              className={`pet-rail-item${active ? ' active' : ''}`}
              onClick={() => onAdoptInline(p.id)}
              aria-pressed={active}
              style={{ ['--pet-accent' as string]: p.accent }}
              title={p.flavor}
            >
              <span className="pet-rail-item-glyph" aria-hidden>{p.glyph}</span>
              <span className="pet-rail-item-meta">
                <span className="pet-rail-item-name">{p.name}</span>
                <span className="pet-rail-item-flavor">{p.flavor}</span>
              </span>
              {active ? (
                <Icon name="check" size={14} aria-hidden />
              ) : null}
            </button>
          );
        })}
        <button
          type="button"
          className={`pet-rail-item custom${activeId === CUSTOM_PET_ID ? ' active' : ''}`}
          onClick={() => onAdoptInline(CUSTOM_PET_ID)}
          style={{ ['--pet-accent' as string]: pet.custom.accent }}
        >
          <span className="pet-rail-item-glyph" aria-hidden>
            <PetSpriteFace
              active={
                resolveActivePet({ ...pet, adopted: true, petId: CUSTOM_PET_ID })!
              }
              size={28}
            />
          </span>
          <span className="pet-rail-item-meta">
            <span className="pet-rail-item-name">
              {pet.custom.name || t('pet.useCustom')}
            </span>
            <span className="pet-rail-item-flavor">{t('pet.railCustomFlavor')}</span>
          </span>
          {activeId === CUSTOM_PET_ID ? (
            <Icon name="check" size={14} aria-hidden />
          ) : null}
        </button>
      </div>
      <button
        type="button"
        className="pet-rail-customize"
        onClick={onOpenPetSettings}
      >
        <Icon name="sparkles" size={12} />
        <span>{t('pet.railCustomize')}</span>
      </button>
    </aside>
  );
}
