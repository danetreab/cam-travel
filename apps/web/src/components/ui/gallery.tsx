import { PhotoProvider, PhotoView } from "react-photo-view"
import "react-photo-view/dist/react-photo-view.css"
import { cn } from "@/lib/utils"

type GalleryItem = {
  src: string
  alt: string
  kind?: "image" | "video"
}

type GallerySection = {
  type?: "grid"
  images: GalleryItem[]
}

const Gallery = ({
  sections,
  onVisibleChange,
}: {
  sections: GallerySection[]
  onVisibleChange?: (visible: boolean) => void
}) => {
  return (
    <PhotoProvider
      onVisibleChange={(visible) => onVisibleChange?.(visible)}
    >
      <section>
        <div className="grid gap-4 md:grid-cols-2">
          {sections.map((section, sectionIndex) => {
            const isGrid = section.type === "grid"
            return (
              <div
                key={sectionIndex}
                className={cn({ "grid grid-cols-2 gap-4": isGrid })}
              >
                {section.images.map((item, imageIndex) => (
                  <GalleryTile
                    key={imageIndex}
                    item={item}
                    aspect={isGrid ? "aspect-square" : "aspect-[16/9]"}
                  />
                ))}
              </div>
            )
          })}
        </div>
      </section>
    </PhotoProvider>
  )
}

function GalleryTile({
  item,
  aspect,
}: {
  item: GalleryItem
  aspect: string
}) {
  const className = cn("h-full w-full bg-muted object-cover", aspect)
  if (item.kind === "video") {
    return (
      <video
        src={item.src}
        controls
        playsInline
        className={className}
        aria-label={item.alt}
      />
    )
  }
  return (
    <PhotoView src={item.src}>
      <img
        src={item.src}
        alt={item.alt}
        loading="lazy"
        className={cn(className, "cursor-zoom-in")}
      />
    </PhotoView>
  )
}

export default Gallery
