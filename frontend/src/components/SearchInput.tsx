import { useId, type FC } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSearch } from "@fortawesome/free-solid-svg-icons";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  label?: string;
  description?: string;
}

const SearchInput: FC<SearchInputProps> = ({
  value,
  onChange,
  placeholder = "Search...",
  className = "",
  label,
  description,
}) => {
  const inputId = useId();
  const descriptionId = useId();

  return (
    <div className={`relative ${className}`}>
      {label && (
        <label htmlFor={inputId} className="sr-only">
          {label}
        </label>
      )}
      <div className="flex absolute inset-y-0 left-0 items-center pl-3 pointer-events-none">
        <FontAwesomeIcon icon={faSearch} className="text-gray-400" aria-hidden="true" />
      </div>
      <input
        id={inputId}
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border rounded text-sm block w-full pl-10 p-2.5 bg-gray-700 border-gray-700 placeholder-gray-400 text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        aria-describedby={description ? descriptionId : undefined}
      />
      {description && (
        <div id={descriptionId} className="sr-only">
          {description}
        </div>
      )}
    </div>
  );
};

export default SearchInput;
