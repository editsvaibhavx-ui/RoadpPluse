import React from 'react';

const SeverityBadge = ({ severity = 'MEDIUM' }) => {
  const sev = (severity || 'MEDIUM').toUpperCase();
  const badgeClass = `badge badge-${sev.toLowerCase()}`;

  const dotColors = {
    CRITICAL: '#ef4444',
    HIGH: '#f59e0b',
    MEDIUM: '#3b82f6',
    LOW: '#10b981',
  };

  return (
    <span className={badgeClass}>
      <span
        style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          backgroundColor: dotColors[sev] || '#94a3b8',
          display: 'inline-block',
        }}
      />
      {sev}
    </span>
  );
};

export default SeverityBadge;
