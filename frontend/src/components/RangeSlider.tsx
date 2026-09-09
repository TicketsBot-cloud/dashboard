import * as RadixSlider from "@radix-ui/react-slider";
import { useId, useState } from "react";
import type { FC } from "react";
import NumberInput from "./NumberInput";

interface RangeSliderProps {
  label: string;
  min: number;
  max: number;
  value: [number, number];
  onChange: (value: [number, number]) => void;
  minLabel?: string;
  maxLabel?: string;
  maxFloor?: number;
}

const THUMB_CLASS =
  "relative block w-4 h-4 rounded-full bg-blue-600 shadow-md border-2 border-white cursor-pointer transition-colors hover:bg-blue-500 before:content-[''] before:absolute before:-inset-y-2";

const RangeSlider: FC<RangeSliderProps> = ({
  label,
  min,
  max,
  value,
  onChange,
  minLabel = "Min",
  maxLabel = "Max",
  maxFloor,
}) => {
  const labelId = useId();
  const [heldLower, setHeldLower] = useState<number | null>(null);
  const [heldUpper, setHeldUpper] = useState<number | null>(null);
  const upperFloor = Math.min(max, Math.max(min, maxFloor ?? min));

  const emit = (lower: number, upper: number) => {
    const nextUpper = Math.min(max, Math.max(upperFloor, upper));
    onChange([Math.min(Math.max(min, lower), nextUpper), nextUpper]);
  };

  const handleLowerInput = (next: number) => {
    const base = heldUpper ?? value[1];
    setHeldLower(null);
    setHeldUpper(next > base ? base : null);
    emit(next, Math.max(base, next));
  };

  const handleUpperInput = (next: number) => {
    const base = heldLower ?? value[0];
    setHeldUpper(null);
    setHeldLower(next < base ? base : null);
    emit(Math.min(base, next), next);
  };

  return (
    <div role="group" aria-labelledby={labelId} className="flex flex-col gap-2">
      <span id={labelId} className="text-white">
        {label}
      </span>

      <RadixSlider.Root
        className="relative flex items-center select-none touch-none w-full h-8"
        min={min}
        max={max}
        step={1}
        value={value}
        onValueChange={([lower, upper]) => {
          setHeldLower(null);
          setHeldUpper(null);
          emit(lower, upper);
        }}
      >
        <RadixSlider.Track className="relative grow rounded-full h-1.5 bg-gray-600">
          <RadixSlider.Range className="absolute rounded-full h-full bg-blue-600" />
        </RadixSlider.Track>

        <RadixSlider.Thumb
          className={`${THUMB_CLASS} before:-left-3 before:right-0`}
          aria-label={minLabel}
        />
        <RadixSlider.Thumb
          className={`${THUMB_CLASS} before:left-0 before:-right-3`}
          aria-label={maxLabel}
        />
      </RadixSlider.Root>

      <div className="flex justify-between text-xs text-gray-500">
        <span>{min}</span>
        <span>{max}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <NumberInput
          label={minLabel}
          value={value[0]}
          min={min}
          max={max}
          onChange={handleLowerInput}
        />
        <NumberInput
          label={maxLabel}
          value={value[1]}
          min={upperFloor}
          max={max}
          onChange={handleUpperInput}
        />
      </div>
    </div>
  );
};

export default RangeSlider;
