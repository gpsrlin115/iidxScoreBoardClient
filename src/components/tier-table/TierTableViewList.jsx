import React from 'react';
import useTierStore from '../../store/tierStore';
import TierGroup from './TierGroup';

/**
 * List View Mode
 * Renders tiers as vertically stacked accordions
 */
const TierTableViewList = () => {
  const { enrichedTierData } = useTierStore();

  return (
    <div className="space-y-4 pb-8 flex flex-col gap-1">
      {enrichedTierData.map((tierObj) => (
        <TierGroup key={tierObj.tier} tierData={tierObj} />
      ))}
    </div>
  );
};

export default TierTableViewList;
