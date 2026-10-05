import React from 'react';

const StatusBadge = ({ status = 'NEW' }) => {
  const normStatus = (status || 'NEW').toUpperCase().replace(' ', '_');
  const className = `badge status-${normStatus.toLowerCase()}`;

  const labels = {
    NEW: 'NEW',
    VERIFIED: 'VERIFIED',
    ASSIGNED: 'ASSIGNED',
    IN_PROGRESS: 'IN PROGRESS',
    RESOLVED: 'RESOLVED',
    CLOSED: 'CLOSED',
  };

  return (
    <span className={className}>
      {labels[normStatus] || normStatus}
    </span>
  );
};

export default StatusBadge;
