import { KnownIconType } from "@charcoal-ui/icons";
import { ButtonHTMLAttributes } from "react";
type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  iconName: keyof KnownIconType;
  isProcessing: boolean;
  label?: string;
};

export const IconButton = ({
  iconName,
  isProcessing,
  label,
  ...rest
}: Props) => {
  const sizeClass = label ? "px-2 py-1" : "h-8 w-8 p-1";

  return (
    <button
      {...rest}
      className={`bg-primary hover:bg-primary-hover active:bg-primary-press disabled:bg-primary-disabled text-white rounded-lg text-sm text-center inline-flex items-center justify-center leading-none mr-2 ${sizeClass}
        ${rest.className}
      `}
    >
      <span className="inline-flex items-center justify-center leading-none align-middle">
        {isProcessing ? (
          <pixiv-icon name={"24/Dot"} scale="1"></pixiv-icon>
        ) : (
          <pixiv-icon name={iconName} scale="1"></pixiv-icon>
        )}
      </span>
      {label && <div className="mx-2 font-bold">{label}</div>}
    </button>
  );
};
