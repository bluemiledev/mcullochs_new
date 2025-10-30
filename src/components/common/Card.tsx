import React from 'react';
import clsx from 'clsx';
import styles from './Card.module.css';

interface CardProps {
  title?: string;
  value?: string;
  change?: string;
  children?: React.ReactNode;
  className?: string;
}

const Card: React.FC<CardProps> = ({ 
  title, 
  value, 
  change, 
  children, 
  className 
}) => {
  return (
    <div className={clsx(styles.card, className)}>
      {title && (
        <div className={styles.header}>
          <h3 className={styles.title}>{title}</h3>
          {change && (
            <span className={clsx(styles.change, {
              [styles.positive]: change.startsWith('+'),
              [styles.negative]: change.startsWith('-')
            })}>
              {change}
            </span>
          )}
        </div>
      )}
      
      {value && (
        <div className={styles.value}>{value}</div>
      )}
      
      {children && (
        <div className={styles.content}>{children}</div>
      )}
    </div>
  );
};

export default Card;


