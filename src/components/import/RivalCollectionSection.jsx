import RivalCollectionCard from './RivalCollectionCard';
import useRivalCollection from '../../hooks/useRivalCollection';

/**
 * The hook and the card travel together so the import screen can leave both out.
 * Hooks cannot be called conditionally; rendering this only when
 * ENABLE_RIVAL_COLLECTION is on keeps the status, binding, and registration GETs
 * (and the 5 s polling) from ever starting while the feature is hidden.
 */
export default function RivalCollectionSection() {
  const rivalCollection = useRivalCollection();
  return <RivalCollectionCard {...rivalCollection} />;
}
