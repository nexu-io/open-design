import { createContext, useContext } from 'react';

/** A mounted Viewer may be hidden while its saved editor state stays alive. */
export const ArtifactViewActive = createContext(true);
export const useArtifactViewActive = () => useContext(ArtifactViewActive);
