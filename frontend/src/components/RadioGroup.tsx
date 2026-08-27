import { useId, type FC } from "react";

interface RadioOption {
  key: string;
  label: string;
}

interface RadioGroupProps {
  options: RadioOption[];
  value: string;
  onChange: (key: string) => void;
  label?: string;
  className?: string;
}

const RadioGroup: FC<RadioGroupProps> = ({ options, value, onChange, label, className = "" }) => {
  const groupId = useId();

  return (
    <fieldset className={className} aria-label={label ? undefined : "Options"}>
      {label && <legend className="mb-2 text-sm font-medium text-white">{label}</legend>}
      <div className="flex flex-col gap-2">
        {options.map((option) => {
          const optionId = `${groupId}-${option.key}`;
          return (
            <label
              key={option.key}
              htmlFor={optionId}
              className="inline-flex items-center gap-2 cursor-pointer text-sm text-white"
            >
              <input
                id={optionId}
                type="radio"
                name={groupId}
                checked={value === option.key}
                onChange={() => onChange(option.key)}
                className="border-gray-500 bg-gray-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
              />
              {option.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
};

export default RadioGroup;
