import React from 'react';

const StatCard = ({ title, value, icon: Icon, change, color = '#06b6d4', subtitle }) => {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: '-15px', right: '-15px', width: '80px', height: '80px', borderRadius: '50%', background: `${color}15`, pointerEvents: 'none' }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>{title}</span>
        {Icon && (
          <div style={{ padding: '0.45rem', borderRadius: '8px', background: `${color}20`, color: color, display: 'flex' }}>
            <Icon size={18} />
          </div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', marginTop: '0.25rem' }}>
        <span style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.02em' }}>
          {value}
        </span>
        {change && (
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: change.startsWith('+') ? '#10b981' : '#f59e0b' }}>
            {change}
          </span>
        )}
      </div>
      {subtitle && (
        <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
          {subtitle}
        </span>
      )}
    </div>
  );
};

export default StatCard;
