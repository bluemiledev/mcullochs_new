import React, { useState, useMemo } from 'react';
import styles from './MaintenanceDetailView.module.css';

interface Instance {
  time: string;
  value: number;
}

interface MaintenanceDetailViewProps {
  isOpen: boolean;
  onClose: () => void;
  outputName: string;
  instances?: Instance[];
}

const ITEMS_PER_PAGE = 25;

const MaintenanceDetailView: React.FC<MaintenanceDetailViewProps> = ({
  isOpen,
  onClose,
  outputName,
  instances = []
}) => {
  const [currentPage, setCurrentPage] = useState(1);

  // Reset to page 1 when output name changes
  React.useEffect(() => {
    setCurrentPage(1);
  }, [outputName]);

  // Calculate statistics
  const stats = useMemo(() => {
    const total = instances.length;
    // Criteria: value > 380 means "Meets Criteria", <= 380 means "Falls Criteria"
    // This threshold can be customized based on actual criteria or API response
    const meetsCriteria = instances.filter(inst => inst.value > 380).length;
    const fallsCriteria = total - meetsCriteria;
    
    return { total, meetsCriteria, fallsCriteria };
  }, [instances]);

  // Pagination
  const totalPages = Math.ceil(instances.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedInstances = instances.slice(startIndex, endIndex);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <button className={styles.backButton} onClick={onClose}>
            Back
          </button>
          <h1 className={styles.title}>{outputName}</h1>
        </div>

        {/* Summary Boxes */}
        <div className={styles.summaryContainer}>
          <div className={styles.summaryBox}>
            <div className={styles.summaryLabel}>Total Record Count</div>
            <div className={styles.summaryValue}>{stats.total}</div>
          </div>
          <div className={`${styles.summaryBox} ${styles.summaryBoxHighlight}`}>
            <div className={styles.summaryLabel}>Meets Criteria</div>
            <div className={styles.summaryValue}>{stats.meetsCriteria}</div>
          </div>
          <div className={styles.summaryBox}>
            <div className={styles.summaryLabel}>Fails Criteria</div>
            <div className={styles.summaryValue}>{stats.fallsCriteria}</div>
          </div>
        </div>

        {/* Table */}
        <div className={styles.tableContainer}>
          <table className={styles.dataTable}>
            <thead>
              <tr>
                <th className={styles.timeHeader}>Time of Instance</th>
                <th className={styles.valueHeader}>Value of Instance</th>
              </tr>
            </thead>
            <tbody>
              {paginatedInstances.length > 0 ? (
                paginatedInstances.map((instance, index) => (
                  <tr key={index}>
                    <td className={styles.timeCell}>{instance.time}</td>
                    <td className={styles.valueCell}>{instance.value}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={2} className={styles.noData}>
                    No data available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className={styles.pagination}>
            <button
              className={styles.paginationButton}
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
            >
              ‹
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <button
                key={page}
                className={`${styles.paginationButton} ${styles.paginationNumber} ${
                  currentPage === page ? styles.paginationActive : ''
                }`}
                onClick={() => handlePageChange(page)}
              >
                {page}
              </button>
            ))}
            <button
              className={styles.paginationButton}
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              ›
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default MaintenanceDetailView;

