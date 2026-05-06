import { useRef, useState } from "react";
import { ImagePlus, X, Star, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ImageUploaderProps {
  images: string[];
  onChange: (images: string[]) => void;
  disabled?: boolean;
  maxImages?: number;
  maxSizeMB?: number;
}

async function compressImage(file: File, maxSizeMB: number): Promise<string> {
  // Skip compression if already small enough
  if (file.size <= maxSizeMB * 1024 * 1024 * 0.8) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target!.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      const maxWidth = 1200;
      let { width, height } = img;
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = reject;
    img.src = url;
  });
}

export function ImageUploader({
  images,
  onChange,
  disabled = false,
  maxImages = 10,
  maxSizeMB = 5,
}: ImageUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const processFiles = async (files: File[]) => {
    setErrors([]);
    const remaining = maxImages - images.length;
    if (remaining <= 0) {
      setErrors([`Maximum ${maxImages} images allowed.`]);
      return;
    }

    const toProcess = files.slice(0, remaining);
    const errs: string[] = [];
    const valid: File[] = [];

    for (const file of toProcess) {
      if (!file.type.startsWith("image/")) {
        errs.push(`${file.name}: not an image file.`);
        continue;
      }
      if (file.size > maxSizeMB * 1024 * 1024) {
        errs.push(`${file.name}: exceeds ${maxSizeMB}MB limit.`);
        continue;
      }
      valid.push(file);
    }

    if (errs.length) setErrors(errs);
    if (!valid.length) return;

    setCompressing(true);
    try {
      const compressed = await Promise.all(valid.map((f) => compressImage(f, maxSizeMB)));
      onChange([...images, ...compressed]);
    } catch {
      setErrors(["Failed to process one or more images."]);
    } finally {
      setCompressing(false);
    }
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    await processFiles(files);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    await processFiles(files);
  };

  const removeImage = (index: number) => {
    onChange(images.filter((_, i) => i !== index));
  };

  const promoteTocover = (index: number) => {
    const next = [...images];
    const [item] = next.splice(index, 1);
    next.unshift(item);
    onChange(next);
  };

  // Drag-to-reorder
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) return;
    const next = [...images];
    const [item] = next.splice(dragIndex, 1);
    next.splice(index, 0, item);
    setDragIndex(index);
    onChange(next);
  };

  const handleDragEnd = () => setDragIndex(null);

  const canAddMore = images.length < maxImages && !disabled;

  return (
    <div className="space-y-3">
      {/* Drop zone (shown when no images or always as an add-more strip) */}
      {images.length === 0 && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => !disabled && fileInputRef.current?.click()}
          className={cn(
            "border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors",
            dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        >
          {compressing ? (
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          ) : (
            <ImagePlus className="h-8 w-8 text-muted-foreground" />
          )}
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">
              {compressing ? "Compressing images…" : "Drop photos here or click to browse"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              JPG, PNG, WebP · Max {maxSizeMB}MB each · Up to {maxImages} photos
            </p>
          </div>
        </div>
      )}

      {/* Image grid */}
      {images.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {images.map((src, i) => (
            <div
              key={i}
              draggable={!disabled}
              onDragStart={(e) => handleDragStart(e, i)}
              onDragOver={(e) => handleDragOver(e, i)}
              onDragEnd={handleDragEnd}
              className={cn(
                "relative aspect-[4/3] rounded-lg overflow-hidden group border-2 transition-all",
                dragIndex === i ? "border-primary opacity-60 scale-95" : "border-transparent",
                !disabled && "cursor-grab active:cursor-grabbing"
              )}
            >
              <img src={src} alt="" className="w-full h-full object-cover" draggable={false} />

              {/* Cover badge */}
              {i === 0 && (
                <div className="absolute top-1.5 left-1.5 bg-primary text-primary-foreground text-[10px] font-semibold px-1.5 py-0.5 rounded">
                  COVER
                </div>
              )}

              {/* Actions (shown on hover) */}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-start justify-end p-1.5 gap-1">
                {/* Promote to cover */}
                {i > 0 && (
                  <button
                    type="button"
                    onClick={() => promoteTocover(i)}
                    disabled={disabled}
                    title="Set as cover"
                    className="w-6 h-6 rounded-full bg-black/60 hover:bg-yellow-500 text-white flex items-center justify-center transition-colors"
                  >
                    <Star className="h-3 w-3" />
                  </button>
                )}
                {/* Remove */}
                <button
                  type="button"
                  onClick={() => removeImage(i)}
                  disabled={disabled}
                  title="Remove"
                  className="w-6 h-6 rounded-full bg-black/60 hover:bg-destructive text-white flex items-center justify-center transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}

          {/* Add more tile */}
          {canAddMore && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              disabled={disabled || compressing}
              className={cn(
                "aspect-[4/3] rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-1.5 text-muted-foreground transition-colors",
                dragOver ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-primary/50 hover:text-primary",
                (disabled || compressing) && "opacity-50 cursor-not-allowed"
              )}
            >
              {compressing ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <ImagePlus className="h-5 w-5" />
                  <span className="text-xs">Add Photo</span>
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* Errors */}
      {errors.length > 0 && (
        <div className="space-y-1">
          {errors.map((err, i) => (
            <p key={i} className="text-xs text-destructive">{err}</p>
          ))}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileInput}
      />
    </div>
  );
}
