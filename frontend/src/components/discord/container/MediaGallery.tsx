import { useCallback, useEffect, useId, useState } from "react";
import DismissibleModal from "@/components/modal-primitives/DismissibleModal";

interface MediaGalleryProps {
  items?: Array<{
    spoiler?: boolean;
    description?: string;
    media?: {
      url: string;
    };
  }>;
}

export default function MediaGallery({ items = [] }: MediaGalleryProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [modalImage, setModalImage] = useState({ src: "", alt: "" });
  const titleId = useId();

  const handleImageClick = useCallback((src: string, alt: string) => {
    setModalImage({ src, alt });
    setModalOpen(true);
  }, []);

  const handleModalClose = useCallback(() => setModalOpen(false), []);

  // The modal primitive handles focus, Escape and focus return but not page scroll.
  useEffect(() => {
    if (!modalOpen) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [modalOpen]);

  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-2 my-2 max-w-full">
        {items.map((item, index) => {
          const alt = item.description || "Image";
          return (
            <button
              type="button"
              key={index}
              onClick={() => item.media?.url && handleImageClick(item.media.url, alt)}
              className={`media-item relative overflow-hidden rounded h-25 cursor-pointer ${
                item.spoiler ? "blur hover:blur-none focus-visible:blur-none" : ""
              }`}
            >
              {item.spoiler && <span className="sr-only">Spoiler </span>}
              {item.media && item.media.url && (
                <img
                  src={item.media.url}
                  alt={alt}
                  className="w-full h-full object-cover transition-transform duration-300 hover:scale-110 active:scale-200 active:transition-[transform] active:duration-100"
                />
              )}
            </button>
          );
        })}
      </div>

      <DismissibleModal
        isOpen={modalOpen}
        onClose={handleModalClose}
        ariaLabelledBy={titleId}
        className="max-w-4xl"
      >
        <h2 id={titleId} className="sr-only">
          Image preview
        </h2>
        <img
          src={modalImage.src}
          alt={modalImage.alt}
          className="block max-w-full max-h-[80vh] mx-auto rounded"
        />
      </DismissibleModal>
    </>
  );
}
