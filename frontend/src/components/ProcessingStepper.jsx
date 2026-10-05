import React from 'react';
import { CheckCircle2, Loader2, Circle, AlertCircle, RefreshCw } from 'lucide-react';

const steps = [
  { id: 1, label: 'Video Uploaded', desc: 'Smartphone video received & validated' },
  { id: 2, label: 'Extracting Frames', desc: 'Sampling frames via OpenCV' },
  { id: 3, label: 'Attaching GPS', desc: 'Correlating timestamps to coordinates' },
  { id: 4, label: 'AI Detection', desc: 'Hazard bounding boxes & dimension scale' },
  { id: 5, label: 'ST-DBSCAN Deduplication', desc: 'Spatio-temporal clustering & incidents' },
];

const ProcessingStepper = ({
  currentStep = 1,
  isProcessing = false,
  error = null,
  stepStatus = null, // optional { 1: 'completed', 5: 'running', ... }
  stepMessage = null,
  onRetry = null,
}) => {
  return (
    <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.25rem 1.5rem', margin: '1rem 0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative', marginBottom: '1rem' }}>
        {steps.map((step) => {
          let status = 'pending';

          if (stepStatus && stepStatus[step.id]) {
            status = stepStatus[step.id];
          } else {
            if (currentStep > step.id) {
              status = 'completed';
            } else if (currentStep === step.id) {
              if (error) {
                status = 'failed';
              } else if (isProcessing) {
                status = 'running';
              } else {
                status = 'completed';
              }
            } else {
              status = 'pending';
            }
          }

          const isCompleted = status === 'completed';
          const isRunning = status === 'running';
          const isFailed = status === 'failed';

          return (
            <div key={step.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, position: 'relative', zIndex: 1 }}>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: isCompleted ? '#059669' : isRunning ? '#0284c7' : isFailed ? '#dc2626' : '#f1f5f9',
                  color: isCompleted || isRunning || isFailed ? '#ffffff' : '#64748b',
                  boxShadow: isRunning ? '0 0 16px rgba(2, 132, 199, 0.4)' : isCompleted ? '0 0 10px rgba(5, 150, 105, 0.25)' : 'none',
                  transition: 'all 0.3s ease',
                  border: isRunning ? '2px solid #0284c7' : isFailed ? '2px solid #dc2626' : isCompleted ? 'none' : '1px solid #cbd5e1',
                }}
              >
                {isCompleted ? (
                  <CheckCircle2 size={20} />
                ) : isRunning ? (
                  <Loader2 size={20} className="animate-spin" />
                ) : isFailed ? (
                  <AlertCircle size={20} />
                ) : (
                  <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>{step.id}</span>
                )}
              </div>
              <span
                style={{
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  marginTop: '0.5rem',
                  color: isCompleted ? '#059669' : isRunning ? '#0284c7' : isFailed ? '#dc2626' : '#64748b',
                  textAlign: 'center',
                }}
              >
                {step.label}
              </span>
              <span style={{ fontSize: '0.7rem', color: '#64748b', textAlign: 'center', marginTop: '0.15rem', maxWidth: '140px' }}>
                {isRunning ? (step.id === 5 ? 'Running ST-DBSCAN clustering...' : 'Processing...') : step.desc}
              </span>
            </div>
          );
        })}
      </div>

      {/* Dynamic Step Status Message */}
      {stepMessage && (
        <div style={{ textAlign: 'center', fontSize: '0.85rem', color: '#0284c7', fontWeight: 600, marginTop: '0.5rem' }}>
          {stepMessage}
        </div>
      )}

      {/* Error & Retry Banner */}
      {error && (
        <div
          style={{
            background: '#fee2e2',
            border: '1px solid #f87171',
            borderRadius: '8px',
            padding: '0.75rem 1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            color: '#b91c1c',
            marginTop: '0.75rem',
            flexWrap: 'wrap',
            gap: '0.5rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <AlertCircle size={18} />
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{error}</span>
          </div>
          {onRetry && (
            <button
              onClick={onRetry}
              className="btn btn-secondary"
              style={{ padding: '0.3rem 0.75rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
            >
              <RefreshCw size={13} /> Retry
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default ProcessingStepper;
