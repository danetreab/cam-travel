import { cn } from "@/lib/utils"

export type GalleryItem = {
  src: string
  alt: string
  kind?: "image" | "video"
}

export type GallerySection = {
  type?: "grid"
  items: Array<GalleryItem>
}

const Gallery = ({
  sections,
  onOpenImage,
}: {
  sections: Array<GallerySection>
  // Index into the flat list of *images* (videos excluded), matching what's
  // passed to the controlled PhotoSlider.
  onOpenImage?: (imageIndex: number) => void
}) => {
  // Walk sections in render order and assign each image its position in the
  // flat image-only list, so the lightbox opens on the right photo.
  let cursor = 0
  return (
    <section>
      <div className="grid gap-4 md:grid-cols-2">
        {sections.map((section, sectionIndex) => {
          const isGrid = section.type === "grid"
          const aspect = isGrid ? "aspect-square" : "aspect-[16/9]"
          return (
            <div
              key={sectionIndex}
              className={cn({ "grid grid-cols-2 gap-4": isGrid })}
            >
              {section.items.map((item, itemIndex) => {
                if (item.kind === "video") {
                  return (
                    <VideoTile
                      key={itemIndex}
                      item={item}
                      aspect={aspect}
                    />
                  )
                }
                const imageIndex = cursor++
                return (
                  <ImageTile
                    key={itemIndex}
                    item={item}
                    aspect={aspect}
                    onClick={() => onOpenImage?.(imageIndex)}
                  />
                )
              })}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function ImageTile({
  item,
  aspect,
  onClick,
}: {
  item: GalleryItem
  aspect: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("block h-full w-full overflow-hidden", aspect)}
      aria-label={`Open ${item.alt}`}
    >
      <img
        src={item.src}
        alt={item.alt}
        loading="lazy"
        draggable={false}
        className="h-full w-full cursor-zoom-in bg-muted object-cover"
      />
    </button>
  )
}

function VideoTile({
  item,
  aspect,
}: {
  item: GalleryItem
  aspect: string
}) {
  return (
    <video
      src={item.src}
      controls
      playsInline
      className={cn("h-full w-full bg-muted object-cover", aspect)}
      aria-label={item.alt}
    />
  )
}

export default Gallery
