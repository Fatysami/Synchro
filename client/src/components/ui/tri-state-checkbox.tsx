import * as React from "react";
import { cn } from "@/lib/utils";
import { CheckIcon, MinusIcon } from "lucide-react";

export type TriStateCheckboxState = -1 | 0 | 1;

interface TriStateCheckboxProps extends React.HTMLAttributes<HTMLButtonElement> {
  state: TriStateCheckboxState;
  onStateChange: (newState: TriStateCheckboxState) => void;
  disabled?: boolean;
}

export function TriStateCheckbox({
  state,
  onStateChange,
  disabled,
  className,
  ...props
}: TriStateCheckboxProps) {
  const handleClick = () => {
    if (disabled) return;
    // Cycle through states: -1 (invisible) -> 0 (interdit) -> 1 (autorisé)
    const nextState = state === 1 ? -1 : state + 1;
    onStateChange(nextState as TriStateCheckboxState);
  };

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={state === 1}
      data-state={state}
      disabled={disabled}
      className={cn(
        "h-4 w-4 rounded border border-primary flex items-center justify-center",
        state === 1 && "bg-primary",
        state === 0 && "bg-destructive",
        state === -1 && "bg-gray-300",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
      onClick={handleClick}
      {...props}
    >
      {state === 1 && <CheckIcon className="h-3 w-3 text-primary-foreground" />}
      {state === 0 && <MinusIcon className="h-3 w-3 text-destructive-foreground" />}
      {state === -1 && <MinusIcon className="h-3 w-3 text-gray-500" />}
    </button>
  );
}
