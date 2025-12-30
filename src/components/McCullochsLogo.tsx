import React from 'react';
import styles from './McCullochsLogo.module.css';
import logoImage from '../assests/Mclogo.webp';

const McCullochsLogo: React.FC = () => {
  return (
    <div className={styles.logoContainer}>
      <img 
        src={logoImage} 
        alt="McCullochs Logo" 
        className={styles.logoImage}
      />
    </div>
  );
};

export default McCullochsLogo;
export {};
