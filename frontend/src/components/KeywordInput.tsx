import type { FC, KeyboardEvent } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTimes } from "@fortawesome/free-solid-svg-icons";
import Button from "@/components/Button";

interface KeywordInputProps {
  label: string;
  keywords: string[];
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onBlur: () => void;
  onRemove: (keyword: string) => void;
  placeholder?: string;
}

const KeywordInput: FC<KeywordInputProps> = ({
  label,
  keywords,
  value,
  onChange,
  onKeyDown,
  onBlur,
  onRemove,
  placeholder = "Type and press Enter or comma to add",
}) => {
  return (
    <div className="flex flex-col">
      <label htmlFor="keywords-input" className="mb-1 text-white">
        {label}
      </label>
      <div className="flex flex-wrap items-center gap-1 bg-gray-700 border border-neutral-600 rounded px-2 py-1.5 min-h-10.5">
        {keywords.map((keyword) => (
          <span
            key={keyword}
            className="inline-flex items-center bg-blue-900/40 text-blue-300 text-xs px-2 py-1 rounded gap-1"
          >
            {keyword}
            <Button
              variant="ghost"
              size="icon"
              type="button"
              onClick={() => onRemove(keyword)}
              className="text-blue-300 hover:text-white ml-0.5 p-0"
              aria-label={`Remove keyword ${keyword}`}
              title={`Remove keyword ${keyword}`}
            >
              <FontAwesomeIcon icon={faTimes} className="text-[10px]" aria-hidden="true" />
            </Button>
          </span>
        ))}
        <input
          id="keywords-input"
          type="text"
          className="flex-1 bg-transparent text-white focus:outline-none p-1 min-w-30"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
          placeholder={keywords.length === 0 ? placeholder : ""}
        />
      </div>
      <span className="text-xs text-gray-400 mt-1">
        Separate keywords with commas or press Enter
      </span>
    </div>
  );
};

export default KeywordInput;
