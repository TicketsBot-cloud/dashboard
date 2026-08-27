import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faImage } from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";

interface ImageWithFallbackProps {
  src: string | null | undefined;
  alt: string;
  className?: string;
  fallbackIcon?: IconDefinition;
  fallbackClassName?: string;
  fallbackIconClassName?: string;
}

export default function ImageWithFallback({
  src,
  alt,
  className = "",
  fallbackIcon = faImage,
  fallbackClassName = "bg-gray-700",
  fallbackIconClassName = "text-gray-400",
}: ImageWithFallbackProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (!src || failedSrc === src) {
    return (
      <div
        className={`${className} ${fallbackClassName} flex items-center justify-center`}
        role={alt ? "img" : undefined}
        aria-label={alt || undefined}
        aria-hidden={alt ? undefined : true}
      >
        <FontAwesomeIcon icon={fallbackIcon} className={fallbackIconClassName} aria-hidden="true" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={`${className} object-cover`}
      onError={() => setFailedSrc(src)}
    />
  );
}
