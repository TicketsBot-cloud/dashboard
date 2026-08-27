import { createContext, useContext, type FC, type ReactNode, type ThHTMLAttributes } from "react";

type TableVariant = "default" | "compact";

interface TableContextValue {
  variant: TableVariant;
  inHead: boolean;
}

const TableContext = createContext<TableContextValue>({ variant: "default", inHead: false });

const variantStyles = {
  default: {
    wrapper: "relative overflow-x-auto shadow-md sm:rounded-lg",
    table: "w-full text-sm text-left text-white",
    thead: "text-xs uppercase bg-gray-700",
    th: "px-3 sm:px-6 py-3",
    tr: "border-b border-gray-700 hover:bg-gray-600",
    headerTr: "border-b border-gray-700",
    td: "px-3 sm:px-6 py-4",
  },
  compact: {
    wrapper: "overflow-x-auto",
    table: "w-full text-sm text-left",
    thead: "text-xs text-gray-400 uppercase bg-gray-800",
    th: "px-4 py-3",
    tr: "border-b border-gray-700 hover:bg-gray-800/50",
    headerTr: "border-b border-gray-700",
    td: "px-4 py-3",
  },
};

interface TableProps {
  variant?: TableVariant;
  className?: string;
  "aria-label"?: string;
  children: ReactNode;
}

const TableRoot: FC<TableProps> = ({
  variant = "default",
  className = "",
  "aria-label": ariaLabel,
  children,
}) => {
  const styles = variantStyles[variant];
  return (
    <TableContext.Provider value={{ variant, inHead: false }}>
      <div className={`${styles.wrapper} ${className}`}>
        <table className={styles.table} aria-label={ariaLabel}>
          {children}
        </table>
      </div>
    </TableContext.Provider>
  );
};

const Head: FC<{ className?: string; children: ReactNode }> = ({ className = "", children }) => {
  const { variant } = useContext(TableContext);
  const styles = variantStyles[variant];
  return (
    <TableContext.Provider value={{ variant, inHead: true }}>
      <thead className={`${styles.thead} ${className}`}>{children}</thead>
    </TableContext.Provider>
  );
};

const Body: FC<{ className?: string; children: ReactNode }> = ({ className = "", children }) => {
  return <tbody className={className}>{children}</tbody>;
};

interface RowProps {
  className?: string;
  children: ReactNode;
  onClick?: () => void;
}

const Row: FC<RowProps> = ({ className, children, onClick }) => {
  const { variant, inHead } = useContext(TableContext);
  const styles = variantStyles[variant];
  const defaultClass = inHead ? styles.headerTr : styles.tr;
  return (
    <tr className={className !== undefined ? className : defaultClass} onClick={onClick}>
      {children}
    </tr>
  );
};

interface HeaderCellProps extends ThHTMLAttributes<HTMLTableCellElement> {
  className?: string;
  children?: ReactNode;
}

const HeaderCell: FC<HeaderCellProps> = ({ className, children, ...rest }) => {
  const { variant } = useContext(TableContext);
  const styles = variantStyles[variant];
  return (
    <th scope="col" className={className !== undefined ? className : styles.th} {...rest}>
      {children}
    </th>
  );
};

/** The variant's default `<th>` padding, so callers can extend it instead of replacing it. */
export const useHeaderCellClass = () => variantStyles[useContext(TableContext).variant].th;

interface CellProps {
  className?: string;
  children?: ReactNode;
  colSpan?: number;
}

const Cell: FC<CellProps> = ({ className, children, colSpan }) => {
  const { variant } = useContext(TableContext);
  const styles = variantStyles[variant];
  return (
    <td className={className !== undefined ? className : styles.td} colSpan={colSpan}>
      {children}
    </td>
  );
};

/** A `<th scope="row">` cell for row headers, giving each data row a name. */
const RowHeaderCell: FC<CellProps> = ({ className, children, colSpan }) => {
  const { variant } = useContext(TableContext);
  const styles = variantStyles[variant];
  return (
    <th scope="row" className={className !== undefined ? className : styles.td} colSpan={colSpan}>
      {children}
    </th>
  );
};

const Table = Object.assign(TableRoot, {
  Head,
  Body,
  Row,
  HeaderCell,
  Cell,
  RowHeaderCell,
});

export default Table;
