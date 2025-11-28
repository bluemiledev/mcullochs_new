import React from 'react';
import styles from './McCullochsLogo.module.css';

const McCullochsLogo: React.FC = () => {
  return (
    <div className={styles.logoContainer}>
      <div className={styles.logoEmblem}>
        <svg
          width="50"
          height="50"
          viewBox="0 0 50 50"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Oval/circular outline */}
          <ellipse cx="25" cy="25" rx="22" ry="20" fill="#DC2626" stroke="#DC2626" strokeWidth="1.5" />
          {/* Stylized M letter */}
          <path
            d="M 15 35 L 15 20 L 20 20 L 25 28 L 30 20 L 35 20 L 35 35 L 30 35 L 30 25 L 25 32 L 20 25 L 20 35 Z"
            fill="#FFFFFF"
          />
        </svg>
      </div>
      <div className={styles.logoText}>
        <div className={styles.companyName}>McCULLOCHS</div>
        <div className={styles.tagline}>HYDRAULIC ENGINEERS</div>
        <div className={styles.established}>Est. 1945</div>
      </div>
    </div>
  );
};

export default McCullochsLogo;
export {};
