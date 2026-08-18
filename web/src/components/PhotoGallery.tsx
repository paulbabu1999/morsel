/** Meal photos: one big image, or a grid when a meal has several (e.g. the
 *  finished dish plus the ingredients that went into it). */
export function PhotoGallery({ photos, alt }: { photos: string[]; alt: string }) {
  if (!photos.length) return null;
  if (photos.length === 1) {
    return (
      <img
        src={photos[0]}
        alt={alt}
        style={{
          width: "100%",
          aspectRatio: "16 / 9",
          objectFit: "cover",
          borderRadius: "var(--r)",
          marginBottom: 16,
        }}
      />
    );
  }
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
        gap: 8,
        marginBottom: 16,
      }}
    >
      {photos.map((src, i) => (
        <img
          key={i}
          src={src}
          alt={`${alt} — photo ${i + 1}`}
          style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "cover", borderRadius: "var(--r-sm)" }}
        />
      ))}
    </div>
  );
}
