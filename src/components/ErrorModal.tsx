import React from 'react';
import styles from './ErrorModal.module.css';

interface ErrorModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  message: string;
  details?: string;
  endpoint?: string;
  showRefresh?: boolean;
}

const ErrorModal: React.FC<ErrorModalProps> = ({
  isOpen,
  onClose,
  title = 'Error',
  message,
  details,
  endpoint,
  showRefresh = false
}) => {
  if (!isOpen) return null;

  const handleRefresh = () => {
    window.location.reload();
  };

  const hasDetails = Boolean(details) || Boolean(endpoint);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.iconContainer}>
            <svg
              className={styles.icon}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h2 className={styles.title}>{title}</h2>
        </div>

        <div className={styles.content}>
          <p className={styles.message}>{message}</p>

          {hasDetails && (
            <>
              {endpoint && (
                <div className={styles.detailSection}>
                  <div className={styles.detailLabel}>Endpoint:</div>
                  <div className={styles.detailValue}>{endpoint}</div>
                </div>
              )}

              {details && (
                <div className={styles.detailSection}>
                  <div className={styles.detailLabel}>Details:</div>
                  <div className={styles.detailValue}>{details}</div>
                </div>
              )}

              <div className={styles.troubleshooting}>
                <div className={styles.troubleshootingTitle}>Troubleshooting:</div>
                <ul className={styles.troubleshootingList}>
                  <li>Check browser console (F12) for detailed error</li>
                  <li>Check Network tab to see if request was blocked</li>
                  <li>Restart dev server (npm start) - proxy needs restart to take effect</li>
                  <li>Verify the API endpoint is accessible</li>
                </ul>
              </div>
            </>
          )}
        </div>

        <div className={styles.footer}>
          {showRefresh && (
            <button className={styles.button} onClick={handleRefresh}>
              Refresh Page
            </button>
          )}
          {!showRefresh && (
            <button className={styles.button} onClick={onClose}>
              OK
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ErrorModal;

