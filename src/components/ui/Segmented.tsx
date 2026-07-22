import { NeuButton } from "./NeuButton";

interface Option {
  value: string;
  label: string;
}

/** 単一選択のボタン群（ニューモーフィズム）。ついぼの各選択項目などで使う。 */
export function Segmented({
  options,
  value,
  onChange,
}: {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <NeuButton key={o.value} active={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </NeuButton>
      ))}
    </div>
  );
}
