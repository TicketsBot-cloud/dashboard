import { useEffect, useRef, useState, useCallback } from "react";
import Button from "@/components/Button";

interface MediaGalleryProps {
  items?: Array<{
    spoiler?: boolean;
    media?: {
      url: string;
    };
  }>;
}

export default function MediaGallery({ items = [] }: MediaGalleryProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [modalImageSrc, setModalImageSrc] = useState("");
  const modalRef = useRef<HTMLDivElement>(null);
  const galleryRef = useRef<HTMLDivElement>(null);

  const handleImageClick = useCallback((imageSrc: string) => {
    setModalOpen(true);
    setModalImageSrc(imageSrc);
  }, []);

  const handleModalClose = useCallback(() => {
    setModalOpen(false);
    setModalImageSrc("");
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && modalOpen) {
        handleModalClose();
      }
    };

    if (modalOpen) {
      document.addEventListener("keydown", handleKeyDown);
      // Prevent body scroll when modal is open
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [modalOpen, handleModalClose]);

  return (
    <>
      <div
        ref={galleryRef}
        className="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-2 my-2 max-w-full"
      >
        {items && items.length > 0 && (
          <>
            {items.map((item, index) => (
              <button
                type="button"
                key={index}
                onClick={() => item.media?.url && handleImageClick(item.media.url)}
                className={`media-item relative overflow-hidden rounded h-25 cursor-pointer ${
                  item.spoiler ? "blur hover:blur-none" : ""
                }`}
              >
                {item.media && item.media.url && (
                  <img
                    src={item.media.url}
                    alt="Media"
                    className="w-full h-full object-cover transition-transform duration-300 hover:scale-110 active:scale-200 active:transition-[transform] active:duration-100"
                  />
                )}
              </button>
            ))}
          </>
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <div
          ref={modalRef}
          className="fixed inset-0 z-1000 bg-black/80 flex items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-label="Image preview"
        >
          {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
          <div className="absolute inset-0" onClick={handleModalClose} />
          <Button
            variant="ghost"
            size="icon"
            onClick={handleModalClose}
            className="absolute top-5 right-9 text-gray-100 text-4xl font-bold hover:text-gray-400"
            aria-label="Close modal"
            title="Close modal"
          >
            &times;
          </Button>
          <img
            src={modalImageSrc}
            alt="Media preview"
            className="relative block max-w-[90%] max-h-[90%] rounded shadow-[0_0_20px_rgba(0,0,0,0.5)]"
          />
        </div>
      )}
    </>
  );
}
