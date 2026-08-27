import { useEffect, useState, type FC, type KeyboardEvent } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronLeft,
  faChevronRight,
  faAnglesLeft,
  faAnglesRight,
} from "@fortawesome/free-solid-svg-icons";

interface PaginationBaseProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  disabled?: boolean;
  className?: string;
}

interface FullPaginationProps extends PaginationBaseProps {
  variant: "full";
}

interface NumberedPaginationProps extends PaginationBaseProps {
  variant: "numbered";
  maxVisible?: number;
}

type PaginationProps = FullPaginationProps | NumberedPaginationProps;

const btnBase =
  "inline-flex items-center justify-center text-white rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-800 disabled:opacity-50";
const navBtn = `${btnBase} w-9 h-9 bg-gray-700 hover:bg-gray-600`;
const textNavBtn = `${btnBase} px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-sm`;

const Pagination: FC<PaginationProps> = (props) => {
  const { page, totalPages, onChange, disabled = false, className = "", variant } = props;

  if (totalPages <= 1) return null;

  if (variant === "full") {
    return (
      <FullPagination
        page={page}
        totalPages={totalPages}
        onChange={onChange}
        disabled={disabled}
        className={className}
      />
    );
  }

  const maxVisible = props.maxVisible ?? 5;
  return (
    <NumberedPagination
      page={page}
      totalPages={totalPages}
      onChange={onChange}
      disabled={disabled}
      className={className}
      maxVisible={maxVisible}
    />
  );
};

const FullPagination: FC<{
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
  disabled: boolean;
  className: string;
}> = ({ page, totalPages, onChange, disabled, className }) => {
  const [jumpValue, setJumpValue] = useState(String(page));

  useEffect(() => {
    setJumpValue(String(page));
  }, [page]);

  const handleJump = () => {
    const num = parseInt(jumpValue, 10);
    if (!isNaN(num) && num >= 1 && num <= totalPages && num !== page) {
      onChange(num);
    } else {
      setJumpValue(String(page));
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleJump();
  };

  return (
    <div className={`flex items-center justify-center gap-2 mt-4 mb-8 flex-wrap ${className}`}>
      <button
        type="button"
        className={navBtn}
        disabled={page <= 1 || disabled}
        onClick={() => onChange(1)}
        title="First page"
        aria-label="First page"
      >
        <FontAwesomeIcon icon={faAnglesLeft} />
      </button>
      <button
        type="button"
        className={navBtn}
        disabled={page <= 1 || disabled}
        onClick={() => onChange(page - 1)}
        title="Previous page"
        aria-label="Previous page"
      >
        <FontAwesomeIcon icon={faChevronLeft} />
      </button>

      <div className="flex items-center gap-1 text-sm text-gray-400">
        <input
          type="number"
          min={1}
          max={totalPages}
          value={jumpValue}
          onChange={(e) => setJumpValue(e.target.value)}
          onBlur={handleJump}
          onKeyDown={handleKeyDown}
          className="w-14 h-9 text-center bg-gray-800 border border-neutral-600 rounded text-white focus:outline-none focus:border-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          disabled={disabled}
          aria-label="Page number"
        />
        <span>of {totalPages}</span>
      </div>

      <button
        type="button"
        className={navBtn}
        disabled={page >= totalPages || disabled}
        onClick={() => onChange(page + 1)}
        title="Next page"
        aria-label="Next page"
      >
        <FontAwesomeIcon icon={faChevronRight} />
      </button>
      <button
        type="button"
        className={navBtn}
        disabled={page >= totalPages || disabled}
        onClick={() => onChange(totalPages)}
        title="Last page"
        aria-label="Last page"
      >
        <FontAwesomeIcon icon={faAnglesRight} />
      </button>
    </div>
  );
};

const NumberedPagination: FC<{
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
  disabled: boolean;
  className: string;
  maxVisible: number;
}> = ({ page, totalPages, onChange, disabled, className, maxVisible }) => {
  const pageNumbers = (() => {
    if (totalPages <= maxVisible) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const half = Math.floor(maxVisible / 2);
    let start = Math.max(1, page - half);
    const end = Math.min(totalPages, start + maxVisible - 1);
    if (end - start + 1 < maxVisible) start = Math.max(1, end - maxVisible + 1);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  })();

  return (
    <nav
      aria-label="Pagination"
      className={`flex justify-center items-center gap-2 mt-8 ${className}`}
    >
      <button
        type="button"
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page === 1 || disabled}
        aria-label="Previous page"
        className={textNavBtn}
      >
        Previous
      </button>
      {pageNumbers.map((num) => (
        <button
          type="button"
          key={num}
          onClick={() => onChange(num)}
          disabled={disabled}
          aria-label={`Page ${num}`}
          aria-current={num === page ? "page" : undefined}
          className={`px-3 py-1.5 rounded text-sm transition-colors ${
            num === page ? "bg-blue-600 text-white" : "bg-gray-700 hover:bg-gray-600 text-white"
          }`}
        >
          {num}
        </button>
      ))}
      <button
        type="button"
        onClick={() => onChange(Math.min(totalPages, page + 1))}
        disabled={page === totalPages || disabled}
        aria-label="Next page"
        className={textNavBtn}
      >
        Next
      </button>
    </nav>
  );
};

export default Pagination;
