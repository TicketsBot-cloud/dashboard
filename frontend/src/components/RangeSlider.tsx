import * as RadixSlider from "@radix-ui/react-slider";
import type { FC } from "react";

interface RangeSliderProps {
  label: string;
  min: number;
  max: number;
  value: [number, number];
  onChange: (value: [number, number]) => void;
  minLabel?: string;
  maxLabel?: string;
}

const RangeSlider: FC<RangeSliderProps> = ({
  label,
  min,
  max,
  value,
  onChange,
  minLabel = "Min",
  maxLabel = "Max",
}) => {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-white">{label}</span>
        <div className="flex items-center gap-3 text-sm text-gray-400">
          <span>
            {minLabel}: <span className="text-white">{value[0]}</span>
          </span>
          <span>
            {maxLabel}: <span className="text-white">{value[1]}</span>
          </span>
        </div>
      </div>

      <RadixSlider.Root
        className="relative flex items-center select-none touch-none w-full h-5"
        min={min}
        max={max}
        step={1}
        minStepsBetweenThumbs={1}
        value={value}
        onValueChange={(val) => onChange(val as [number, number])}
      >
        <RadixSlider.Track className="relative grow rounded-full h-1.5 bg-gray-600">
          <RadixSlider.Range className="absolute rounded-full h-full bg-blue-600" />
        </RadixSlider.Track>

        <RadixSlider.Thumb
          className="block w-4 h-4 rounded-full bg-blue-600 shadow-md border-2 border-white cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-700 transition-transform hover:scale-110"
          aria-label={minLabel}
          aria-valuetext={`${minLabel}: ${value[0]}`}
        />
        <RadixSlider.Thumb
          className="block w-4 h-4 rounded-full bg-blue-600 shadow-md border-2 border-white cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-700 transition-transform hover:scale-110"
          aria-label={maxLabel}
          aria-valuetext={`${maxLabel}: ${value[1]}`}
        />
      </RadixSlider.Root>

      <div className="flex justify-between text-xs text-gray-500">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
};

export default RangeSlider;
