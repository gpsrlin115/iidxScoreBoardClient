import React from 'react';
import DroppableTierRow from './DroppableTierRow';

const UnassignedPool = ({ unassignedSongs }) => {
  return (
    <div className="bg-gray-850 p-4 rounded-xl border border-gray-700 shadow-lg mb-6">
      <DroppableTierRow 
        id="unassigned" 
        title="Unassigned Pool" 
        items={unassignedSongs} 
        isPool={true} 
      />
    </div>
  );
};

export default UnassignedPool;
